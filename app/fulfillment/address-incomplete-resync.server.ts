/**
 * ADDRESS_INCOMPLETE → 商家改完 Shopify 地址后再 Soft 同步
 *
 * Tip: feature/shopify-address-incomplete-resync
 * Boss: 2026-10-31
 *
 * 第一性
 * ------
 * Soft 失败只有两类「卡住」值得商家动手：
 *   1. 店单草稿已经用 ExternalNo（SFO<foNumeric>）占住了身份；
 *   2. 失败原因是地址不完整 / 地址被拒，商家能在 Shopify Admin 改掉。
 *
 * 今天的洞：Soft 写成 ADDRESS_INCOMPLETE（或等价地址拒绝）之后，
 * App 没有动作去读「当前」Shopify 收货地址，再用同一 ExternalNo 重 Soft。
 * 商家改完地址，FO/link 仍停在失败态。
 *
 * 本 tip 只做这件事：
 *   - 认出地址失败（ADDRESS_INCOMPLETE / ADDRESS_INVALID / 36057 …）
 *   - 读当前 Shopify Order.shippingAddress（FO destination 仅兜底）
 *   - 调现有 Soft API `orders/submit`，同一 ExternalNo
 *   - 已有 shopOrderId 则带上，请 WMS 更新草稿，不新建店单
 *   - 不 Convert / 不建仓单（本树没有 tip#1 helper，本地 Soft-only）
 *
 * GitHub `main` 仍是空壳。正式树由 Jeff cherry-pick 本决策核。
 * 等 Jeff 合。无「改」= 不上 HK。
 */

import {
  canResyncAddress,
  isAddressIncompleteFailure,
} from "./address-resync-ui";

export {
  ADDRESS_INCOMPLETE_ERROR_CODES,
  ADDRESS_INCOMPLETE_STATUSES,
  ADDRESS_RESYNC_INTENT,
  ADDRESS_RESYNC_LABEL_EN,
  ADDRESS_RESYNC_LABEL_ZH,
  addressResyncAction,
  addressResyncButton,
  canResyncAddress,
  isAddressIncompleteCode,
  isAddressIncompleteFailure,
  isAddressIncompleteStatus,
} from "./address-resync-ui";

/** 本树没有 tip#1 `buildSoftDraftSubmitOptions`；重试仍只走 Soft 草稿。 */
export const SOFT_HOLD_ONLY_ON_RESYNC = true;

/** 只允许这一条现网 Soft 入口。禁止另起 CreateShopOrder / Convert。 */
export const ADDRESS_RESYNC_WMS_ACTION = "orders/submit" as const;

/** 重试时绝不能碰的仓单 / 出库动作。 */
export const FORBIDDEN_ADDRESS_RESYNC_ACTIONS = [
  "CreateOrder",
  "CreateOrder.aspx",
  "SubmitSingle",
  "Convert",
  "Confirm",
  "UpgradeOrReplaySoftHold",
  "PushShopOrder",
  "shop_order",
] as const;

export type ShopifyShippingAddress = {
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  company?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  province?: string | null;
  provinceCode?: string | null;
  zip?: string | null;
  country?: string | null;
  countryCode?: string | null;
  phone?: string | null;
};

/** FO / FulfillmentOrderSync 行上，本决策需要的字段。 */
export type FoAddressRecord = {
  fulfillmentOrderId: string;
  externalNo: string;
  shop: string;
  orderId?: string | null;
  status: string;
  lastErrorCode?: string | null;
  lastErrorField?: string | null;
  lastErrorMessage?: string | null;
  /** MZL_ShopOrders 草稿 id。有值则必须复用，禁止再开一张店单。 */
  shopOrderId?: string | number | null;
  wmsOrderNo?: string | null;
  shopifyAccepted?: boolean;
};

export type SoftAddressSubmitBody = {
  externalNo: string;
  /** 已有草稿时带上，WMS RefreshDraft / 更新同一行。 */
  shopOrderId?: string;
  destination: ShopifyShippingAddress;
  /** 与 destination 同形，兼容现网 mapper 任一字段名。 */
  shippingAddress: ShopifyShippingAddress;
  softHoldOnly: true;
  convertToOutbound: false;
  mode: "SOFT_HOLD";
  /** 告诉 WMS：这是改地址重 Soft，不是新单。 */
  refreshAddress: true;
};

