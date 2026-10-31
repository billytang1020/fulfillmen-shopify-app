/**
 * 嵌入 Admin FO 行：「改完地址再同步」的判定与文案。
 *
 * 不放 `.server.ts`，正式树 Polarish / Remix 行组件可直接 import。
 */

/** Soft / FO-link 上的地址失败态（含等价字面）。 */
export const ADDRESS_INCOMPLETE_STATUSES = [
  "ADDRESS_INCOMPLETE",
  "ADDRESS_INVALID",
] as const;

/**
 * Soft 地址拒绝的错误码。
 * 36057 ADDRESS_INVALID 在 v1.7.9 曾是硬拒 FO；本 tip 把它收成
 * 「可改地址再 Soft」。COUNTRY_NOT_SUPPORTED 不算地址不完整。
 */
export const ADDRESS_INCOMPLETE_ERROR_CODES = [
  "ADDRESS_INCOMPLETE",
  "ADDRESS_INVALID",
  "36057",
] as const;

export const ADDRESS_RESYNC_LABEL_ZH = "改完地址再同步";
export const ADDRESS_RESYNC_LABEL_EN = "Re-sync address";
export const ADDRESS_RESYNC_INTENT = "resyncAddress";

export type AddressIncompleteStatus =
  (typeof ADDRESS_INCOMPLETE_STATUSES)[number];

/** 行组件只需要失败态字段；完整 FO 行也可传入。 */
export type AddressResyncRow = {
  status: string;
  lastErrorCode?: string | null;
  lastErrorField?: string | null;
  lastErrorMessage?: string | null;
};

const ADDRESS_MESSAGE_RE =
  /address[_\s-]*incomplete|incomplete[_\s-]*address|地址不完整|收货地址不完整|地址缺失|地址不全/i;

export function normalizeAddressToken(
  value: string | null | undefined,
): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/^WMS[._-]/, "")
    .replace(/\s+/g, "_");
}

export function isAddressIncompleteCode(
  code: string | null | undefined,
): boolean {
  const token = normalizeAddressToken(code);
  if (!token) return false;
  return (ADDRESS_INCOMPLETE_ERROR_CODES as readonly string[]).includes(token);
}

export function isAddressIncompleteStatus(
  status: string | null | undefined,
): boolean {
  const token = normalizeAddressToken(status);
  if (!token) return false;
  return (ADDRESS_INCOMPLETE_STATUSES as readonly string[]).includes(token);
}

/**
 * Soft 回包 / FO 行是否属于「地址被拒，可改完再同步」。
 * 不认 COUNTRY_NOT_SUPPORTED、SKU_*、库存码。
 */
export function isAddressIncompleteFailure(input: {
  status?: string | null;
  errorCode?: string | null;
  field?: string | null;
  message?: string | null;
}): boolean {
  if (isAddressIncompleteStatus(input.status)) return true;
  if (isAddressIncompleteCode(input.errorCode)) return true;

  const field = normalizeAddressToken(input.field);
  const addressField =
    field === "ADDRESS" ||
    field === "DESTINATION" ||
    field === "SHIPPINGADDRESS" ||
    field === "SHIPPING_ADDRESS";

  if (addressField && ADDRESS_MESSAGE_RE.test(String(input.message ?? ""))) {
    return true;
  }

  return ADDRESS_MESSAGE_RE.test(String(input.message ?? ""));
}

/**
 * 嵌入 Admin 的 FO 行要不要画按钮。
 * 只在地址失败时出现；SKU / 库存 / 已确认 / 已拒 FO 都不画。
 */
export function canResyncAddress(
  rec: AddressResyncRow | null | undefined,
): boolean {
  if (!rec) return false;

  const status = normalizeAddressToken(rec.status);
  if (
    status === "REJECTED" ||
    status === "CONFIRMED" ||
    status === "SHIPPED" ||
    status === "CANCELLED"
  ) {
    return false;
  }

  return isAddressIncompleteFailure({
    status: rec.status,
    errorCode: rec.lastErrorCode,
    field: rec.lastErrorField,
    message: rec.lastErrorMessage,
  });
}

export function addressResyncButton(rec: AddressResyncRow | null | undefined): {
  show: boolean;
  intent: typeof ADDRESS_RESYNC_INTENT;
  labelZh: typeof ADDRESS_RESYNC_LABEL_ZH;
  labelEn: typeof ADDRESS_RESYNC_LABEL_EN;
  label: string;
} {
  return {
    show: canResyncAddress(rec),
    intent: ADDRESS_RESYNC_INTENT,
    labelZh: ADDRESS_RESYNC_LABEL_ZH,
    labelEn: ADDRESS_RESYNC_LABEL_EN,
    // 双语并排。不要单独用「改」（和 HK 部署口令冲突）。
    label: `${ADDRESS_RESYNC_LABEL_ZH} / ${ADDRESS_RESYNC_LABEL_EN}`,
  };
}

/** 行组件用：地址失败返回按钮 props，其它行 null。 */
export function addressResyncAction(row: AddressResyncRow) {
  const button = addressResyncButton(row);
  return button.show ? button : null;
}
