/**
 * Tip #4 — 可配置订单参考号前缀
 *
 * 覆盖：
 *   1. 空前缀 = 遗留 SFO + FO 数字（现有店不变）
 *   2. 配置前缀 = {prefix}{shopifyOrderName}，如 sample#1001
 *   3. Soft submit / cancel / query 用同一把 ExternalNo
 *   4. 已落库的 key 优先，改前缀不换旧单身份
 */
import { describe, expect, it } from "vitest";
import {
  LEGACY_SFO_PREFIX,
  ORDER_REF_PREFIX_FIELD,
  ORDER_REF_PREFIX_MAX,
  WMS_SHOP_ORDER_NO_MAX,
  buildOrderExternalNo,
  buildOrderExternalNoOrThrow,
  findDuplicateOrderRefPrefix,
  foNumericFromId,
  isLegacyPrefix,
  keysForFulfillmentOrder,
  normalizeOrderRefPrefix,
  normalizeShopifyOrderName,
  prefixFromForm,
  resolveExternalNoForFo,
  wmsExternalNoKeys,
} from "../app/wms/order-external-no";

const FO_NUMERIC = "22191996371075";
const FO_GID = `gid://shopify/FulfillmentOrder/${FO_NUMERIC}`;
const LEGACY = `${LEGACY_SFO_PREFIX}${FO_NUMERIC}`;

describe("normalize helpers", () => {
  it("空 / 空白前缀都算遗留", () => {
    expect(isLegacyPrefix(null)).toBe(true);
    expect(isLegacyPrefix("")).toBe(true);
    expect(isLegacyPrefix("   ")).toBe(true);
    expect(normalizeOrderRefPrefix("  sample  ")).toBe("sample");
    expect(isLegacyPrefix("sample")).toBe(false);
  });

  it("Shopify 单号保留已有 #，缺 # 则补上", () => {
    expect(normalizeShopifyOrderName("#1001")).toBe("#1001");
    expect(normalizeShopifyOrderName("1001")).toBe("#1001");
    expect(normalizeShopifyOrderName("  #1001  ")).toBe("#1001");
    expect(normalizeShopifyOrderName("")).toBe("");
  });

  it("只从 FulfillmentOrder GID 或纯数字取 FO id", () => {
    expect(foNumericFromId(FO_GID)).toBe(FO_NUMERIC);
    expect(foNumericFromId(FO_NUMERIC)).toBe(FO_NUMERIC);
    expect(foNumericFromId("gid://shopify/Order/123")).toBeNull();
    expect(foNumericFromId("")).toBeNull();
  });
});

describe("legacy SFO (empty prefix — backward compat)", () => {
  it("SFO + FO 数字，Jeff RO 形状 SFO22191996371075", () => {
    const built = buildOrderExternalNo({
      prefix: "",
      fulfillmentOrderId: FO_GID,
    });
    expect(built).toEqual({
      ok: true,
      externalNo: LEGACY,
      mode: "legacy-sfo",
    });
  });

  it("空白前缀 + 纯数字 FO 也走遗留", () => {
    const built = buildOrderExternalNo({
      prefix: "  ",
      fulfillmentOrderId: FO_NUMERIC,
    });
    expect(built.ok).toBe(true);
    if (built.ok) {
      expect(built.externalNo).toBe(LEGACY);
      expect(built.mode).toBe("legacy-sfo");
    }
  });

  it("未配前缀时忽略 Shopify 单号，避免悄悄改现网身份", () => {
    const built = buildOrderExternalNo({
      prefix: null,
      fulfillmentOrderId: FO_GID,
      shopifyOrderName: "#1001",
    });
    expect(built.ok).toBe(true);
    if (built.ok) expect(built.externalNo).toBe(LEGACY);
  });

  it("遗留路径缺少 FO id 失败，不编造单号", () => {
    const built = buildOrderExternalNo({ prefix: "", shopifyOrderName: "#1001" });
    expect(built.ok).toBe(false);
    if (!built.ok) expect(built.error).toBe("MISSING_FO_ID");
  });
});

describe("configured prefix + Shopify order name", () => {
  it("sample + #1001 → sample#1001", () => {
    const built = buildOrderExternalNo({
      prefix: "sample",
      shopifyOrderName: "#1001",
      fulfillmentOrderId: FO_GID,
    });
    expect(built).toEqual({
      ok: true,
      externalNo: "sample#1001",
      mode: "configured-prefix",
    });
  });

  it("Shopify 单号只有数字时补 #", () => {
    expect(
      buildOrderExternalNoOrThrow({
        prefix: "sample",
        shopifyOrderName: "1001",
      }),
    ).toBe("sample#1001");
  });

  it("前缀误带尾 # 不叠成 ##", () => {
    expect(
      buildOrderExternalNoOrThrow({
        prefix: "sample#",
        shopifyOrderName: "#1001",
      }),
    ).toBe("sample#1001");
  });

  it("配置了前缀但没有单号：失败，绝不回退 SFO", () => {
    const built = buildOrderExternalNo({
      prefix: "sample",
      fulfillmentOrderId: FO_GID,
    });
    expect(built.ok).toBe(false);
    if (!built.ok) expect(built.error).toBe("MISSING_ORDER_NAME");
  });

  it("前缀超过 16 拒绝", () => {
    const built = buildOrderExternalNo({
      prefix: "x".repeat(ORDER_REF_PREFIX_MAX + 1),
      shopifyOrderName: "#1001",
    });
    expect(built.ok).toBe(false);
    if (!built.ok) expect(built.error).toBe("PREFIX_TOO_LONG");
  });

  it("整串超过 WMS OrderNo 30 拒绝，不截断（截断会撞单）", () => {
    // 16 + # + 14 位 = 31，刚过公开 OrderNo 30
    const built = buildOrderExternalNo({
      prefix: "abcdefghijklmnop",
      shopifyOrderName: "#12345678901234",
    });
    expect(built.ok).toBe(false);
    if (!built.ok) {
      expect(built.error).toBe("EXTERNAL_NO_TOO_LONG");
      expect(built.message).toContain(String(WMS_SHOP_ORDER_NO_MAX));
    }
  });
});

