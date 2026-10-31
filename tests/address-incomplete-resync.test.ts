/**
 * ADDRESS_INCOMPLETE：改完 Shopify 地址后再 Soft
 *
 * Tip: feature/shopify-address-incomplete-resync
 * 本树无 tip#1 helper → Soft-only submit，禁止 Convert。
 */
import { describe, expect, it, vi } from "vitest";
import {
  ADDRESS_RESYNC_INTENT,
  ADDRESS_RESYNC_LABEL_EN,
  ADDRESS_RESYNC_LABEL_ZH,
  ADDRESS_RESYNC_WMS_ACTION,
  FORBIDDEN_ADDRESS_RESYNC_ACTIONS,
  SOFT_HOLD_ONLY_ON_RESYNC,
  assertAddressResyncAction,
  buildAddressResyncSoftBody,
  canResyncAddress,
  hasUsableShippingAddress,
  isAddressIncompleteFailure,
  recordAddressIncomplete,
  resyncAddressAndSoftSubmit,
  type AddressResyncDeps,
  type FoAddressRecord,
  type ShopifyShippingAddress,
  type WmsSoftSubmitLike,
} from "../app/fulfillment/address-incomplete-resync.server";
import { addressResyncAction } from "../app/fulfillment/address-resync-ui";

const FIXED_ADDRESS: ShopifyShippingAddress = {
  firstName: "Ada",
  lastName: "Lovelace",
  address1: "221B Baker Street",
  city: "London",
  zip: "NW1 6XE",
  country: "United Kingdom",
  countryCode: "GB",
  phone: "+44 20 7224 3688",
};

function incompleteRow(
  overrides: Partial<FoAddressRecord> = {},
): FoAddressRecord {
  return {
    fulfillmentOrderId: "gid://shopify/FulfillmentOrder/5875767738575",
    externalNo: "SFO5875767738575",
    shop: "test2026-3.myshopify.com",
    orderId: "gid://shopify/Order/1003",
    status: "ADDRESS_INCOMPLETE",
    lastErrorCode: "ADDRESS_INCOMPLETE",
    shopOrderId: "724054",
    wmsOrderNo: null,
    shopifyAccepted: true,
    ...overrides,
  };
}

function makeDeps(options?: {
  address?: ShopifyShippingAddress | null;
  foDestination?: ShopifyShippingAddress | null;
  wms?: WmsSoftSubmitLike | ((body: unknown) => WmsSoftSubmitLike);
}) {
  const submitBodies: unknown[] = [];
  const orderFetches: string[] = [];
  const foFetches: string[] = [];
  const calls: string[] = [];

  const deps: AddressResyncDeps = {
    fetchOrderShippingAddress: vi.fn(async (orderId) => {
      orderFetches.push(orderId);
      return options?.address === undefined ? FIXED_ADDRESS : options.address;
    }),
    fetchFoDestination: vi.fn(async (foId) => {
      foFetches.push(foId);
      return options?.foDestination ?? null;
    }),
    wmsSoftSubmit: vi.fn(async (body) => {
      calls.push(ADDRESS_RESYNC_WMS_ACTION);
      submitBodies.push(body);
      if (typeof options?.wms === "function") return options.wms(body);
      return (
        options?.wms ?? {
          status: "SOFT_HOLD",
          shopOrderId: "724054",
        }
      );
    }),
  };

  return { deps, submitBodies, orderFetches, foFetches, calls };
}

describe("isAddressIncompleteFailure / canResyncAddress", () => {
  it("认 ADDRESS_INCOMPLETE 状态", () => {
    expect(
      isAddressIncompleteFailure({ status: "ADDRESS_INCOMPLETE" }),
    ).toBe(true);
    expect(canResyncAddress(incompleteRow())).toBe(true);
  });

  it("认 ADDRESS_INVALID / 36057 为等价地址拒绝", () => {
    expect(
      canResyncAddress(
        incompleteRow({
          status: "SYNC_FAILED",
          lastErrorCode: "ADDRESS_INVALID",
        }),
      ),
    ).toBe(true);
    expect(
      canResyncAddress(
        incompleteRow({ status: "SYNC_FAILED", lastErrorCode: "36057" }),
      ),
    ).toBe(true);
  });

  it("认中文「地址不完整」文案", () => {
    expect(
      canResyncAddress(
        incompleteRow({
          status: "SYNC_FAILED",
          lastErrorCode: null,
          lastErrorField: "destination",
          lastErrorMessage: "收货地址不完整",
        }),
      ),
    ).toBe(true);
  });

  it("SKU / 库存 / 国家不支持 不出现按钮", () => {
    for (const lastErrorCode of [
      "SKU_NOT_MAPPED",
      "INSUFFICIENT_STOCK",
      "COUNTRY_NOT_SUPPORTED",
    ]) {
      expect(
        canResyncAddress(
          incompleteRow({ status: "SYNC_FAILED", lastErrorCode }),
        ),
      ).toBe(false);
    }
  });

  it("已确认 / 已拒 / 已发 / 已取消 不出现按钮", () => {
    for (const status of ["CONFIRMED", "REJECTED", "SHIPPED", "CANCELLED"]) {
      expect(canResyncAddress(incompleteRow({ status }))).toBe(false);
    }
  });
});

