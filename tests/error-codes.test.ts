/**
 * WMS 错误码映射测试
 */
import { describe, it, expect } from "vitest";
import {
  WMS_ERROR_CODES,
  ERROR_CODE_CATEGORIES,
  VALIDATION_ERROR_CODES,
  ACCEPT_SYNC_FAIL_ERROR_CODES,
  REJECT_FO_ERROR_CODES,
  shouldAcceptSyncFail,
  shouldRejectFO,
  getErrorCategory,
} from "../app/wms/error-codes.js";

describe("WMS Error Codes", () => {
  describe("code values", () => {
    it("SKU_NOT_MAPPED should be 36053", () => {
      expect(WMS_ERROR_CODES.SKU_NOT_MAPPED).toBe(36053);
    });

    it("SKU_INACTIVE should be 36054", () => {
      expect(WMS_ERROR_CODES.SKU_INACTIVE).toBe(36054);
    });

    it("all VALIDATION codes should be in 36053-36060 or 36066", () => {
      const validationCodes = VALIDATION_ERROR_CODES.map(
        (code) => WMS_ERROR_CODES[code]
      );
      validationCodes.forEach((code) => {
        expect(
          (code >= 36053 && code <= 36060) || code === 36066
        ).toBe(true);
      });
    });
  });

  describe("shouldAcceptSyncFail", () => {
    it("SKU_NOT_MAPPED should return true (v1.7.6)", () => {
      expect(shouldAcceptSyncFail("SKU_NOT_MAPPED")).toBe(true);
    });

    it("SKU_INACTIVE should return true (v1.7.9)", () => {
      expect(shouldAcceptSyncFail("SKU_INACTIVE")).toBe(true);
    });

    it("INSUFFICIENT_STOCK should return true (v1.7.9 产品决策: 库存检查后移)", () => {
      expect(shouldAcceptSyncFail("INSUFFICIENT_STOCK")).toBe(true);
    });

    it("NO_ROUTE should return true (v1.7.9)", () => {
      expect(shouldAcceptSyncFail("NO_ROUTE")).toBe(true);
    });

    it("COUNTRY_NOT_SUPPORTED should return true (v1.7.9)", () => {
      expect(shouldAcceptSyncFail("COUNTRY_NOT_SUPPORTED")).toBe(true);
    });

    it("ADDRESS_INVALID should return false (仍为硬错误)", () => {
      expect(shouldAcceptSyncFail("ADDRESS_INVALID")).toBe(false);
    });

    it("CUSTOMS_INFO_MISSING should return false (36059 仍为硬错误)", () => {
      expect(shouldAcceptSyncFail("CUSTOMS_INFO_MISSING")).toBe(false);
    });

    it("BALANCE_INSUFFICIENT should return false (仍为硬错误)", () => {
      expect(shouldAcceptSyncFail("BALANCE_INSUFFICIENT")).toBe(false);
    });

    it("unknown error code should return false", () => {
      expect(shouldAcceptSyncFail("UNKNOWN_CODE")).toBe(false);
    });
  });

  describe("shouldRejectFO", () => {
    it("SKU_NOT_MAPPED should return false (v1.7.6 soft)", () => {
      expect(shouldRejectFO("SKU_NOT_MAPPED")).toBe(false);
    });

    it("SKU_INACTIVE should return false (v1.7.9 soft)", () => {
      expect(shouldRejectFO("SKU_INACTIVE")).toBe(false);
    });

    it("INSUFFICIENT_STOCK should return false (v1.7.9 soft)", () => {
      expect(shouldRejectFO("INSUFFICIENT_STOCK")).toBe(false);
    });

    it("NO_ROUTE should return false (v1.7.9 soft)", () => {
      expect(shouldRejectFO("NO_ROUTE")).toBe(false);
    });

    it("COUNTRY_NOT_SUPPORTED should return false (v1.7.9 soft)", () => {
      expect(shouldRejectFO("COUNTRY_NOT_SUPPORTED")).toBe(false);
    });

    it("ADDRESS_INVALID should return true (仍为硬错误)", () => {
      expect(shouldRejectFO("ADDRESS_INVALID")).toBe(true);
    });

    it("CUSTOMS_INFO_MISSING should return true (36059 仍为硬错误)", () => {
      expect(shouldRejectFO("CUSTOMS_INFO_MISSING")).toBe(true);
    });

    it("BALANCE_INSUFFICIENT should return true (仍为硬错误)", () => {
      expect(shouldRejectFO("BALANCE_INSUFFICIENT")).toBe(true);
    });

    it("REQUEST_INVALID should return true (仍为硬错误)", () => {
      expect(shouldRejectFO("REQUEST_INVALID")).toBe(true);
    });
  });

  describe("getErrorCategory", () => {
    it("SKU_NOT_MAPPED should be VALIDATION", () => {
      expect(getErrorCategory("SKU_NOT_MAPPED")).toBe("VALIDATION");
    });

    it("SUBMIT_IN_PROGRESS should be RETRYABLE", () => {
      expect(getErrorCategory("SUBMIT_IN_PROGRESS")).toBe("RETRYABLE");
    });

    it("LEGACY_DUPLICATE should be CONFLICT", () => {
      expect(getErrorCategory("LEGACY_DUPLICATE")).toBe("CONFLICT");
    });

    it("STATE_UNKNOWN should be RECONCILE", () => {
      expect(getErrorCategory("STATE_UNKNOWN")).toBe("RECONCILE");
    });

    it("unknown code should return undefined", () => {
      expect(getErrorCategory("UNKNOWN")).toBeUndefined();
    });
  });

  describe("ACCEPT_SYNC_FAIL_ERROR_CODES (v1.7.9)", () => {
    it("should contain all soft error codes", () => {
      expect(ACCEPT_SYNC_FAIL_ERROR_CODES).toContain("SKU_NOT_MAPPED");
      expect(ACCEPT_SYNC_FAIL_ERROR_CODES).toContain("SKU_INACTIVE");
      expect(ACCEPT_SYNC_FAIL_ERROR_CODES).toContain("NO_ROUTE");
      expect(ACCEPT_SYNC_FAIL_ERROR_CODES).toContain("COUNTRY_NOT_SUPPORTED");
      expect(ACCEPT_SYNC_FAIL_ERROR_CODES).toContain("INSUFFICIENT_STOCK");
    });

    it("should NOT contain hard error codes", () => {
      expect(ACCEPT_SYNC_FAIL_ERROR_CODES).not.toContain("ADDRESS_INVALID");
      expect(ACCEPT_SYNC_FAIL_ERROR_CODES).not.toContain("CUSTOMS_INFO_MISSING");
      expect(ACCEPT_SYNC_FAIL_ERROR_CODES).not.toContain("BALANCE_INSUFFICIENT");
      expect(ACCEPT_SYNC_FAIL_ERROR_CODES).not.toContain("REQUEST_INVALID");
    });
  });

  describe("REJECT_FO_ERROR_CODES (v1.7.9)", () => {
    it("should NOT contain soft error codes", () => {
      expect(REJECT_FO_ERROR_CODES).not.toContain("SKU_NOT_MAPPED");
      expect(REJECT_FO_ERROR_CODES).not.toContain("SKU_INACTIVE");
      expect(REJECT_FO_ERROR_CODES).not.toContain("NO_ROUTE");
      expect(REJECT_FO_ERROR_CODES).not.toContain("COUNTRY_NOT_SUPPORTED");
      expect(REJECT_FO_ERROR_CODES).not.toContain("INSUFFICIENT_STOCK");
    });

    it("should contain hard VALIDATION codes", () => {
      const expectedCodes = [
        "ADDRESS_INVALID",
        "CUSTOMS_INFO_MISSING",
        "BALANCE_INSUFFICIENT",
        "REQUEST_INVALID",
      ];
      expectedCodes.forEach((code) => {
        expect(REJECT_FO_ERROR_CODES).toContain(code);
      });
    });
  });
});
