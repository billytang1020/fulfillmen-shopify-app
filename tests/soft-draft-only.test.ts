import { describe, expect, it, vi } from "vitest";
import {
  ALLOWED_WMS_INTAKE_ACTIONS,
  FORBIDDEN_WAREHOUSE_PUSH_ACTIONS,
  SOFT_DRAFT_ONLY,
  WMS_SHOP_AUTO_PUSH_URL,
  assertAllowedWmsAction,
  buildSoftDraftSubmitOptions,
  interpretSoftDraftSubmitResult,
  isForbiddenWarehousePushAction,
  persistSoftDraftLink,
  submitShopDraftOnly,
  type WmsIntakeClient,
} from "../app/fulfillment/soft-draft-only.server";

const FO = {
  fulfillmentOrderId: "gid://shopify/FulfillmentOrder/5875767738575",
  shop: "test2026-3.myshopify.com",
  orderId: "gid://shopify/Order/1003",
  externalNo: "SFO5875767738575",
};

function mockClient(submitImpl?: WmsIntakeClient["submit"]): WmsIntakeClient & {
  calls: string[];
} {
  const calls: string[] = [];
  return {
    calls,
    async submit(body) {
      calls.push("orders/submit");
      if (submitImpl) return submitImpl(body);
      return { status: "SOFT_HOLD", shopOrderId: "718743" };
    },
    async createOrder() {
      calls.push("CreateOrder");
      throw new Error("CreateOrder must not be called");
    },
    async convert() {
      calls.push("Convert");
      throw new Error("Convert must not be called");
    },
    async confirm() {
      calls.push("Confirm");
      throw new Error("Confirm must not be called");
    },
    async submitSingle() {
      calls.push("SubmitSingle");
      throw new Error("SubmitSingle must not be called");
    },
    async upgradeOrReplaySoftHold() {
      calls.push("UpgradeOrReplaySoftHold");
      throw new Error("UpgradeOrReplaySoftHold must not be called");
    },
  };
}

describe("soft-draft-only policy", () => {
  it("stays on so clean orders cannot silently Convert again", () => {
    expect(SOFT_DRAFT_ONLY).toBe(true);
  });

  it("points merchants at the existing WMS auto-push UI", () => {
    expect(WMS_SHOP_AUTO_PUSH_URL).toBe(
      "https://wms.fulfillmen.com/user/shop/shop_order.aspx",
    );
  });

  it("keeps orders/submit as the only allowed intake action", () => {
    expect(ALLOWED_WMS_INTAKE_ACTIONS).toEqual(["orders/submit", "wms.submit"]);
    expect(() => assertAllowedWmsAction("orders/submit")).not.toThrow();
    expect(() => assertAllowedWmsAction("wms.submit")).not.toThrow();
  });
});

describe("buildSoftDraftSubmitOptions", () => {
  it("asks WMS for SoftHold only — no Convert/Confirm", () => {
    const options = buildSoftDraftSubmitOptions(FO.externalNo);
    expect(options.externalNo).toBe("SFO5875767738575");
    expect(options.softHoldOnly).toBe(true);
    expect(options.convertToOutbound).toBe(false);
    expect(options.mode).toBe("SOFT_HOLD");
  });
});

describe("warehouse-push guard", () => {
  it.each([...FORBIDDEN_WAREHOUSE_PUSH_ACTIONS])(
    "classifies %s as warehouse / outbound push",
    (action) => {
      expect(isForbiddenWarehousePushAction(action)).toBe(true);
      expect(() => assertAllowedWmsAction(action)).toThrow(/warehouse-push/);
    },
  );

  it("rejects CreateOrder.aspx query strings (public outbound API)", () => {
    expect(() =>
      assertAllowedWmsAction("/api-json/CreateOrder.aspx?Key=redacted"),
    ).toThrow(/warehouse-push/);
  });

  it("does not treat CreateShopOrder as a warehouse push", () => {
    // Official path is still orders/submit; CreateShopOrder is a shop-draft API.
    expect(isForbiddenWarehousePushAction("CreateShopOrder")).toBe(false);
  });
});

describe("persistSoftDraftLink", () => {
  it("records shopOrderId and leaves warehouse fields empty", () => {
    const link = persistSoftDraftLink(FO, "718743");
    expect(link.shopOrderId).toBe("718743");
    expect(link.externalNo).toBe(FO.externalNo);
    expect(link.fulfillmentOrderId).toBe(FO.fulfillmentOrderId);
    expect(link.wmsOrderNo).toBeNull();
    expect(link.wmsOutboundIds).toEqual([]);
    expect(link.status).toBe("SOFT_HOLD");
  });
});

describe("interpretSoftDraftSubmitResult", () => {
  it("accepts SoftHold with shopOrderId (existing soft path)", () => {
    const result = interpretSoftDraftSubmitResult(FO, {
      status: "SOFT_HOLD",
      shopOrderId: "718743",
    });
    expect(result.ok).toBe(true);
    expect(result.wmsNotAligned).toBe(false);
    expect(result.link.shopOrderId).toBe("718743");
    expect(result.link.wmsOrderNo).toBeNull();
    expect(result.link.wmsOutboundIds).toEqual([]);
  });

  it("does not persist outbound ids if WMS still Converted (needs Martin flag)", () => {
    const result = interpretSoftDraftSubmitResult(FO, {
      status: "CONFIRMED",
      shopOrderId: "718743",
      wmsOrderNo: "M100000000180754",
      outboundIds: ["ODR-1"],
    });
    expect(result.wmsNotAligned).toBe(true);
    expect(result.link.shopOrderId).toBe("718743");
    expect(result.link.wmsOrderNo).toBeNull();
    expect(result.link.wmsOutboundIds).toEqual([]);
  });
});

describe("submitShopDraftOnly", () => {
  it("still calls Soft create (orders/submit) and records shopOrderId", async () => {
    const submit = vi.fn(async () => ({
      status: "SOFT_HOLD" as const,
      shopOrderId: "718743",
    }));
    const client = mockClient(submit);

    const result = await submitShopDraftOnly(client, FO);

    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith({
      externalNo: FO.externalNo,
      softHoldOnly: true,
      convertToOutbound: false,
      mode: "SOFT_HOLD",
    });
    expect(result.submitCalled).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.link.shopOrderId).toBe("718743");
  });

  it("does not call warehouse / outbound push APIs", async () => {
    const client = mockClient();
    const result = await submitShopDraftOnly(client, FO);

    expect(client.calls).toEqual(["orders/submit"]);
    expect(client.calls).not.toContain("CreateOrder");
    expect(client.calls).not.toContain("Convert");
    expect(client.calls).not.toContain("Confirm");
    expect(client.calls).not.toContain("SubmitSingle");
    expect(client.calls).not.toContain("UpgradeOrReplaySoftHold");
    expect(result.warehousePushCalled).toBe(false);
    expect(result.link.wmsOrderNo).toBeNull();
    expect(result.link.wmsOutboundIds).toEqual([]);
  });

  it("still records shopOrderId when WMS returns a clean-order SoftHold", async () => {
    const client = mockClient(async () => ({
      status: "SOFT_ACCEPTED",
      shopOrderId: "90001",
      wmsOrderNo: null,
    }));

    const result = await submitShopDraftOnly(client, FO);

    expect(result.ok).toBe(true);
    expect(result.wmsNotAligned).toBe(false);
    expect(result.link.shopOrderId).toBe("90001");
  });
});