export type WmsSoftSubmitLike = {
  status?: string | null;
  shopOrderId?: string | number | null;
  wmsOrderNo?: string | null;
  outboundIds?: string[] | null;
  errorCode?: string | null;
  field?: string | null;
  message?: string | null;
};

export type AddressResyncDeps = {
  /**
   * 读当前 Shopify 订单收货地址（商家刚在 Admin 改过的那份）。
   * 正式树：Order.shippingAddress GraphQL，见 ORDER_SHIPPING_ADDRESS_QUERY。
   */
  fetchOrderShippingAddress: (
    orderId: string,
  ) => Promise<ShopifyShippingAddress | null>;
  /** 订单地址为空时的兜底：FO destination。可省略。 */
  fetchFoDestination?: (
    fulfillmentOrderId: string,
  ) => Promise<ShopifyShippingAddress | null>;
  /** 现网 Soft：POST …/orders/submit（或 wms.submit 同一体）。 */
  wmsSoftSubmit: (body: SoftAddressSubmitBody) => Promise<WmsSoftSubmitLike>;
};

export type AddressResyncLink = {
  fulfillmentOrderId: string;
  shop: string;
  orderId: string | null;
  externalNo: string;
  shopOrderId: string | null;
  wmsOrderNo: null;
  wmsOutboundIds: [];
  status: "SOFT_HOLD" | "ADDRESS_INCOMPLETE" | "SYNC_FAILED";
  lastErrorCode: string | null;
};

export type AddressResyncResult = {
  ok: boolean;
  attempted: boolean;
  reason:
    | "ok"
    | "not-address-incomplete"
    | "missing-shipping-address"
    | "address-still-incomplete"
    | "soft-failed"
    | "duplicate-shop-order-blocked";
  wmsCalled: boolean;
  wmsAction: typeof ADDRESS_RESYNC_WMS_ACTION | null;
  warehousePushCalled: false;
  submitBody: SoftAddressSubmitBody | null;
  shippingAddress: ShopifyShippingAddress | null;
  /** WMS 若回了另一张 shopOrderId，保留原 id 并标风险。 */
  duplicateRisk: boolean;
  link: AddressResyncLink | null;
};

/**
 * 正式树读「当前」Shopify 订单收货地址。
 * 商家改地址是改 Order，不一定立刻回写 FO destination。
 */
export const ORDER_SHIPPING_ADDRESS_QUERY = `#graphql
query FulfillmenOrderShippingAddress($id: ID!) {
  order(id: $id) {
    id
    shippingAddress {
      firstName
      lastName
      name
      company
      address1
      address2
      city
      province
      provinceCode
      zip
      country
      countryCode
      phone
    }
  }
}
`;

/** 仅当 Order.shippingAddress 为空时兜底。 */
export const FO_DESTINATION_QUERY = `#graphql
query FulfillmenFoDestination($id: ID!) {
  fulfillmentOrder(id: $id) {
    id
    destination {
      firstName
      lastName
      company
      address1
      address2
      city
      province
      provinceCode
      zip
      country
      countryCode
      phone
    }
  }
}
`;

function hasText(value: string | null | undefined): boolean {
  return Boolean(value && String(value).trim());
}

export function shopOrderIdToString(
  shopOrderId: string | number | null | undefined,
): string | null {
  if (shopOrderId == null || shopOrderId === "") return null;
  return String(shopOrderId);
}

/** Soft 首次失败：把地址拒绝记成 ADDRESS_INCOMPLETE，不 reject FO。 */
export function recordAddressIncomplete(
  rec: Pick<
    FoAddressRecord,
    "fulfillmentOrderId" | "shop" | "orderId" | "externalNo" | "shopOrderId"
  >,
  failure: {
    errorCode?: string | null;
    field?: string | null;
    message?: string | null;
    status?: string | null;
  },
): AddressResyncLink {
  return {
    fulfillmentOrderId: rec.fulfillmentOrderId,
    shop: rec.shop,
    orderId: rec.orderId ?? null,
    externalNo: rec.externalNo,
    shopOrderId: shopOrderIdToString(rec.shopOrderId),
    wmsOrderNo: null,
    wmsOutboundIds: [],
    status: "ADDRESS_INCOMPLETE",
    lastErrorCode: failure.errorCode ?? "ADDRESS_INCOMPLETE",
  };
}

