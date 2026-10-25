/**
 * WMS 错误码到商家可见消息的映射
 *
 * 契约: shopify_node_wms_contract_v1.md §9a
 * Node 按 (errorCode, field) 选商家可见文案
 */

import type { WmsErrorCode } from "./error-codes.js";

/**
 * 商家可见的错误信息结构
 */
export interface MerchantMessage {
  /** 显示给商家的消息 */
  message: string;
  /** 消息的 i18n key (用于多语言) */
  i18nKey: string;
}

/**
 * Shopify Fulfillment Request 拒绝原因
 * 参见: https://shopify.dev/docs/api/admin-graphql/latest/mutations/fulfillmentRequestReject
 */
export type ShopifyRejectionReason =
  | "INVENTORY_OUT_OF_STOCK"
  | "UNFULFILLABLE_LINE_ITEMS"
  | "INCORRECT_ADDRESS"
  | "INELIGIBLE_PRODUCT"
  | "DECLINED"
  | "OTHER";

/**
 * WMS 错误码到 Shopify 拒绝原因的映射
 *
 * 注意: soft 错误码不在此映射中 (它们不再拒绝 FO)
 * - v1.7.6: SKU_NOT_MAPPED 移除
 * - v1.7.9: SKU_INACTIVE, NO_ROUTE, COUNTRY_NOT_SUPPORTED, INSUFFICIENT_STOCK 移除
 */
export const REJECTION_REASON_MAP: Partial<
  Record<WmsErrorCode, ShopifyRejectionReason>
> = {
  // 仍为硬错误的 VALIDATION 码
  ADDRESS_INVALID: "INCORRECT_ADDRESS",
  CUSTOMS_INFO_MISSING: "INELIGIBLE_PRODUCT",
  BALANCE_INSUFFICIENT: "DECLINED",
  REQUEST_INVALID: "OTHER",
  // CONFLICT 类
  LEGACY_DUPLICATE: "OTHER",
  EXTERNAL_NO_VOIDED: "DECLINED",
};

/**
 * 获取 Shopify fulfillment request 的拒绝原因
 * 注意: SKU_NOT_MAPPED 不应该调用此函数 (v1.7.6)
 */
export function rejectionReasonFor(
  errorCode: string
): ShopifyRejectionReason | undefined {
  return REJECTION_REASON_MAP[errorCode as WmsErrorCode];
}

/**
 * 商家可见消息映射
 * 按契约 §9a 的 (errorCode, field) 映射
 */
const MERCHANT_MESSAGES: Record<string, MerchantMessage> = {
  // SKU 相关
  SKU_NOT_MAPPED: {
    message: "SKU is not mapped in Fulfillmen. Please map the SKU and retry.",
    i18nKey: "error.sku_not_mapped",
  },
  SKU_INACTIVE: {
    message: "Product SKU is inactive in Fulfillmen.",
    i18nKey: "error.sku_inactive",
  },
  SKU_MISSING: {
    message: "Product does not have a SKU. Please add a SKU to the product.",
    i18nKey: "error.sku_missing",
  },

  // 库存/余额
  INSUFFICIENT_STOCK: {
    message: "Insufficient stock for one or more items.",
    i18nKey: "error.insufficient_stock",
  },
  BALANCE_INSUFFICIENT: {
    message: "Account balance insufficient. Please top up your account.",
    i18nKey: "error.balance_insufficient",
  },

  // 地址相关
  ADDRESS_INVALID: {
    message: "Shipping address is invalid. Please check the address details.",
    i18nKey: "error.address_invalid",
  },
  COUNTRY_NOT_SUPPORTED: {
    message: "Shipping to this country is not supported.",
    i18nKey: "error.country_not_supported",
  },

  // 路由/渠道
  NO_ROUTE: {
    message:
      "No shipping channel available for this order. Please configure channels in Fulfillmen.",
    i18nKey: "error.no_route",
  },

  // 报关
  CUSTOMS_INFO_MISSING: {
    message:
      "Customs information is missing. Please add HS code and country of origin.",
    i18nKey: "error.customs_info_missing",
  },

  // 请求结构
  REQUEST_INVALID: {
    message:
      "Order data is invalid. Please contact support@fulfillmen.com for assistance.",
    i18nKey: "error.request_invalid",
  },

  // 冲突
  LEGACY_DUPLICATE: {
    message:
      "This order was previously imported through the legacy integration. Please contact support.",
    i18nKey: "error.legacy_duplicate",
  },
  EXTERNAL_NO_VOIDED: {
    message:
      "This order was cancelled in WMS. Please contact support or fulfill from another location.",
    i18nKey: "error.external_no_voided",
  },
  IDEMPOTENCY_CONFLICT: {
    message: "Duplicate request with different content. Please contact support.",
    i18nKey: "error.idempotency_conflict",
  },

  // 系统错误
  STATE_UNKNOWN: {
    message:
      "Order status is unknown. We are investigating, please check back later.",
    i18nKey: "error.state_unknown",
  },
  WMS_BUSY: {
    message: "System is busy. Please try again in a few moments.",
    i18nKey: "error.wms_busy",
  },
  RATE_LIMITED: {
    message: "Too many requests. Please wait a moment and try again.",
    i18nKey: "error.rate_limited",
  },
  INTERNAL: {
    message: "An internal error occurred. Please try again later.",
    i18nKey: "error.internal",
  },
};

/**
 * 获取商家可见的错误消息
 */
export function merchantMessageFor(errorCode: string): MerchantMessage {
  return (
    MERCHANT_MESSAGES[errorCode] || {
      message: "An unexpected error occurred. Please contact support.",
      i18nKey: "error.unknown",
    }
  );
}

/**
 * 获取拒绝 FO 时发给 Shopify 的消息
 * 不包含任何 PII，只包含错误原因
 */
export function shopifyRejectionMessageFor(errorCode: string): string {
  const merchantMsg = merchantMessageFor(errorCode);
  return merchantMsg.message;
}
