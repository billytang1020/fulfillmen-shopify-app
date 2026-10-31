/**
 * Shopify App intake: SoftHold shop draft only (2026-10-31 Billy).
 *
 * Tip: feature/shopify-soft-draft-only-no-auto-push
 *
 * First principles
 * ----------------
 * WMS has two order objects:
 *   1. 店铺订单草稿 — `MZL_ShopOrders` SoftHold / Status=0 (`shopOrderId`)
 *   2. 仓单 / outbound — warehouse ODR (`wmsOrderNo`, `wmsOutboundIds`)
 *
 * Oct 22 rule: every platform order enters (1) first.
 * Oct 31 rule: **this App path stops at (1)**. Merchants convert (1)→(2) with the
 * existing WMS auto-push UI:
 *   https://wms.fulfillmen.com/user/shop/shop_order.aspx
 *
 * What the live Node path actually does (formal tip, not this stub repo)
 * ---------------------------------------------------------------------
 * There is **one** WMS intake call: `orders/submit` / `wms.submit`
 * (`externalNo` = `SFO<foNumeric>`), from Ryan `processFulfillmentRequests`
 * after Request Fulfillment **or** auto-soft `orders/paid`.
 *
 * WMS `ShopifyAppSubmitService` then branches:
 *   - soft issues → SoftHold only (`shopOrderId` set, `wmsOrderNo=null`). Already OK.
 *   - clean + channel resolvable → RefreshDraft → AttachExisting → **Convert → Confirm**.
 *     That Convert/Confirm **is** the warehouse auto-push this tip must stop.
 *
 * Node does **not** today call CreateOrder / SubmitSingle / shop_order.aspx.
 * The leak is WMS-side Convert on a clean `orders/submit`. So we:
 *   1. Keep calling `orders/submit` (Soft create/update shop draft + FO link).
 *   2. Attach `softHoldOnly` / `convertToOutbound:false` so WMS skips Convert.
 *   3. Guard: refuse any warehouse-push action if it is reintroduced.
 *   4. Persist `shopOrderId` only (cancel #2 + Sync tips still work).
 *
 * APPLY (Ryan/Jeff, formal tip `app/fulfillment/*`):
 *   - When building the `orders/submit` body, spread `buildSoftDraftSubmitOptions(externalNo)`.
 *   - Before every WMS HTTP/RPC, `assertAllowedWmsAction(action)`.
 *   - After submit, `interpretSoftDraftSubmitResult` + persist `shopOrderId` only.
 *   - Do not call UpgradeOrReplaySoftHold / Convert / Confirm from Node.
 *
 * WMS (Jeff/Martin) must honor `softHoldOnly`. Until that lands, Node still
 * will not fire a second convert call and will not write outbound ids here.
 * Wait Jeff merge. No 「改」 = no HK deploy.
 */

import { WMS_SHOP_AUTO_PUSH_URL } from "../lib/intake-copy";

/** Product switch: App intake is SoftHold draft only. Do not flip back. */
export const SOFT_DRAFT_ONLY = true;

export { WMS_SHOP_AUTO_PUSH_URL };

/** The only WMS intake this App path may call. */
export const ALLOWED_WMS_INTAKE_ACTIONS = ["orders/submit", "wms.submit"] as const;

/**
 * WMS actions that create / convert to warehouse outbound.
 * Calling any of these from the Shopify App intake path is a regression.
 */
export const FORBIDDEN_WAREHOUSE_PUSH_ACTIONS = [
  "CreateOrder",
  "CreateOrder.aspx",
  "SubmitSingle",
  "Convert",
  "Confirm",
  "UpgradeOrReplaySoftHold",
  "PushShopOrder",
  "shop_order",
] as const;

export type SoftDraftSubmitOptions = {
  /** Existing contract: `SFO<foNumeric>`. */
  externalNo: string;
  /** WMS must insert/update MZL_ShopOrders SoftHold and stop. */
  softHoldOnly: true;
  /** WMS must not RefreshDraft→Convert→Confirm on this call. */
  convertToOutbound: false;
  mode: "SOFT_HOLD";
};

export type SoftDraftLink = {
  fulfillmentOrderId: string;
  shop: string;
  orderId: string | null;
  externalNo: string;
  shopOrderId: string | null;
  /** Always null on this App path — warehouse ids are WMS auto-push's job. */
  wmsOrderNo: null;
  wmsOutboundIds: [];
  status: "SOFT_HOLD" | "SYNC_FAILED" | "PENDING";
};

export type WmsSubmitLike = {
  status?: string | null;
  shopOrderId?: string | null;
  wmsOrderNo?: string | null;
  outboundIds?: string[] | null;
  errorCode?: string | null;
};

export type SoftDraftSubmitInput = {
  fulfillmentOrderId: string;
  shop: string;
  orderId?: string | null;
  externalNo: string;
};

export type SoftDraftSubmitResult = {
  ok: boolean;
  /** True when WMS still Converted — Node did not ask for it and will not persist it. */
  wmsNotAligned: boolean;
  link: SoftDraftLink;
  submitCalled: true;
  warehousePushCalled: false;
};

/**
 * Injected WMS client. Production wires `orders/submit` to `submit`.
 * Convert / CreateOrder / Confirm exist only so tests can prove they stay unused.
 */
