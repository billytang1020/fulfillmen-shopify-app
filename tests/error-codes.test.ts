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
    it("SKU_NOT_MAPPED should return true (v1.7.6 核心变更)", () => {
      expect(shouldAcceptSyncFail("SKU_NOT_MAPPED")).toBe(true);
    });

    it("SKU_INACTIVE should return false", () => {
      expect(shouldAcceptSyncFail("SKU_INACTIVE")).toBe(false);
    });

    it("INSUFFICIENT_STOCK should return false", () => {
      expect(shouldAcceptSyncFail("INSUFFICIENT_STOCK")).toBe(false);
    });

    it("ADDRESS_INVALID should return false", () => {
      expect(shouldAcceptSyncFail("ADDRESS_INVALID")).toBe(false);
    });

    it("unknown error code should return false", () => {
      expect(shouldAcceptSyncFail("UNKNOWN_CODE")).toBe(false);
    });
  });

  describe("shouldRejectFO", () => {
    it("SKU_NOT_MAPPED should return false (v1.7.6 不再拒绝 FO)", () => {
      expect(shouldRejectFO("SKU_NOT_MAPPED")).toBe(false);
    });

    it("SKU_INACTIVE should return true", () => {
      expect(shouldRejectFO("SKU_INACTIVE")).toBe(true);
    });

    it("INSUFFICIENT_STOCK should return true", () => {
      expect(shouldRejectFO("INSUFFICIENT_STOCK")).toBe(true);
    });

    it("ADDRESS_INVALID should return true", () => {
      expect(shouldRejectFO("ADDRESS_INVALID")).toBe(true);
    });

    it("NO_ROUTE should return true", () => {
      expect(shouldRejectFO("NO_ROUTE")).toBe(true);
    });

    it("BALANCE_INSUFFICIENT should return true", () => {
      expect(shouldRejectFO("BALANCE_INSUFFICIENT")).toBe(true);
    });

    it("REQUEST_INVALID should return true", () => {
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

  describe("ACCEPT_SYNC_FAIL_ERROR_CODES", () => {
    it("should only contain SKU_NOT_MAPPED", () => {
      expect(ACCEPT_SYNC_FAIL_ERROR_CODES).toEqual(["SKU_NOT_MAPPED"]);
    });
  });

  describe("REJECT_FO_ERROR_CODES", () => {
    it("should not contain SKU_NOT_MAPPED", () => {
      expect(REJECT_FO_ERROR_CODES).not.toContain("SKU_NOT_MAPPED");
    });

    it("should contain all other VALIDATION codes", () => {
      const expectedCodes = [
        "SKU_INACTIVE",
        "INSUFFICIENT_STOCK",
        "COUNTRY_NOT_SUPPORTED",
        "ADDRESS_INVALID",
        "NO_ROUTE",
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
