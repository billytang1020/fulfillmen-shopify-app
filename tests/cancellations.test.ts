/**
 * Soft / SYNC_FAILED 取消：有 shopOrderId 必须先 void 店单
 *
 * Tip: feature/shopify-soft-cancel-void-shoporder
 * 证据: Guillermo RCA 2026-10-31 · Jeff RO SFO22191996371075 ShopOrder 724054
 */
import { describe, it, expect, vi } from "vitest";
import {
  NO_WMS_ORDER,
  buildWmsCancelRequest,
  cancelOne,
  hasHardWmsOrder,
  hasShopOrderDraft,
  shouldCallWmsCancel,
  type CancelDeps,
  type FoCancelRecord,
  type WmsCancelRequest,
  type WmsCancelResult,
} from "../app/fulfillment/cancellations.server.js";

function softHold(
  overrides: Partial<FoCancelRecord> = {}
): FoCancelRecord {
  return {
    fulfillmentOrderId: "gid://shopify/FulfillmentOrder/22191996371075",
    externalNo: "SFO22191996371075",
    status: "SYNC_FAILED",
    wmsOrderNo: null,
    shopOrderId: 724054,
    linkStatus: "SOFT_HOLD",
    ...overrides,
  };
}

function hardOrder(
  overrides: Partial<FoCancelRecord> = {}
): FoCancelRecord {
  return {
    fulfillmentOrderId: "gid://shopify/FulfillmentOrder/999",
    externalNo: "SFO999",
    status: "CONFIRMED",
    wmsOrderNo: "ODR-1001",
    shopOrderId: 800001,
    linkStatus: "CONFIRMED",
    ...overrides,
  };
}

function makeDeps(wmsOutcome: WmsCancelResult["outcome"] = "CANCELLED") {
  const wmsCalls: WmsCancelRequest[] = [];
  const acceptCalls: Array<{ fulfillmentOrderId: string; message: string }> =
    [];
  const rejectCalls: Array<{ fulfillmentOrderId: string; message: string }> =
    [];

  const deps: CancelDeps = {
    wmsCancel: vi.fn(async (req) => {
      wmsCalls.push(req);
      return { outcome: wmsOutcome };
    }),
    acceptCancellation: vi.fn(async (args) => {
      acceptCalls.push(args);
      return { accepted: true as const, message: args.message };
    }),
    rejectCancellation: vi.fn(async (args) => {
      rejectCalls.push(args);
      return { rejected: true as const, message: args.message };
    }),
  };

  return { deps, wmsCalls, acceptCalls, rejectCalls };
}

describe("shouldCallWmsCancel / 身份判断", () => {
  it("Soft + shopOrderId → 必须打 WMS cancel（旧短路会漏）", () => {
    expect(shouldCallWmsCancel(softHold())).toBe(true);
    expect(hasShopOrderDraft(softHold())).toBe(true);
    expect(hasHardWmsOrder(softHold())).toBe(false);
  });

  it("Soft 无 shopOrderId → 不打 WMS cancel", () => {
    const rec = softHold({ shopOrderId: null });
    expect(shouldCallWmsCancel(rec)).toBe(false);
    expect(hasShopOrderDraft(rec)).toBe(false);
  });

  it("硬出库 wmsOrderNo → 打 WMS cancel", () => {
    expect(shouldCallWmsCancel(hardOrder())).toBe(true);
    expect(hasHardWmsOrder(hardOrder())).toBe(true);
  });

  it("SYNC_FAILED 本身不否决 WMS cancel（NO_WMS_ORDER 不再短路）", () => {
    expect(NO_WMS_ORDER).toContain("SYNC_FAILED");
    expect(shouldCallWmsCancel(softHold({ status: "SYNC_FAILED" }))).toBe(
      true
    );
  });
});

describe("buildWmsCancelRequest", () => {
  it("Soft 草稿: ShopOrderId + SOFT_HOLD + VoidUnconverted，无出库号", () => {
    const req = buildWmsCancelRequest(softHold());
    expect(req.shopOrderId).toBe(724054);
    expect(req.externalNo).toBe("SFO22191996371075");
    expect(req.wmsOrderNo).toBeNull();
    expect(req.linkStatus).toBe("SOFT_HOLD");
    expect(req.voidUnconverted).toBe(true);
  });

  it("Soft 未写 linkStatus 时默认 SOFT_HOLD（现网 OrderLink 字面）", () => {
    const req = buildWmsCancelRequest(softHold({ linkStatus: null }));
    expect(req.linkStatus).toBe("SOFT_HOLD");
    expect(req.voidUnconverted).toBe(true);
  });

  it("硬单: 带 wmsOrderNo，不走 VoidUnconverted", () => {
    const req = buildWmsCancelRequest(hardOrder());
    expect(req.wmsOrderNo).toBe("ODR-1001");
    expect(req.shopOrderId).toBe(800001);
    expect(req.voidUnconverted).toBe(false);
  });
});

