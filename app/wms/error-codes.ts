/**
 * WMS 错误码定义和映射
 *
 * 契约: shopify_node_wms_contract_v1.md §9
 * 码段: 36000-36049 (Anders/鉴权绑定), 36050-36099 (Martin/订单回调)
 */

/**
 * WMS 错误码类别
 */
export type WmsErrorCategory =
  | "AUTH"
  | "VALIDATION"
  | "CONFLICT"
  | "RETRYABLE"
  | "RECONCILE";

/**
 * WMS 提交订单错误码 (Martin: 36050-36099)
 */
export const WMS_ERROR_CODES = {
  // CONFLICT 类 (409)
  IDEMPOTENCY_CONFLICT: 36050,
  SUBMIT_IN_PROGRESS: 36051,
  LEGACY_DUPLICATE: 36052,
  EXTERNAL_NO_VOIDED: 36067,

  // VALIDATION 类 (422)
  SKU_NOT_MAPPED: 36053,
  SKU_INACTIVE: 36054,
  INSUFFICIENT_STOCK: 36055,
  COUNTRY_NOT_SUPPORTED: 36056,
  ADDRESS_INVALID: 36057,
  NO_ROUTE: 36058,
  CUSTOMS_INFO_MISSING: 36059,
  BALANCE_INSUFFICIENT: 36060,
  REQUEST_INVALID: 36066,

  // RECONCILE 类
  ORDER_NOT_FOUND: 36061,
  STATE_UNKNOWN: 36064,

  // RETRYABLE 类
  RATE_LIMITED: 36062,
  WMS_BUSY: 36063,
  INTERNAL: 36065,
} as const;

export type WmsErrorCode = keyof typeof WMS_ERROR_CODES;

/**
 * 错误码到类别的映射
 */
export const ERROR_CODE_CATEGORIES: Record<WmsErrorCode, WmsErrorCategory> = {
  IDEMPOTENCY_CONFLICT: "CONFLICT",
  SUBMIT_IN_PROGRESS: "RETRYABLE",
  LEGACY_DUPLICATE: "CONFLICT",
  EXTERNAL_NO_VOIDED: "CONFLICT",

  SKU_NOT_MAPPED: "VALIDATION",
  SKU_INACTIVE: "VALIDATION",
  INSUFFICIENT_STOCK: "VALIDATION",
  COUNTRY_NOT_SUPPORTED: "VALIDATION",
  ADDRESS_INVALID: "VALIDATION",
  NO_ROUTE: "VALIDATION",
  CUSTOMS_INFO_MISSING: "VALIDATION",
  BALANCE_INSUFFICIENT: "VALIDATION",
  REQUEST_INVALID: "VALIDATION",

  ORDER_NOT_FOUND: "RECONCILE",
  STATE_UNKNOWN: "RECONCILE",

  RATE_LIMITED: "RETRYABLE",
  WMS_BUSY: "RETRYABLE",
  INTERNAL: "RETRYABLE",
};

/**
 * VALIDATION 类错误码列表 (这些通常导致拒绝 FO)
 * 注意: SKU_NOT_MAPPED 在 v1.7.6 后不再拒绝 FO
 */
export const VALIDATION_ERROR_CODES: WmsErrorCode[] = [
  "SKU_NOT_MAPPED",
  "SKU_INACTIVE",
  "INSUFFICIENT_STOCK",
  "COUNTRY_NOT_SUPPORTED",
  "ADDRESS_INVALID",
  "NO_ROUTE",
  "CUSTOMS_INFO_MISSING",
  "BALANCE_INSUFFICIENT",
  "REQUEST_INVALID",
];

/**
 * v1.7.6: SKU_NOT_MAPPED 不再拒绝 FO，改为 accept + sync-fail
 * 这些错误码应该走 accept-sync-fail 路径而非 reject
 */
export const ACCEPT_SYNC_FAIL_ERROR_CODES: WmsErrorCode[] = ["SKU_NOT_MAPPED"];

/**
 * 仍然需要拒绝 FO 的 VALIDATION 错误码
 */
export const REJECT_FO_ERROR_CODES: WmsErrorCode[] = VALIDATION_ERROR_CODES.filter(
  (code) => !ACCEPT_SYNC_FAIL_ERROR_CODES.includes(code)
);

/**
 * 检查错误码是否应该走 accept-sync-fail 路径
 */
export function shouldAcceptSyncFail(errorCode: string): boolean {
  return ACCEPT_SYNC_FAIL_ERROR_CODES.includes(errorCode as WmsErrorCode);
}

/**
 * 检查错误码是否应该拒绝 FO
 */
export function shouldRejectFO(errorCode: string): boolean {
  return REJECT_FO_ERROR_CODES.includes(errorCode as WmsErrorCode);
}

/**
 * 获取错误码的类别
 */
export function getErrorCategory(
  errorCode: string
): WmsErrorCategory | undefined {
  return ERROR_CODE_CATEGORIES[errorCode as WmsErrorCode];
}
