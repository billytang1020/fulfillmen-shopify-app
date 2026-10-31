/**
 * Soft submit / cancel / query 共用的 WMS ExternalNo（店铺参考号）
 *
 * 假设已核实（Guillermo + Kent + Jeff RO）：
 *   现网硬编码 `externalNo = "SFO" + foNumeric`
 *   例：FO 22191996371075 → SFO22191996371075
 *
 * Tip #4（2026-10-31 老板）：每店可配「订单参考号前缀」。
 *   - 前缀空 / 只空白 → 旧格式，现有店不变
 *   - 前缀有值 → `{prefix}{shopifyOrderName}`，如 sample + #1001 → sample#1001
 *
 * 第一性：ExternalNo 是店单身份。submit / cancel / query 必须用同一把钥匙。
 * 已写入 FoSync 的 externalNo 永远优先；改前缀不回溯旧单。
 */

/** 现网遗留前缀。空配置时必须继续用它，不能改成别的默认。 */
export const LEGACY_SFO_PREFIX = "SFO";

/**
 * 公开 WMS CreateShopOrder.OrderNo 长度 = 30
 * （wms.fulfillmen.com/api-json ShopOrder.ashx · 订单编号）。
 * Soft ExternalNo 若落同一列，整串不得超过 30。Jeff 若确认列更长，只改这一处。
 */
export const WMS_SHOP_ORDER_NO_MAX = 30;

/** 前缀上限：留给 `#` + Shopify 单号。16 + `#1001` = 21，仍低于 30。 */
export const ORDER_REF_PREFIX_MAX = 16;

export const ORDER_REF_PREFIX_FIELD = "orderRefPrefix";

export type ExternalNoMode = "legacy-sfo" | "configured-prefix";

export type ExternalNoBuildError =
  | "MISSING_FO_ID"
  | "MISSING_ORDER_NAME"
  | "PREFIX_TOO_LONG"
  | "EXTERNAL_NO_TOO_LONG";

export type ExternalNoBuildResult =
  | { ok: true; externalNo: string; mode: ExternalNoMode }
  | { ok: false; error: ExternalNoBuildError; message: string };

export type BuildExternalNoInput = {
  /** Settings.orderRefPrefix；空 / 空白 = 走 SFO 遗留 */
  prefix?: string | null;
  /** Shopify FO GID 或纯数字 id */
  fulfillmentOrderId?: string | null;
  /** Shopify Order.name，通常已带 #，如 #1001 */
  shopifyOrderName?: string | null;
};

/** submit / cancel / query 只认这一个字段名，避免三处各拼一把钥匙。 */
export type WmsExternalNoKeys = {
  submit: { externalNo: string };
  cancel: { externalNo: string };
  query: { externalNo: string };
};

export function normalizeOrderRefPrefix(raw: unknown): string {
  if (raw == null) return "";
  return String(raw).trim();
}

/**
 * Shopify 单号规范化：去首尾空白；没有 # 就补上。
 * 已有 #1001 的保持原样，避免拼成 sample##1001（前缀本身也不该带尾 #）。
 */
export function normalizeShopifyOrderName(raw: unknown): string {
  if (raw == null) return "";
  const trimmed = String(raw).trim();
  if (!trimmed) return "";
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

/** 只认 FulfillmentOrder GID 或纯数字，避免误吃 Order GID。 */
export function foNumericFromId(raw: unknown): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) return trimmed;
  const match = trimmed.match(
    /^gid:\/\/shopify\/FulfillmentOrder\/(\d+)$/i,
  );
  return match?.[1] ?? null;
}

export function isLegacyPrefix(prefix: unknown): boolean {
  return normalizeOrderRefPrefix(prefix).length === 0;
}

function joinPrefixAndOrderName(prefix: string, orderName: string): string {
  // 前缀误写成 sample# 时，不要和 Shopify 自带的 # 叠成 ##
  if (prefix.endsWith("#") && orderName.startsWith("#")) {
    return `${prefix}${orderName.slice(1)}`;
  }
  return `${prefix}${orderName}`;
}