describe("cancelOne — Soft 有 shopOrderId → 先 WMS void 再 accept", () => {
  it("Jeff #1001: ShopOrder 724054 / SYNC_FAILED → 调用 WMS cancel", async () => {
    const { deps, wmsCalls, acceptCalls, rejectCalls } = makeDeps("CANCELLED");
    const result = await cancelOne(softHold(), deps);

    expect(deps.wmsCancel).toHaveBeenCalledTimes(1);
    expect(wmsCalls[0]?.shopOrderId).toBe(724054);
    expect(wmsCalls[0]?.voidUnconverted).toBe(true);
    expect(wmsCalls[0]?.linkStatus).toBe("SOFT_HOLD");
    expect(wmsCalls[0]?.wmsOrderNo).toBeNull();

    expect(deps.acceptCancellation).toHaveBeenCalledTimes(1);
    expect(acceptCalls[0]?.message).toContain("Shop-order draft voided");
    expect(rejectCalls).toHaveLength(0);

    expect(result.path).toBe("soft-shop-order");
    expect(result.wmsCalled).toBe(true);
    expect(result.accepted).toBe(true);
    expect(result.shopifyAction).toBe("accept");
  });

  it("WMS REJECTED 时不 accept Shopify（避免再留店单草稿）", async () => {
    const { deps } = makeDeps("REJECTED");
    const result = await cancelOne(softHold(), deps);

    expect(deps.wmsCancel).toHaveBeenCalledTimes(1);
    expect(deps.acceptCancellation).not.toHaveBeenCalled();
    expect(deps.rejectCancellation).toHaveBeenCalledTimes(1);
    expect(result.accepted).toBe(false);
    expect(result.shopifyAction).toBe("reject");
  });

  it("WMS PENDING 时不 accept Shopify", async () => {
    const { deps } = makeDeps("PENDING");
    const result = await cancelOne(softHold(), deps);

    expect(deps.wmsCancel).toHaveBeenCalledTimes(1);
    expect(deps.acceptCancellation).not.toHaveBeenCalled();
    expect(result.shopifyAction).toBe("none");
    expect(result.accepted).toBe(false);
  });
});

describe("cancelOne — Soft 无 shopOrderId → 不打 WMS，只 accept", () => {
  it("SYNC_FAILED 且无 shopOrderId / 无 wmsOrderNo → accept-only", async () => {
    const { deps } = makeDeps();
    const rec = softHold({ shopOrderId: null, wmsOrderNo: null });
    const result = await cancelOne(rec, deps);

    expect(deps.wmsCancel).not.toHaveBeenCalled();
    expect(deps.acceptCancellation).toHaveBeenCalledTimes(1);
    expect(result.path).toBe("accept-only");
    expect(result.wmsCalled).toBe(false);
    expect(result.message).toBe(
      "No warehouse order was created; cancelled."
    );
  });

  it("空记录 → accept-only，不打 WMS", async () => {
    const { deps } = makeDeps();
    const result = await cancelOne(null, deps);

    expect(deps.wmsCancel).not.toHaveBeenCalled();
    expect(deps.acceptCancellation).toHaveBeenCalledTimes(1);
    expect(result.path).toBe("accept-only");
  });

  it("RECEIVED 无身份字段 → accept-only（保持旧无仓单路径）", async () => {
    const { deps } = makeDeps();
    const result = await cancelOne(
      {
        fulfillmentOrderId: "gid://shopify/FulfillmentOrder/1",
        externalNo: "SFO1",
        status: "RECEIVED",
      },
      deps
    );

    expect(deps.wmsCancel).not.toHaveBeenCalled();
    expect(result.path).toBe("accept-only");
    expect(result.accepted).toBe(true);
  });
});

describe("cancelOne — 硬出库路径不变", () => {
  it("有 wmsOrderNo → 走 hard-wms，WMS cancel 带出库号", async () => {
    const { deps, wmsCalls } = makeDeps("CANCELLED");
    const rec = hardOrder();
    const result = await cancelOne(rec, deps);

    expect(deps.wmsCancel).toHaveBeenCalledTimes(1);
    expect(wmsCalls[0]?.wmsOrderNo).toBe("ODR-1001");
    expect(wmsCalls[0]?.voidUnconverted).toBe(false);
    expect(deps.acceptCancellation).toHaveBeenCalledTimes(1);
    expect(result.path).toBe("hard-wms");
    expect(result.accepted).toBe(true);
    expect(result.message).toBe("Warehouse order cancelled.");
  });

  it("同时有 wmsOrderNo 与 shopOrderId 时走硬单（不改成 Soft void）", async () => {
    const { deps, wmsCalls } = makeDeps("CANCELLED");
    await cancelOne(
      hardOrder({ shopOrderId: 724054, linkStatus: "SOFT_HOLD" }),
      deps
    );

    expect(wmsCalls[0]?.wmsOrderNo).toBe("ODR-1001");
    expect(wmsCalls[0]?.voidUnconverted).toBe(false);
  });

  it("硬单 WMS REJECTED → 不 accept", async () => {
    const { deps } = makeDeps("REJECTED");
    const result = await cancelOne(hardOrder(), deps);

    expect(deps.acceptCancellation).not.toHaveBeenCalled();
    expect(result.path).toBe("hard-wms");
    expect(result.accepted).toBe(false);
  });
});
