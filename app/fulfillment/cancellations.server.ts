/**
 * Shopify 履约取消 — Soft / 未转出库店单必须先 void WMS 草稿
 *
 * Tip id: feature/shopify-soft-cancel-void-shoporder
 * 契约: shopify_node_wms_contract_v1.md §5 cancel · v1.7.8 Soft
 *
 * 根因 (Guillermo RCA 2026-10-31 + Jeff RO #1001):
 *   Soft 成功后 FO=SYNC_FAILED、wmsOrderNo=null、shopOrderId 有值。
 *   旧短路把 SYNC_FAILED / !wmsOrderNo 当成「无仓单」，直接 accept Shopify，
 *   不调 POST …/orders/cancel → MZL_ShopOrders 留 Status=0 草稿。
 *
 * 第一性: 「WMS 有没有东西要作废」看身份，不看 FO 状态标签。
 *   1. wmsOrderNo     → 硬出库，走原 cancel
 *   2. shopOrderId    → 店单草稿（Soft / 未转出库），必须 void
 *   3. 两者都没有     → 才是真正的无仓单，只 accept Shopify
 *
 * 本文件是可单测的决策核。正式树接线：把现网 wms.orders/cancel
 * 与 fulfillmentOrderAcceptCancellationRequest 注入 deps。
 * GitHub main 近空；Jeff 把此核 cherry-pick / 手工合进正式 cancellations.server.ts。
 */

/** 旧短路用的「尚未有硬仓单」状态。不再单独决定跳过 WMS cancel。 */
export const NO_WMS_ORDER = [
  "RECEIVED",
  "PUSHING",
  "PUSH_RETRY",
  "SYNC_FAILED",
  "REJECTED",
  "CONFIG_ERROR",
] as const;

export type NoWmsOrderStatus = (typeof NO_WMS_ORDER)[number];

export type WmsCancelOutcome = "CANCELLED" | "REJECTED" | "PENDING";

/** FO 本地同步记录 — 只列 cancel 决策需要的字段 */
export interface FoCancelRecord {
  fulfillmentOrderId: string;
  externalNo: string;
  status: string;
  /** 硬出库号。Soft 成功时为 null */
  wmsOrderNo?: string | null;
  /** MZL_ShopOrdersID。Soft / 未转出库草稿有值 */
  shopOrderId?: string | number | null;
  /** OrderLink.Status：SOFT_HOLD / UNKNOWN / CONFIRMED … */
  linkStatus?: string | null;
}

/**
 * 交给现网 WMS client 的 cancel 体。
 * 契约: ShopOrderId + link UNKNOWN/SOFT_HOLD（WMS 支持的未转出库 void）。
 * 硬单继续带 wmsOrderNo；软草稿设 voidUnconverted。
 */
export interface WmsCancelRequest {
  externalNo: string;
  wmsOrderNo?: string | null;
  shopOrderId?: string | number | null;
  /** UNKNOWN / SOFT_HOLD — WMS VoidUnconverted / Soft void 路由 */
  linkStatus?: string | null;
  /** 无出库、只作废店单草稿 */
  voidUnconverted?: boolean;
}

export interface WmsCancelResult {
  outcome: WmsCancelOutcome;
  message?: string;
}

export interface ShopifyCancelAction {
  fulfillmentOrderId: string;
  message: string;
}

export interface CancelDeps {
  /** 现网 POST …/shopify-app/orders/cancel */
  wmsCancel: (req: WmsCancelRequest) => Promise<WmsCancelResult>;
  acceptCancellation: (
    args: ShopifyCancelAction
  ) => Promise<{ accepted: true; message: string }>;
  rejectCancellation?: (
    args: ShopifyCancelAction
  ) => Promise<{ rejected: true; message: string }>;
}

export type CancelShopifyAction = "accept" | "reject" | "none";

export interface CancelOneResult {
  path: "hard-wms" | "soft-shop-order" | "accept-only";
  wmsCalled: boolean;
  wmsRequest: WmsCancelRequest | null;
  wmsOutcome: WmsCancelOutcome | null;
  shopifyAction: CancelShopifyAction;
  message: string;
  accepted: boolean;
}

const ACCEPT_NO_WAREHOUSE = "No warehouse order was created; cancelled.";
const ACCEPT_AFTER_HARD_VOID = "Warehouse order cancelled.";
const ACCEPT_AFTER_SOFT_VOID =
  "Shop-order draft voided; cancellation accepted.";

/** 有可作废的硬出库 */
export function hasHardWmsOrder(
  rec: FoCancelRecord | null | undefined
): rec is FoCancelRecord & { wmsOrderNo: string } {
  return Boolean(rec?.wmsOrderNo);
}