export type WmsIntakeClient = {
  submit: (body: SoftDraftSubmitOptions) => Promise<WmsSubmitLike>;
  createOrder?: (...args: unknown[]) => Promise<unknown>;
  convert?: (...args: unknown[]) => Promise<unknown>;
  confirm?: (...args: unknown[]) => Promise<unknown>;
  submitSingle?: (...args: unknown[]) => Promise<unknown>;
  upgradeOrReplaySoftHold?: (...args: unknown[]) => Promise<unknown>;
};

function normalizeWmsAction(action: string): string {
  const noQuery = action.split("?")[0] ?? action;
  const last = noQuery.split("/").filter(Boolean).pop() ?? noQuery;
  return last.replace(/\.(aspx|ashx|php)$/i, "").toLowerCase();
}

export function isAllowedWmsIntakeAction(action: string): boolean {
  const normalized = normalizeWmsAction(action);
  return (
    normalized === "submit" ||
    normalized === "wms.submit" ||
    action === "orders/submit" ||
    action === "wms.submit"
  );
}

export function isForbiddenWarehousePushAction(action: string): boolean {
  const normalized = normalizeWmsAction(action);
  return FORBIDDEN_WAREHOUSE_PUSH_ACTIONS.some(
    (name) => normalizeWmsAction(name) === normalized,
  );
}

/**
 * Hard gate: warehouse / outbound conversion is not this App's job.
 * Throws so a reintroduced Convert/CreateOrder cannot silently ship.
 */
export function assertAllowedWmsAction(action: string): void {
  if (isForbiddenWarehousePushAction(action)) {
    throw new Error(
      `[soft-draft-only] Refusing WMS warehouse-push action "${action}". ` +
        `Shopify App intake stops at MZL_ShopOrders SoftHold. ` +
        `仓单请用 WMS 自动推单: ${WMS_SHOP_AUTO_PUSH_URL}`,
    );
  }
  if (!isAllowedWmsIntakeAction(action)) {
    throw new Error(
      `[soft-draft-only] Unknown WMS action "${action}". ` +
        `Only ${ALLOWED_WMS_INTAKE_ACTIONS.join(" / ")} is allowed on this path.`,
    );
  }
}

/** Options to spread onto the existing `orders/submit` body. */
export function buildSoftDraftSubmitOptions(externalNo: string): SoftDraftSubmitOptions {
  if (!SOFT_DRAFT_ONLY) {
    throw new Error("[soft-draft-only] SOFT_DRAFT_ONLY must stay true (2026-10-31).");
  }
  return {
    externalNo,
    softHoldOnly: true,
    convertToOutbound: false,
    mode: "SOFT_HOLD",
  };
}

/**
 * Map a WMS submit response onto the FO sync row for this path.
 * Always keeps shopOrderId; never writes warehouse outbound fields.
 */
export function persistSoftDraftLink(
  input: SoftDraftSubmitInput,
  shopOrderId: string | null,
  status: SoftDraftLink["status"] = "SOFT_HOLD",
): SoftDraftLink {
  return {
    fulfillmentOrderId: input.fulfillmentOrderId,
    shop: input.shop,
    orderId: input.orderId ?? null,
    externalNo: input.externalNo,
    shopOrderId,
    wmsOrderNo: null,
    wmsOutboundIds: [],
    status,
  };
}

export function interpretSoftDraftSubmitResult(
  input: SoftDraftSubmitInput,
  response: WmsSubmitLike,
): { ok: boolean; wmsNotAligned: boolean; link: SoftDraftLink } {
  const shopOrderId = response.shopOrderId ?? null;
  const outboundIds = response.outboundIds ?? [];
  const convertedAnyway = Boolean(
    response.wmsOrderNo ||
      outboundIds.length > 0 ||
      String(response.status ?? "").toUpperCase() === "CONFIRMED",
  );

  // SoftHold / SOFT_ACCEPTED / draft are the intended success statuses.
  const statusUpper = String(response.status ?? "").toUpperCase();
  const softOk =
    Boolean(shopOrderId) &&
    (statusUpper === "" ||
      statusUpper === "SOFT_HOLD" ||
      statusUpper === "SOFT_ACCEPTED" ||
      statusUpper === "DRAFT" ||
      statusUpper === "OK");

  const status: SoftDraftLink["status"] = shopOrderId
    ? convertedAnyway
      ? "SOFT_HOLD"
      : softOk
        ? "SOFT_HOLD"
        : "SYNC_FAILED"
    : response.errorCode
      ? "SYNC_FAILED"
      : "PENDING";

  return {
    ok: Boolean(shopOrderId) && !response.errorCode,
    wmsNotAligned: convertedAnyway,
    link: persistSoftDraftLink(input, shopOrderId, status),
  };
}

/**
 * App-path orchestrator: Soft create/update shop draft, never warehouse push.
 * Production `processFulfillmentRequests` should call this (or the same steps)
 * instead of Convert/Confirm after `orders/submit`.
 */
export async function submitShopDraftOnly(
  client: WmsIntakeClient,
  input: SoftDraftSubmitInput,
): Promise<SoftDraftSubmitResult> {
  assertAllowedWmsAction("orders/submit");

  const body = buildSoftDraftSubmitOptions(input.externalNo);
  const response = await client.submit(body);
  const interpreted = interpretSoftDraftSubmitResult(input, response);

  return {
    ok: interpreted.ok,
    wmsNotAligned: interpreted.wmsNotAligned,
    link: interpreted.link,
    submitCalled: true,
    warehousePushCalled: false,
  };
}