describe("addressResyncAction UI", () => {
  it("地址失败行才返回「改完地址再同步 / Re-sync address」", () => {
    const shown = addressResyncAction(incompleteRow());
    expect(shown).not.toBeNull();
    expect(shown?.intent).toBe(ADDRESS_RESYNC_INTENT);
    expect(shown?.labelZh).toBe(ADDRESS_RESYNC_LABEL_ZH);
    expect(shown?.labelEn).toBe(ADDRESS_RESYNC_LABEL_EN);
    expect(shown?.label).toBe("改完地址再同步 / Re-sync address");
    expect(shown?.label).not.toMatch(/^改$/);

    expect(
      addressResyncAction({
        status: "SYNC_FAILED",
        lastErrorCode: "SKU_NOT_MAPPED",
      }),
    ).toBeNull();
  });
});

describe("recordAddressIncomplete", () => {
  it("Soft 地址失败记 ADDRESS_INCOMPLETE，保留 shopOrderId，不写仓单号", () => {
    const link = recordAddressIncomplete(incompleteRow(), {
      errorCode: "36057",
      message: "address incomplete",
    });
    expect(link.status).toBe("ADDRESS_INCOMPLETE");
    expect(link.lastErrorCode).toBe("36057");
    expect(link.shopOrderId).toBe("724054");
    expect(link.wmsOrderNo).toBeNull();
    expect(link.externalNo).toBe("SFO5875767738575");
  });
});

describe("buildAddressResyncSoftBody", () => {
  it("同一 ExternalNo + 已有 shopOrderId + Soft-only，不 Convert", () => {
    expect(SOFT_HOLD_ONLY_ON_RESYNC).toBe(true);
    const body = buildAddressResyncSoftBody(incompleteRow(), FIXED_ADDRESS);
    expect(body.externalNo).toBe("SFO5875767738575");
    expect(body.shopOrderId).toBe("724054");
    expect(body.softHoldOnly).toBe(true);
    expect(body.convertToOutbound).toBe(false);
    expect(body.mode).toBe("SOFT_HOLD");
    expect(body.refreshAddress).toBe(true);
    expect(body.destination.address1).toBe("221B Baker Street");
    expect(body.destination.name).toBe("Ada Lovelace");
    expect(body.shippingAddress).toEqual(body.destination);
  });

  it("没有 shopOrderId 时不捏造 id，仍用同一 ExternalNo", () => {
    const body = buildAddressResyncSoftBody(
      incompleteRow({ shopOrderId: null }),
      FIXED_ADDRESS,
    );
    expect(body.shopOrderId).toBeUndefined();
    expect(body.externalNo).toBe("SFO5875767738575");
  });
});

describe("warehouse-push guard", () => {
  it.each([...FORBIDDEN_ADDRESS_RESYNC_ACTIONS])(
    "拒绝 %s",
    (action) => {
      expect(() => assertAddressResyncAction(action)).toThrow(/warehouse-push|Soft-only/);
    },
  );

  it("允许 orders/submit", () => {
    expect(() => assertAddressResyncAction("orders/submit")).not.toThrow();
  });
});