/** 有可作废的店单草稿（Soft / 未转出库） */
export function hasShopOrderDraft(
  rec: FoCancelRecord | null | undefined
): boolean {
  if (!rec || rec.shopOrderId == null || rec.shopOrderId === "") {
    return false;
  }
  return true;
}

/**
 * 是否必须打 WMS cancel。
 * 旧逻辑用 NO_WMS_ORDER / !wmsOrderNo 否决；新逻辑只看身份字段。
 */
export function shouldCallWmsCancel(
  rec: FoCancelRecord | null | undefined
): boolean {
  return hasHardWmsOrder(rec) || hasShopOrderDraft(rec);
}

/**
 * 组装 WMS cancel 请求。硬单优先；否则软草稿走 VoidUnconverted。
 * Soft 无 linkStatus 时默认 SOFT_HOLD（与 OrderLink 现网字面一致）。
 */
export function buildWmsCancelRequest(rec: FoCancelRecord): WmsCancelRequest {
  if (hasHardWmsOrder(rec)) {
    return {
      externalNo: rec.externalNo,
      wmsOrderNo: rec.wmsOrderNo,
      shopOrderId: rec.shopOrderId ?? null,
      linkStatus: rec.linkStatus ?? null,
      voidUnconverted: false,
    };
  }

  return {
    externalNo: rec.externalNo,
    wmsOrderNo: rec.wmsOrderNo ?? null,
    shopOrderId: rec.shopOrderId ?? null,
    linkStatus: rec.linkStatus ?? "SOFT_HOLD",
    voidUnconverted: true,
  };
}

/**
 * 单条 FO 取消。
 *
 * 旧短路（RCA L65–66，本 tip 删除）:
 *   if (!rec || NO_WMS_ORDER.includes(rec.status) || !rec.wmsOrderNo) {
 *     return acceptCancellation(..., "No warehouse order was created; cancelled.");
 *   }
 */
export async function cancelOne(
  rec: FoCancelRecord | null | undefined,
  deps: CancelDeps
): Promise<CancelOneResult> {
  if (hasHardWmsOrder(rec)) {
    return runWmsThenShopify(rec, "hard-wms", ACCEPT_AFTER_HARD_VOID, deps);
  }

  if (hasShopOrderDraft(rec) && rec) {
    return runWmsThenShopify(
      rec,
      "soft-shop-order",
      ACCEPT_AFTER_SOFT_VOID,
      deps
    );
  }

  // 无 shopOrderId 且无 wmsOrderNo：保持今日 accept-only
  const accepted = await deps.acceptCancellation({
    fulfillmentOrderId: rec?.fulfillmentOrderId ?? "",
    message: ACCEPT_NO_WAREHOUSE,
  });

  return {
    path: "accept-only",
    wmsCalled: false,
    wmsRequest: null,
    wmsOutcome: null,
    shopifyAction: "accept",
    message: accepted.message,
    accepted: true,
  };
}

async function runWmsThenShopify(
  rec: FoCancelRecord,
  path: "hard-wms" | "soft-shop-order",
  acceptMessage: string,
  deps: CancelDeps
): Promise<CancelOneResult> {
  const wmsRequest = buildWmsCancelRequest(rec);
  const wms = await deps.wmsCancel(wmsRequest);

  if (wms.outcome === "CANCELLED") {
    const accepted = await deps.acceptCancellation({
      fulfillmentOrderId: rec.fulfillmentOrderId,
      message: acceptMessage,
    });
    return {
      path,
      wmsCalled: true,
      wmsRequest,
      wmsOutcome: "CANCELLED",
      shopifyAction: "accept",
      message: accepted.message,
      accepted: true,
    };
  }

  if (wms.outcome === "REJECTED") {
    const rejectMessage =
      wms.message ?? "Warehouse refused to cancel this order.";
    if (deps.rejectCancellation) {
      await deps.rejectCancellation({
        fulfillmentOrderId: rec.fulfillmentOrderId,
        message: rejectMessage,
      });
    }
    return {
      path,
      wmsCalled: true,
      wmsRequest,
      wmsOutcome: "REJECTED",
      shopifyAction: deps.rejectCancellation ? "reject" : "none",
      message: rejectMessage,
      accepted: false,
    };
  }

  // PENDING：不对 Shopify accept，留给下一轮 poll
  return {
    path,
    wmsCalled: true,
    wmsRequest,
    wmsOutcome: "PENDING",
    shopifyAction: "none",
    message: wms.message ?? "Warehouse cancel is still pending.",
    accepted: false,
  };
}