export function buildOrderExternalNo(
  input: BuildExternalNoInput,
): ExternalNoBuildResult {
  const prefix = normalizeOrderRefPrefix(input.prefix);

  if (prefix.length > ORDER_REF_PREFIX_MAX) {
    return {
      ok: false,
      error: "PREFIX_TOO_LONG",
      message: `Order reference prefix is at most ${ORDER_REF_PREFIX_MAX} characters (WMS shop OrderNo max ${WMS_SHOP_ORDER_NO_MAX}).`,
    };
  }

  if (isLegacyPrefix(prefix)) {
    const foNumeric = foNumericFromId(input.fulfillmentOrderId);
    if (!foNumeric) {
      return {
        ok: false,
        error: "MISSING_FO_ID",
        message:
          "Legacy ExternalNo needs the Shopify fulfillment order id (SFO + FO numeric).",
      };
    }
    return finishBuild(`${LEGACY_SFO_PREFIX}${foNumeric}`, "legacy-sfo");
  }

  const orderName = normalizeShopifyOrderName(input.shopifyOrderName);
  if (!orderName) {
    return {
      ok: false,
      error: "MISSING_ORDER_NAME",
      message:
        "Configured prefix needs the Shopify order name (example #1001). Do not fall back to SFO — that would mint a second key.",
    };
  }

  return finishBuild(
    joinPrefixAndOrderName(prefix, orderName),
    "configured-prefix",
  );
}

function finishBuild(
  externalNo: string,
  mode: ExternalNoMode,
): ExternalNoBuildResult {
  if (externalNo.length > WMS_SHOP_ORDER_NO_MAX) {
    return {
      ok: false,
      error: "EXTERNAL_NO_TOO_LONG",
      message: `ExternalNo "${externalNo}" is ${externalNo.length} chars; WMS CreateShopOrder.OrderNo max is ${WMS_SHOP_ORDER_NO_MAX}.`,
    };
  }
  return { ok: true, externalNo, mode };
}

export function buildOrderExternalNoOrThrow(input: BuildExternalNoInput): string {
  const result = buildOrderExternalNo(input);
  if (!result.ok) {
    throw new Error(`[order-external-no] ${result.error}: ${result.message}`);
  }
  return result.externalNo;
}

/**
 * 同一 FO 的身份解析：已落库的 externalNo 优先。
 * 改 Settings 前缀只影响尚未建过店单的新 FO。
 */
export function resolveExternalNoForFo(args: {
  persistedExternalNo?: string | null;
  prefix?: string | null;
  fulfillmentOrderId?: string | null;
  shopifyOrderName?: string | null;
}): ExternalNoBuildResult {
  const persisted = String(args.persistedExternalNo ?? "").trim();
  if (persisted) {
    const mode: ExternalNoMode = persisted.startsWith(LEGACY_SFO_PREFIX) &&
      /^\d+$/.test(persisted.slice(LEGACY_SFO_PREFIX.length))
      ? "legacy-sfo"
      : "configured-prefix";
    return { ok: true, externalNo: persisted, mode };
  }
  return buildOrderExternalNo({
    prefix: args.prefix,
    fulfillmentOrderId: args.fulfillmentOrderId,
    shopifyOrderName: args.shopifyOrderName,
  });
}

/** Soft submit / cancel / query 必须带同一把 ExternalNo。 */
export function wmsExternalNoKeys(externalNo: string): WmsExternalNoKeys {
  const key = { externalNo };
  return {
    submit: key,
    cancel: key,
    query: key,
  };
}

export function keysForFulfillmentOrder(args: {
  persistedExternalNo?: string | null;
  prefix?: string | null;
  fulfillmentOrderId?: string | null;
  shopifyOrderName?: string | null;
}): ExternalNoBuildResult & { keys?: WmsExternalNoKeys } {
  const resolved = resolveExternalNoForFo(args);
  if (!resolved.ok) return resolved;
  return { ...resolved, keys: wmsExternalNoKeys(resolved.externalNo) };
}

/**
 * 同一客户多店时，前缀必须互不相同。
 * 空前缀（遗留 SFO）不参与碰撞：SFO+FO 本身全局唯一。
 * customerId 都有且不同 = 不同商户，允许相同前缀。
 */
export function findDuplicateOrderRefPrefix(args: {
  shop: string;
  prefix: string | null | undefined;
  customerId?: string | null;
  otherShops: ReadonlyArray<{
    shop: string;
    prefix?: string | null;
    customerId?: string | null;
  }>;
}): string | null {
  const prefix = normalizeOrderRefPrefix(args.prefix);
  if (!prefix) return null;

  for (const other of args.otherShops) {
    if (other.shop === args.shop) continue;
    if (normalizeOrderRefPrefix(other.prefix) !== prefix) continue;
    if (
      args.customerId &&
      other.customerId &&
      args.customerId !== other.customerId
    ) {
      continue;
    }
    return other.shop;
  }
  return null;
}

/** Settings 表单字段名必须是 orderRefPrefix，Jeff 接线时不要改名。 */
export function prefixFromForm(
  form: Pick<FormData, "get"> | { get: (name: string) => unknown },
): string {
  return normalizeOrderRefPrefix(form.get(ORDER_REF_PREFIX_FIELD));
}