describe("resyncAddressAndSoftSubmit", () => {
  it("读当前 Shopify 订单地址，同一 ExternalNo Soft，更新已有 shopOrderId", async () => {
    const { deps, submitBodies, orderFetches, calls } = makeDeps();
    const result = await resyncAddressAndSoftSubmit(incompleteRow(), deps);

    expect(orderFetches).toEqual(["gid://shopify/Order/1003"]);
    expect(calls).toEqual(["orders/submit"]);
    expect(result.ok).toBe(true);
    expect(result.wmsCalled).toBe(true);
    expect(result.warehousePushCalled).toBe(false);
    expect(result.submitBody?.externalNo).toBe("SFO5875767738575");
    expect(result.submitBody?.shopOrderId).toBe("724054");
    expect(result.submitBody?.softHoldOnly).toBe(true);
    expect(result.submitBody?.convertToOutbound).toBe(false);
    expect(result.submitBody?.destination.address1).toBe("221B Baker Street");
    expect(result.link?.status).toBe("SOFT_HOLD");
    expect(result.link?.shopOrderId).toBe("724054");
    expect(result.link?.wmsOrderNo).toBeNull();
    expect(result.duplicateRisk).toBe(false);
    expect(submitBodies).toHaveLength(1);
  });

  it("非地址失败不打 Shopify、不打 WMS", async () => {
    const { deps } = makeDeps();
    const result = await resyncAddressAndSoftSubmit(
      incompleteRow({ status: "SYNC_FAILED", lastErrorCode: "SKU_NOT_MAPPED" }),
      deps,
    );
    expect(result.reason).toBe("not-address-incomplete");
    expect(result.attempted).toBe(false);
    expect(result.wmsCalled).toBe(false);
    expect(deps.fetchOrderShippingAddress).not.toHaveBeenCalled();
    expect(deps.wmsSoftSubmit).not.toHaveBeenCalled();
  });

  it("订单地址仍空则不 Soft，保持 ADDRESS_INCOMPLETE", async () => {
    const { deps } = makeDeps({ address: null, foDestination: null });
    const result = await resyncAddressAndSoftSubmit(incompleteRow(), deps);
    expect(result.reason).toBe("missing-shipping-address");
    expect(result.wmsCalled).toBe(false);
    expect(result.link?.status).toBe("ADDRESS_INCOMPLETE");
    expect(deps.wmsSoftSubmit).not.toHaveBeenCalled();
  });

  it("订单地址空时回退 FO destination", async () => {
    const { deps, orderFetches, foFetches } = makeDeps({
      address: { countryCode: "US" },
      foDestination: FIXED_ADDRESS,
    });
    const result = await resyncAddressAndSoftSubmit(incompleteRow(), deps);
    expect(orderFetches).toHaveLength(1);
    expect(foFetches).toEqual([
      "gid://shopify/FulfillmentOrder/5875767738575",
    ]);
    expect(result.ok).toBe(true);
    expect(result.submitBody?.destination.address1).toBe("221B Baker Street");
  });

  it("WMS 仍回地址不完整 → 保持 ADDRESS_INCOMPLETE，同一 shopOrderId", async () => {
    const { deps } = makeDeps({
      wms: {
        status: "ADDRESS_INCOMPLETE",
        errorCode: "ADDRESS_INCOMPLETE",
        shopOrderId: "724054",
        message: "address incomplete",
      },
    });
    const result = await resyncAddressAndSoftSubmit(incompleteRow(), deps);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("address-still-incomplete");
    expect(result.wmsCalled).toBe(true);
    expect(result.link?.status).toBe("ADDRESS_INCOMPLETE");
    expect(result.link?.shopOrderId).toBe("724054");
  });

  it("WMS 回了另一张 shopOrderId → 不改存，标 duplicateRisk", async () => {
    const { deps } = makeDeps({
      wms: { status: "SOFT_HOLD", shopOrderId: "999999" },
    });
    const result = await resyncAddressAndSoftSubmit(incompleteRow(), deps);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("duplicate-shop-order-blocked");
    expect(result.duplicateRisk).toBe(true);
    expect(result.link?.shopOrderId).toBe("724054");
    expect(result.link?.status).toBe("SYNC_FAILED");
  });

  it("无 shopOrderId 的地址失败仍可用同一 ExternalNo 首张 Soft", async () => {
    const { deps } = makeDeps({
      wms: { status: "SOFT_HOLD", shopOrderId: "800001" },
    });
    const result = await resyncAddressAndSoftSubmit(
      incompleteRow({ shopOrderId: null }),
      deps,
    );
    expect(result.ok).toBe(true);
    expect(result.submitBody?.shopOrderId).toBeUndefined();
    expect(result.submitBody?.externalNo).toBe("SFO5875767738575");
    expect(result.link?.shopOrderId).toBe("800001");
    expect(result.duplicateRisk).toBe(false);
  });

  it("deps 即使带 Convert 也不会被调用", async () => {
    const convert = vi.fn();
    const { deps } = makeDeps();
    const depsWithConvert = {
      ...deps,
      convert,
      createOrder: vi.fn(),
    };
    await resyncAddressAndSoftSubmit(incompleteRow(), depsWithConvert);
    expect(convert).not.toHaveBeenCalled();
    expect(depsWithConvert.createOrder).not.toHaveBeenCalled();
    expect(deps.wmsSoftSubmit).toHaveBeenCalledOnce();
  });
});

describe("hasUsableShippingAddress", () => {
  it("一行地址 + 国家即可", () => {
    expect(
      hasUsableShippingAddress({ address1: "1 Main", countryCode: "US" }),
    ).toBe(true);
    expect(hasUsableShippingAddress({ countryCode: "US" })).toBe(false);
    expect(hasUsableShippingAddress(null)).toBe(false);
  });
});