export function hasUsableShippingAddress(
  address: ShopifyShippingAddress | null | undefined,
): boolean {
  if (!address) return false;
  const line = hasText(address.address1) || hasText(address.address2);
  const country = hasText(address.country) || hasText(address.countryCode);
  // 一行地址 + 国家即可重试；城市/邮编缺了仍交给 WMS 再判。
  return line && country;
}

/**
 * 规范化给 WMS 的 destination。
 * name 缺省时用 first + last，避免 Soft 再因「收件人名空」打回。
 */
export function normalizeShippingAddress(
  address: ShopifyShippingAddress,
): ShopifyShippingAddress {
  const first = address.firstName?.trim() ?? "";
  const last = address.lastName?.trim() ?? "";
  const composed = `${first} ${last}`.trim();
  return {
    firstName: address.firstName ?? null,
    lastName: address.lastName ?? null,
    name: hasText(address.name) ? address.name : composed || null,
    company: address.company ?? null,
    address1: address.address1 ?? null,
    address2: address.address2 ?? null,
    city: address.city ?? null,
    province: address.province ?? null,
    provinceCode: address.provinceCode ?? null,
    zip: address.zip ?? null,
    country: address.country ?? null,
    countryCode: address.countryCode ?? null,
    phone: address.phone ?? null,
  };
}

/**
 * 现网 Soft 体重试体。
 * 同一 ExternalNo；有 shopOrderId 就带上。
 * tip#1 若已合：Jeff 可再 spread buildSoftDraftSubmitOptions(externalNo)，
 * 三个 Soft-only 字段与本函数一致，不会打架。
 */
export function buildAddressResyncSoftBody(
  rec: FoAddressRecord,
  address: ShopifyShippingAddress,
): SoftAddressSubmitBody {
  if (!SOFT_HOLD_ONLY_ON_RESYNC) {
    throw new Error(
      "[address-resync] Soft-only flag must stay true (no warehouse Convert).",
    );
  }

  const destination = normalizeShippingAddress(address);
  const shopOrderId = shopOrderIdToString(rec.shopOrderId);

  return {
    externalNo: rec.externalNo,
    ...(shopOrderId ? { shopOrderId } : {}),
    destination,
    shippingAddress: destination,
    softHoldOnly: true,
    convertToOutbound: false,
    mode: "SOFT_HOLD",
    refreshAddress: true,
  };
}

export function assertAddressResyncAction(action: string): void {
  const last = action.split("?")[0]?.split("/").filter(Boolean).pop() ?? action;
  const normalized = last.replace(/\.(aspx|ashx|php)$/i, "").toLowerCase();
  const forbidden = FORBIDDEN_ADDRESS_RESYNC_ACTIONS.some(
    (name) => name.replace(/\.(aspx|ashx|php)$/i, "").toLowerCase() === normalized,
  );
  if (forbidden) {
    throw new Error(
      `[address-resync] Refusing warehouse-push action "${action}". ` +
        `Address retry is Soft-only (orders/submit).`,
    );
  }
  if (normalized !== "submit" && action !== "orders/submit" && action !== "wms.submit") {
    throw new Error(
      `[address-resync] Unknown WMS action "${action}". Only orders/submit is allowed.`,
    );
  }
}

function emptyResult(
  reason: AddressResyncResult["reason"],
  extras: Partial<AddressResyncResult> = {},
): AddressResyncResult {
  return {
    ok: false,
    attempted: false,
    reason,
    wmsCalled: false,
    wmsAction: null,
    warehousePushCalled: false,
    submitBody: null,
    shippingAddress: null,
    duplicateRisk: false,
    link: null,
    ...extras,
  };
}

