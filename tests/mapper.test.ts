/**
 * WMS 错误码到商家消息映射测试
 */
import { describe, it, expect } from "vitest";
import {
  merchantMessageFor,
  rejectionReasonFor,
  shopifyRejectionMessageFor,
} from "../app/wms/mapper.js";

describe("merchantMessageFor", () => {
  it("SKU_NOT_MAPPED 应该有映射说明消息", () => {
    const msg = merchantMessageFor("SKU_NOT_MAPPED");
    expect(msg.message).toContain("SKU is not mapped");
    expect(msg.message).toContain("Fulfillmen");
    expect(msg.i18nKey).toBe("error.sku_not_mapped");
  });

  it("SKU_INACTIVE 应该有停用说明消息", () => {
    const msg = merchantMessageFor("SKU_INACTIVE");
    expect(msg.message).toContain("inactive");
    expect(msg.i18nKey).toBe("error.sku_inactive");
  });

  it("SKU_MISSING 应该有缺少 SKU 说明消息", () => {
    const msg = merchantMessageFor("SKU_MISSING");
    expect(msg.message).toContain("does not have a SKU");
    expect(msg.i18nKey).toBe("error.sku_missing");
  });

  it("INSUFFICIENT_STOCK 应该有库存不足消息", () => {
    const msg = merchantMessageFor("INSUFFICIENT_STOCK");
    expect(msg.message).toContain("Insufficient stock");
    expect(msg.i18nKey).toBe("error.insufficient_stock");
  });

  it("ADDRESS_INVALID 应该有地址无效消息", () => {
    const msg = merchantMessageFor("ADDRESS_INVALID");
    expect(msg.message).toContain("address");
    expect(msg.message).toContain("invalid");
    expect(msg.i18nKey).toBe("error.address_invalid");
  });

  it("NO_ROUTE 应该有渠道配置消息", () => {
    const msg = merchantMessageFor("NO_ROUTE");
    expect(msg.message).toContain("channel");
    expect(msg.i18nKey).toBe("error.no_route");
  });

  it("REQUEST_INVALID 应该提示联系客服", () => {
    const msg = merchantMessageFor("REQUEST_INVALID");
    expect(msg.message).toContain("contact support");
    expect(msg.i18nKey).toBe("error.request_invalid");
  });

  it("未知错误码应该有通用消息", () => {
    const msg = merchantMessageFor("UNKNOWN_ERROR_CODE");
    expect(msg.message).toContain("unexpected error");
    expect(msg.i18nKey).toBe("error.unknown");
  });
});

describe("rejectionReasonFor", () => {
  // 硬错误码仍有 rejection reason 映射
  it("ADDRESS_INVALID 应该返回 INCORRECT_ADDRESS", () => {
    expect(rejectionReasonFor("ADDRESS_INVALID")).toBe("INCORRECT_ADDRESS");
  });

  it("CUSTOMS_INFO_MISSING 应该返回 INELIGIBLE_PRODUCT", () => {
    expect(rejectionReasonFor("CUSTOMS_INFO_MISSING")).toBe("INELIGIBLE_PRODUCT");
  });

  it("BALANCE_INSUFFICIENT 应该返回 DECLINED", () => {
    expect(rejectionReasonFor("BALANCE_INSUFFICIENT")).toBe("DECLINED");
  });

  it("REQUEST_INVALID 应该返回 OTHER", () => {
    expect(rejectionReasonFor("REQUEST_INVALID")).toBe("OTHER");
  });

  it("LEGACY_DUPLICATE 应该返回 OTHER", () => {
    expect(rejectionReasonFor("LEGACY_DUPLICATE")).toBe("OTHER");
  });

  it("EXTERNAL_NO_VOIDED 应该返回 DECLINED", () => {
    expect(rejectionReasonFor("EXTERNAL_NO_VOIDED")).toBe("DECLINED");
  });

  it("未定义的错误码应该返回 undefined", () => {
    expect(rejectionReasonFor("UNKNOWN")).toBeUndefined();
  });

  // v1.7.9: soft 错误码不再映射拒绝原因，因为不再拒绝 FO
  describe("soft 错误码不应有拒绝原因映射 (v1.7.9)", () => {
    it("SKU_NOT_MAPPED 不应该有拒绝原因映射", () => {
      expect(rejectionReasonFor("SKU_NOT_MAPPED")).toBeUndefined();
    });

    it("SKU_INACTIVE 不应该有拒绝原因映射", () => {
      expect(rejectionReasonFor("SKU_INACTIVE")).toBeUndefined();
    });

    it("INSUFFICIENT_STOCK 不应该有拒绝原因映射", () => {
      expect(rejectionReasonFor("INSUFFICIENT_STOCK")).toBeUndefined();
    });

    it("COUNTRY_NOT_SUPPORTED 不应该有拒绝原因映射", () => {
      expect(rejectionReasonFor("COUNTRY_NOT_SUPPORTED")).toBeUndefined();
    });

    it("NO_ROUTE 不应该有拒绝原因映射", () => {
      expect(rejectionReasonFor("NO_ROUTE")).toBeUndefined();
    });
  });
});

describe("shopifyRejectionMessageFor", () => {
  it("应该返回不含 PII 的消息", () => {
    const msg = shopifyRejectionMessageFor("ADDRESS_INVALID");
    expect(msg).not.toContain("John");
    expect(msg).not.toContain("123 Main St");
    expect(msg).not.toContain("@");
    expect(msg).not.toContain("555-");
  });

  it("SKU_NOT_MAPPED 消息应该引导修复映射", () => {
    const msg = shopifyRejectionMessageFor("SKU_NOT_MAPPED");
    expect(msg).toContain("SKU is not mapped");
    expect(msg).toContain("retry");
  });
});