describe("submit / cancel / query 同一把钥匙", () => {
  it("遗留路径三处 externalNo 相同", () => {
    const result = keysForFulfillmentOrder({
      prefix: "",
      fulfillmentOrderId: FO_GID,
    });
    expect(result.ok).toBe(true);
    if (!result.ok || !result.keys) return;
    expect(result.keys.submit.externalNo).toBe(LEGACY);
    expect(result.keys.cancel.externalNo).toBe(LEGACY);
    expect(result.keys.query.externalNo).toBe(LEGACY);
    expect(result.keys.submit).toEqual(result.keys.cancel);
    expect(result.keys.cancel).toEqual(result.keys.query);
  });

  it("配置前缀路径三处都是 sample#1001", () => {
    const result = keysForFulfillmentOrder({
      prefix: "sample",
      shopifyOrderName: "#1001",
      fulfillmentOrderId: FO_GID,
    });
    expect(result.ok).toBe(true);
    if (!result.ok || !result.keys) return;
    expect(result.keys.submit.externalNo).toBe("sample#1001");
    expect(result.keys.cancel.externalNo).toBe("sample#1001");
    expect(result.keys.query.externalNo).toBe("sample#1001");
  });

  it("wmsExternalNoKeys 三个操作引用同一对象字段", () => {
    const keys = wmsExternalNoKeys("sample#1001");
    expect(keys.submit.externalNo).toBe("sample#1001");
    expect(keys.cancel.externalNo).toBe(keys.submit.externalNo);
    expect(keys.query.externalNo).toBe(keys.submit.externalNo);
  });
});

describe("persisted ExternalNo wins (prefix change is not retroactive)", () => {
  it("旧单已是 SFO…，即使后来配了 sample 仍用落库值", () => {
    const resolved = resolveExternalNoForFo({
      persistedExternalNo: LEGACY,
      prefix: "sample",
      fulfillmentOrderId: FO_GID,
      shopifyOrderName: "#1001",
    });
    expect(resolved).toEqual({
      ok: true,
      externalNo: LEGACY,
      mode: "legacy-sfo",
    });
  });

  it("已是 sample#1001 的 FO，前缀改成 other 也不换钥匙", () => {
    const resolved = resolveExternalNoForFo({
      persistedExternalNo: "sample#1001",
      prefix: "other",
      fulfillmentOrderId: FO_GID,
      shopifyOrderName: "#1001",
    });
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.externalNo).toBe("sample#1001");
      expect(resolved.mode).toBe("configured-prefix");
    }
  });

  it("尚无落库值才按当前前缀新建", () => {
    const resolved = resolveExternalNoForFo({
      persistedExternalNo: "  ",
      prefix: "sample",
      shopifyOrderName: "#1001",
    });
    expect(resolved.ok).toBe(true);
    if (resolved.ok) expect(resolved.externalNo).toBe("sample#1001");
  });
});

describe("prefix uniqueness among merchant shops", () => {
  it("同一客户两店不能共用 sample", () => {
    const clash = findDuplicateOrderRefPrefix({
      shop: "a.myshopify.com",
      prefix: "sample",
      customerId: "10003",
      otherShops: [
        { shop: "b.myshopify.com", prefix: "sample", customerId: "10003" },
      ],
    });
    expect(clash).toBe("b.myshopify.com");
  });

  it("不同客户允许相同前缀", () => {
    const clash = findDuplicateOrderRefPrefix({
      shop: "a.myshopify.com",
      prefix: "sample",
      customerId: "10003",
      otherShops: [
        { shop: "b.myshopify.com", prefix: "sample", customerId: "10099" },
      ],
    });
    expect(clash).toBeNull();
  });

  it("空前缀（遗留 SFO）不参与碰撞", () => {
    const clash = findDuplicateOrderRefPrefix({
      shop: "a.myshopify.com",
      prefix: "",
      customerId: "10003",
      otherShops: [
        { shop: "b.myshopify.com", prefix: "", customerId: "10003" },
      ],
    });
    expect(clash).toBeNull();
  });
});

describe("Settings form field", () => {
  it("字段名固定 orderRefPrefix", () => {
    expect(ORDER_REF_PREFIX_FIELD).toBe("orderRefPrefix");
    const form = new Map<string, string>([["orderRefPrefix", "  sample  "]]);
    expect(prefixFromForm({ get: (name) => form.get(name) ?? null })).toBe(
      "sample",
    );
  });
});
