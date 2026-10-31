/**
 * Tip #5 — Settings 选仓 + account/register 仓字段（Anders 契约 2026-10-31）。
 *
 * Register 请求只允许这两个增量字段名（不要改名）：
 *   warehouseIds: string[]
 *   defaultWarehouseId: string
 *
 * 缺省规则（Anders）：
 *   warehouseIds 空/缺省 → [默认惠州]
 *   defaultWarehouseId 缺省 → warehouseIds[0] 或配置默认惠州
 *
 * 默认惠州 = 配置项 ShopifyApp_RegisterDefaultWarehouseId，建议值 536；排除 589。
 * 本文件是纯函数，不读 .env 文件、不碰密钥。
 */

/** 老板拍板：默认惠州 Huizhou。排除 HuiZhou3FL 589。 */
export const HUIZHOU_WAREHOUSE_ID = "536";
export const EXCLUDED_WAREHOUSE_ID = "589";
export const EXCLUDED_WAREHOUSE_IDS = [EXCLUDED_WAREHOUSE_ID] as const;

/** 可选仓 = 全部 Style=4 有效仓。 */
export const WAREHOUSE_STYLE = 4;

/** WMS 配置名（Anders）；Node 侧读同义环境变量，不写死到密钥文件。 */
export const REGISTER_DEFAULT_WAREHOUSE_CONFIG_KEY =
  "ShopifyApp_RegisterDefaultWarehouseId";
export const REGISTER_DEFAULT_WAREHOUSE_ENV_KEYS = [
  "SHOPIFY_APP_REGISTER_DEFAULT_WAREHOUSE_ID",
  "ShopifyApp_RegisterDefaultWarehouseId",
] as const;

/** 列仓：复用已有 OpenAPI，开户前用内部 key（无 fk_）。 */
export const WAREHOUSE_LIST_PATH = "/openapi/alibaba/warehouse/list";

/** Anders：POST account/register。正式 tip 若已有 wrapper，在 wrapper 里合并字段即可。 */
export const ACCOUNT_REGISTER_PATH = "account/register";

export type RegisterWarehouseFields = {
  warehouseIds: string[];
  defaultWarehouseId: string;
};

export type WarehouseListItem = {
  /** Base_StyleInfoID，始终是字符串，与 Register 契约一致。 */
  id: string;
  name: string;
  style: number;
  voided: boolean;
  raw?: Record<string, unknown>;
};

export type WarehouseSelectionInput = {
  warehouseIds?: readonly unknown[] | null;
  defaultWarehouseId?: unknown;
};

/**
 * 读配置默认仓。未配置或空 → 536。
 * 只读传入的 env 映射，避免在本 tip 里加载 .env。
 */
export function getRegisterDefaultWarehouseId(
  env: Record<string, string | undefined> = {},
): string {
  for (const key of REGISTER_DEFAULT_WAREHOUSE_ENV_KEYS) {
    const raw = env[key];
    if (raw == null) continue;
    const id = normalizeWarehouseId(raw);
    if (id) return id;
  }
  return HUIZHOU_WAREHOUSE_ID;
}

/** 仓 ID 一律规范成非空字符串；非法值返回空串。 */
export function normalizeWarehouseId(value: unknown): string {
  if (value == null) return "";
  const id = String(value).trim();
  if (!id || id === "undefined" || id === "null") return "";
  return id;
}

export function isExcludedWarehouseId(id: string): boolean {
  return EXCLUDED_WAREHOUSE_IDS.includes(id as (typeof EXCLUDED_WAREHOUSE_IDS)[number]);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readFirst(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
}

function toStyleNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return Number.NaN;
}

function isVoidedFlag(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    return v === "1" || v === "true" || v === "yes" || v === "y";
  }
  return false;
}

/**
 * 从 list API 的一行里取出 Base_StyleInfoID。
 * 只认 Anders 点名的 ID 字段；没有就丢弃该行，不另起字段名。
 */
export function readWarehouseId(row: Record<string, unknown>): string {
  return normalizeWarehouseId(readFirst(row, ["Base_StyleInfoID"]));
}

export function parseWarehouseListItem(row: unknown): WarehouseListItem | null {
  const record = asRecord(row);
  if (!record) return null;
  const id = readWarehouseId(record);
  if (!id) return null;

  const style = toStyleNumber(readFirst(record, ["Style", "style"]));
  const name = String(
    readFirst(record, ["Name", "WarehouseName", "StyleName", "name"]) ?? id,
  );
  const voided = ["IsVoid", "isVoid", "Voided", "IsDelete", "Deleted", "IsAbandoned"].some(
    (key) => isVoidedFlag(record[key]),
  );

  return { id, name, style: Number.isFinite(style) ? style : Number.NaN, voided, raw: record };
}

/**
 * 解开 WMS list 常见包裹层（data / list / rows / items），只为找到含 Base_StyleInfoID 的行。
 */