async function loadCurrentShippingAddress(
  rec: FoAddressRecord,
  deps: AddressResyncDeps,
): Promise<ShopifyShippingAddress | null> {
  if (rec.orderId) {
    const fromOrder = await deps.fetchOrderShippingAddress(rec.orderId);
    if (hasUsableShippingAddress(fromOrder)) return fromOrder;
  }

  if (deps.fetchFoDestination) {
    const fromFo = await deps.fetchFoDestination(rec.fulfillmentOrderId);
    if (hasUsableShippingAddress(fromFo)) return fromFo;
  }

  return null;
}

function interpretResyncResponse(
  rec: FoAddressRecord,
  response: WmsSoftSubmitLike,
): {
  ok: boolean;
  reason: AddressResyncResult["reason"];
  duplicateRisk: boolean;
  link: AddressResyncLink;
} {
  const existingId = shopOrderIdToString(rec.shopOrderId);
  const returnedId = shopOrderIdToString(response.shopOrderId);
  const duplicateRisk = Boolean(
    existingId && returnedId && existingId !== returnedId,
  );
  // 已有店单时以原 shopOrderId 为准，避免误存第二张。
  const shopOrderId = existingId ?? returnedId;

  if (isAddressIncompleteFailure(response)) {
    return {
      ok: false,
      reason: "address-still-incomplete",
      duplicateRisk,
      link: recordAddressIncomplete(
        { ...rec, shopOrderId },
        {
          errorCode: response.errorCode,
          field: response.field,
          message: response.message,
          status: response.status,
        },
      ),
    };
  }

  if (response.errorCode) {
    return {
      ok: false,
      reason: "soft-failed",
      duplicateRisk,
      link: {
        fulfillmentOrderId: rec.fulfillmentOrderId,
        shop: rec.shop,
        orderId: rec.orderId ?? null,
        externalNo: rec.externalNo,
        shopOrderId,
        wmsOrderNo: null,
        wmsOutboundIds: [],
        status: "SYNC_FAILED",
        lastErrorCode: response.errorCode,
      },
    };
  }

  return {
    ok: Boolean(shopOrderId),
    reason: shopOrderId
      ? duplicateRisk
        ? "duplicate-shop-order-blocked"
        : "ok"
      : "soft-failed",
    duplicateRisk,
    link: {
      fulfillmentOrderId: rec.fulfillmentOrderId,
      shop: rec.shop,
      orderId: rec.orderId ?? null,
      externalNo: rec.externalNo,
      shopOrderId,
      wmsOrderNo: null,
      wmsOutboundIds: [],
      status: shopOrderId && !duplicateRisk ? "SOFT_HOLD" : "SYNC_FAILED",
      lastErrorCode: duplicateRisk ? "DUPLICATE_SHOP_ORDER" : null,
    },
  };
}

/**
 * 商家点「改完地址再同步」：读当前 Shopify 地址，同一 ExternalNo Soft。
 * 不创建第二张店单；不 Convert。
 */
export async function resyncAddressAndSoftSubmit(
  rec: FoAddressRecord,
  deps: AddressResyncDeps,
): Promise<AddressResyncResult> {
  if (!canResyncAddress(rec)) {
    return emptyResult("not-address-incomplete");
  }

  const shippingAddress = await loadCurrentShippingAddress(rec, deps);
  if (!hasUsableShippingAddress(shippingAddress) || !shippingAddress) {
    return emptyResult("missing-shipping-address", {
      attempted: true,
      link: recordAddressIncomplete(rec, {
        errorCode: "ADDRESS_INCOMPLETE",
        message: "Shopify order shipping address is still incomplete.",
      }),
    });
  }

  const submitBody = buildAddressResyncSoftBody(rec, shippingAddress);
  assertAddressResyncAction(ADDRESS_RESYNC_WMS_ACTION);

  const response = await deps.wmsSoftSubmit(submitBody);
  const interpreted = interpretResyncResponse(rec, response);

  return {
    ok: interpreted.ok && interpreted.reason === "ok",
    attempted: true,
    reason: interpreted.reason,
    wmsCalled: true,
    wmsAction: ADDRESS_RESYNC_WMS_ACTION,
    warehousePushCalled: false,
    submitBody,
    shippingAddress: submitBody.destination,
    duplicateRisk: interpreted.duplicateRisk,
    link: interpreted.link,
  };
}