export function parseWarehouseListResponse(payload: unknown): WarehouseListItem[] {
  const found: WarehouseListItem[] = [];
  const seen = new Set<string>();

  const visit = (node: unknown, depth: number) => {
    if (node == null || depth > 6) return;
    if (Array.isArray(node)) {
      for (const item of node) {
        const parsed = parseWarehouseListItem(item);
        if (parsed && !seen.has(parsed.id)) {
          seen.add(parsed.id);
          found.push(parsed);
        } else if (!parsed) {
          visit(item, depth + 1);
        }
      }
      return;
    }
    const record = asRecord(node);
    if (!record) return;
    const parsed = parseWarehouseListItem(record);
    if (parsed && !seen.has(parsed.id)) {
      seen.add(parsed.id);
      found.push(parsed);
      return;
    }
    for (const key of ["data", "Data", "list", "List", "rows", "Rows", "items", "Items", "warehouses"]) {
      if (record[key] !== undefined) visit(record[key], depth + 1);
    }
  };

  visit(payload, 0);
  return found;
}

/** Settings 可选仓：Style=4、未作废、排除 589。 */
export function selectOptionalWarehouses(items: readonly WarehouseListItem[]): WarehouseListItem[] {
  return items.filter(
    (item) => item.style === WAREHOUSE_STYLE && !item.voided && !isExcludedWarehouseId(item.id),
  );
}

/**
 * Settings 初次进入：默认勾惠州（536）。
 * 惠州若在可选列表里，排在最前并勾选；不在列表里仍把 536 当作默认勾选意图。
 */
export function defaultSelectedWarehouseIds(
  optional: readonly WarehouseListItem[],
  defaultId = HUIZHOU_WAREHOUSE_ID,
): string[] {
  const preferred = normalizeWarehouseId(defaultId) || HUIZHOU_WAREHOUSE_ID;
  if (optional.some((item) => item.id === preferred)) return [preferred];
  return [preferred];
}

/**
 * UI 勾选：已保存的选仓优先；从未保存则默认勾惠州。
 * 已保存的 ID 若已不在可选列表，仍保留（WMS 校验 36023 由 Register 侧处理）。
 */
export function resolveSelectedWarehouseIds(args: {
  optional: readonly WarehouseListItem[];
  persistedIds?: readonly string[] | null;
  defaultId?: string;
}): string[] {
  const persisted = (args.persistedIds ?? [])
    .map(normalizeWarehouseId)
    .filter(Boolean)
    .filter((id) => !isExcludedWarehouseId(id));
  if (persisted.length > 0) return uniqueIds(persisted);
  return defaultSelectedWarehouseIds(args.optional, args.defaultId);
}

/**
 * 默认仓（写入 Style=8 isStock 的那一个）：
 * 已保存且仍在勾选中 → 用它；否则惠州若已勾选 → 惠州；否则 warehouseIds[0]。
 */
export function resolveDefaultWarehouseId(args: {
  warehouseIds: readonly string[];
  persistedDefaultId?: string | null;
  defaultId?: string;
}): string {
  const ids = args.warehouseIds.map(normalizeWarehouseId).filter(Boolean);
  const preferred = normalizeWarehouseId(args.defaultId) || HUIZHOU_WAREHOUSE_ID;
  const persisted = normalizeWarehouseId(args.persistedDefaultId);
  if (persisted && ids.includes(persisted)) return persisted;
  if (ids.includes(preferred)) return preferred;
  return ids[0] ?? preferred;
}

/**
 * Anders Register 契约增量。字段名不可改。
 * 空/缺省 warehouseIds → [默认惠州]；default 缺省 → warehouseIds[0] 或配置默认惠州。
 */
export function buildRegisterWarehouseFields(
  input: WarehouseSelectionInput = {},
  defaultId = HUIZHOU_WAREHOUSE_ID,
): RegisterWarehouseFields {
  const preferred = normalizeWarehouseId(defaultId) || HUIZHOU_WAREHOUSE_ID;
  const requested = uniqueIds(
    (input.warehouseIds ?? [])
      .map(normalizeWarehouseId)
      .filter(Boolean)
      .filter((id) => !isExcludedWarehouseId(id)),
  );
  const warehouseIds = requested.length > 0 ? requested : [preferred];
  const requestedDefault = normalizeWarehouseId(input.defaultWarehouseId);
  const defaultWarehouseId =
    requestedDefault && warehouseIds.includes(requestedDefault)
      ? requestedDefault
      : warehouseIds[0] ?? preferred;

  return { warehouseIds, defaultWarehouseId };
}

/** 把契约字段并进已有 register body，不改其它字段名。 */
export function mergeRegisterWarehouseFields<T extends Record<string, unknown>>(
  body: T,
  input: WarehouseSelectionInput = {},
  defaultId = HUIZHOU_WAREHOUSE_ID,
): T & RegisterWarehouseFields {
  const fields = buildRegisterWarehouseFields(input, defaultId);
  return {
    ...body,
    warehouseIds: fields.warehouseIds,
    defaultWarehouseId: fields.defaultWarehouseId,
  };
}

/** Settings 表单 → Register 仓字段。checkbox name=warehouseIds，radio name=defaultWarehouseId。 */
export function registerWarehouseFieldsFromForm(
  form: Pick<FormData, "get" | "getAll">,
  defaultId = HUIZHOU_WAREHOUSE_ID,
): RegisterWarehouseFields {
  return buildRegisterWarehouseFields(
    {
      warehouseIds: form.getAll("warehouseIds"),
      defaultWarehouseId: form.get("defaultWarehouseId"),
    },
    defaultId,
  );
}

export function uniqueIds(ids: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
