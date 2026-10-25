/**
 * Fulfillment Request 处理逻辑测试
 *
 * 契约: shopify_node_wms_contract_v1.md v1.7.9
 *
 * 测试 accept-sync-fail 行为:
 * - soft 错误码: accept FO, SYNC_FAILED 状态, 可重试
 * - 硬错误码: reject FO, REJECTED 状态
 *
 * v1.7.9 hotfix:
 * - 已 accept FO 在 Sync Retry 遇硬错误时不 reject，保持 SYNC_FAILED 可重试
 */
import { describe, it, expect } from "vitest";
import {
  handleSubmitError,
  handleRetrySubmitError,
  shouldBlockRejectForAcceptedFO,
  canRetrySubmit,
  shouldUseSameExternalNo,
} from "../app/fulfillment/requests.server.js";
import type { WmsSubmitError } from "../app/fulfillment/types.js";

describe("handleSubmitError", () => {
  describe("soft 错误码 (v1.7.9: accept-sync-fail)", () => {
    const softErrorCases: Array<{
      name: string;
      error: WmsSubmitError;
      expectedMessageContains: string;
    }> = [
      {
        name: "SKU_NOT_MAPPED (36053)",
        error: {
          httpStatus: 422,
          code: 36053,
          errorCode: "SKU_NOT_MAPPED",
          category: "VALIDATION",
          field: "items[0].sku",
        },
        expectedMessageContains: "SKU mapping required",
      },
      {
        name: "SKU_INACTIVE (36054)",
        error: {
          httpStatus: 422,
          code: 36054,
          errorCode: "SKU_INACTIVE",
          category: "VALIDATION",
          field: "items[0].sku",
        },
        expectedMessageContains: "SKU is inactive",
      },
      {
        name: "INSUFFICIENT_STOCK (36055) - v1.7.9 核心变更",
        error: {
          httpStatus: 422,
          code: 36055,
          errorCode: "INSUFFICIENT_STOCK",
          category: "VALIDATION",
          field: "items[0].quantity",
        },
        expectedMessageContains: "Stock will be checked",
      },
      {
        name: "COUNTRY_NOT_SUPPORTED (36056)",
        error: {
          httpStatus: 422,
          code: 36056,
          errorCode: "COUNTRY_NOT_SUPPORTED",
          category: "VALIDATION",
          field: "consignee.countryCode",
        },
        expectedMessageContains: "Country shipping support",
      },
      {
        name: "NO_ROUTE (36058)",
        error: {
          httpStatus: 422,
          code: 36058,
          errorCode: "NO_ROUTE",
          category: "VALIDATION",
          field: "channel",
        },
        expectedMessageContains: "Shipping channel configuration",
      },
    ];

    softErrorCases.forEach(({ name, error, expectedMessageContains }) => {
      describe(name, () => {
        it("应该返回 SYNC_FAILED 状态而非 REJECTED", () => {
          const result = handleSubmitError(error);
          expect(result.status).toBe("SYNC_FAILED");
        });

        it("不应该拒绝 FO (shouldRejectFO = false)", () => {
          const result = handleSubmitError(error);
          expect(result.shouldRejectFO).toBe(false);
        });

        it("应该接受 FO (shouldAcceptFO = true)", () => {
          const result = handleSubmitError(error);
          expect(result.shouldAcceptFO).toBe(true);
        });

        it("应该可重试 (retryable = true)", () => {
          const result = handleSubmitError(error);
          expect(result.retryable).toBe(true);
        });

        it("接受消息不应声称有仓单号", () => {
          const result = handleSubmitError(error);
          expect(result.shopifyAcceptMessage).toBeDefined();
          expect(result.shopifyAcceptMessage).not.toContain("wmsOrderNo");
          expect(result.shopifyAcceptMessage).toContain(expectedMessageContains);
        });

        it("success 应该为 false", () => {
          const result = handleSubmitError(error);
          expect(result.success).toBe(false);
        });
      });
    });
  });

  describe("INSUFFICIENT_STOCK (36055) v1.7.9 专项测试", () => {
    const insufficientStockError: WmsSubmitError = {
      httpStatus: 422,
      code: 36055,
      errorCode: "INSUFFICIENT_STOCK",
      category: "VALIDATION",
      field: "items[0].quantity",
    };

    it("应该走 soft 路径: accept FO + SYNC_FAILED", () => {
      const result = handleSubmitError(insufficientStockError);
      expect(result.status).toBe("SYNC_FAILED");
      expect(result.shouldAcceptFO).toBe(true);
      expect(result.shouldRejectFO).toBe(false);
    });

    it("商家消息应说明库存将在仓储订单检查", () => {
      const result = handleSubmitError(insufficientStockError);
      expect(result.merchantMessage).toContain("Insufficient stock");
    });

    it("接受消息应说明库存后检", () => {
      const result = handleSubmitError(insufficientStockError);
      expect(result.shopifyAcceptMessage).toContain("Stock will be checked during warehouse fulfillment");
    });
  });

  describe("Node 本地 SKU_MISSING (仍然拒绝 FO)", () => {
    const skuMissingError: WmsSubmitError = {
      httpStatus: 0, // 本地错误没有 HTTP 状态
      code: 0,
      errorCode: "SKU_MISSING",
      category: "VALIDATION",
    };

    it("应该返回 REJECTED 状态", () => {
      const result = handleSubmitError(skuMissingError);
      expect(result.status).toBe("REJECTED");
    });

    it("应该拒绝 FO", () => {
      const result = handleSubmitError(skuMissingError);
      expect(result.shouldRejectFO).toBe(true);
    });

    it("不应该接受 FO", () => {
      const result = handleSubmitError(skuMissingError);
      expect(result.shouldAcceptFO).toBe(false);
    });

    it("应该有 Shopify 拒绝原因", () => {
      const result = handleSubmitError(skuMissingError);
      expect(result.shopifyRejectionReason).toBe("INELIGIBLE_PRODUCT");
    });

    it("不应该可重试", () => {
      const result = handleSubmitError(skuMissingError);
      expect(result.retryable).toBe(false);
    });
  });

  describe("硬 VALIDATION 错误 (仍然拒绝 FO)", () => {
    const testCases: Array<{
      name: string;
      error: WmsSubmitError;
      expectedRejectionReason: string;
    }> = [
      {
        name: "ADDRESS_INVALID (36057)",
        error: {
          httpStatus: 422,
          code: 36057,
          errorCode: "ADDRESS_INVALID",
          category: "VALIDATION",
          field: "consignee.address1",
        },
        expectedRejectionReason: "INCORRECT_ADDRESS",
      },
      {
        name: "CUSTOMS_INFO_MISSING (36059) - 仍为硬错误",
        error: {
          httpStatus: 422,
          code: 36059,
          errorCode: "CUSTOMS_INFO_MISSING",
          category: "VALIDATION",
          field: "items[0].hsCode",
        },
        expectedRejectionReason: "INELIGIBLE_PRODUCT",
      },
      {
        name: "BALANCE_INSUFFICIENT (36060)",
        error: {
          httpStatus: 422,
          code: 36060,
          errorCode: "BALANCE_INSUFFICIENT",
          category: "VALIDATION",
          field: "account",
        },
        expectedRejectionReason: "DECLINED",
      },
      {
        name: "REQUEST_INVALID (36066)",
        error: {
          httpStatus: 422,
          code: 36066,
          errorCode: "REQUEST_INVALID",
          category: "VALIDATION",
          field: "items",
        },
        expectedRejectionReason: "OTHER",
      },
    ];

    testCases.forEach(({ name, error, expectedRejectionReason }) => {
      describe(name, () => {
        it("应该返回 REJECTED 状态", () => {
          const result = handleSubmitError(error);
          expect(result.status).toBe("REJECTED");
        });

        it("应该拒绝 FO", () => {
          const result = handleSubmitError(error);
          expect(result.shouldRejectFO).toBe(true);
        });

        it("不应该接受 FO", () => {
          const result = handleSubmitError(error);
          expect(result.shouldAcceptFO).toBe(false);
        });

        it(`应该有正确的 Shopify 拒绝原因 (${expectedRejectionReason})`, () => {
          const result = handleSubmitError(error);
          expect(result.shopifyRejectionReason).toBe(expectedRejectionReason);
        });

        it("不应该可重试", () => {
          const result = handleSubmitError(error);
          expect(result.retryable).toBe(false);
        });
      });
    });
  });

  describe("CONFLICT 错误", () => {
    describe("LEGACY_DUPLICATE (36052)", () => {
      const error: WmsSubmitError = {
        httpStatus: 409,
        code: 36052,
        errorCode: "LEGACY_DUPLICATE",
        category: "CONFLICT",
        wmsOrderNo: "O26102200001",
      };

      it("应该返回 REJECTED 状态", () => {
        const result = handleSubmitError(error);
        expect(result.status).toBe("REJECTED");
      });

      it("应该拒绝 FO", () => {
        const result = handleSubmitError(error);
        expect(result.shouldRejectFO).toBe(true);
      });

      it("应该包含 wmsOrderNo", () => {
        const result = handleSubmitError(error);
        expect(result.wmsOrderNo).toBe("O26102200001");
      });
    });

    describe("EXTERNAL_NO_VOIDED (36067)", () => {
      const error: WmsSubmitError = {
        httpStatus: 409,
        code: 36067,
        errorCode: "EXTERNAL_NO_VOIDED",
        category: "CONFLICT",
        wmsOrderNo: "O26102200002",
      };

      it("应该返回 REJECTED 状态", () => {
        const result = handleSubmitError(error);
        expect(result.status).toBe("REJECTED");
      });

      it("应该拒绝 FO", () => {
        const result = handleSubmitError(error);
        expect(result.shouldRejectFO).toBe(true);
      });

      it("不应该可重试 (终态)", () => {
        const result = handleSubmitError(error);
        expect(result.retryable).toBe(false);
      });
    });

    describe("SUBMIT_IN_PROGRESS (36051)", () => {
      const error: WmsSubmitError = {
        httpStatus: 409,
        code: 36051,
        errorCode: "SUBMIT_IN_PROGRESS",
        category: "CONFLICT",
        retryAfterMs: 5000,
      };

      it("应该返回 PENDING 状态", () => {
        const result = handleSubmitError(error);
        expect(result.status).toBe("PENDING");
      });

      it("不应该拒绝 FO", () => {
        const result = handleSubmitError(error);
        expect(result.shouldRejectFO).toBe(false);
      });

      it("不应该接受 FO", () => {
        const result = handleSubmitError(error);
        expect(result.shouldAcceptFO).toBe(false);
      });

      it("应该可重试", () => {
        const result = handleSubmitError(error);
        expect(result.retryable).toBe(true);
      });

      it("应该有重试延迟", () => {
        const result = handleSubmitError(error);
        expect(result.retryAfterMs).toBe(5000);
      });
    });
  });

  describe("RETRYABLE 错误", () => {
    const retryCases: Array<{
      name: string;
      error: WmsSubmitError;
    }> = [
      {
        name: "RATE_LIMITED (36062)",
        error: {
          httpStatus: 429,
          code: 36062,
          errorCode: "RATE_LIMITED",
          category: "RETRYABLE",
          retryAfterMs: 1000,
        },
      },
      {
        name: "WMS_BUSY (36063)",
        error: {
          httpStatus: 503,
          code: 36063,
          errorCode: "WMS_BUSY",
          category: "RETRYABLE",
          retryAfterMs: 5000,
        },
      },
      {
        name: "INTERNAL (36065)",
        error: {
          httpStatus: 500,
          code: 36065,
          errorCode: "INTERNAL",
          category: "RETRYABLE",
        },
      },
    ];

    retryCases.forEach(({ name, error }) => {
      describe(name, () => {
        it("应该返回 PENDING 状态", () => {
          const result = handleSubmitError(error);
          expect(result.status).toBe("PENDING");
        });

        it("不应该拒绝 FO", () => {
          const result = handleSubmitError(error);
          expect(result.shouldRejectFO).toBe(false);
        });

        it("不应该接受 FO", () => {
          const result = handleSubmitError(error);
          expect(result.shouldAcceptFO).toBe(false);
        });

        it("应该可重试", () => {
          const result = handleSubmitError(error);
          expect(result.retryable).toBe(true);
        });
      });
    });

    it("retryAfterMs 应该有上限 15 分钟", () => {
      const error: WmsSubmitError = {
        httpStatus: 429,
        code: 36062,
        errorCode: "RATE_LIMITED",
        category: "RETRYABLE",
        retryAfterMs: 30 * 60 * 1000, // 30 分钟
      };
      const result = handleSubmitError(error);
      expect(result.retryAfterMs).toBe(15 * 60 * 1000); // 15 分钟上限
    });
  });

  describe("RECONCILE 错误", () => {
    const reconcileCases: Array<{
      name: string;
      error: WmsSubmitError;
    }> = [
      {
        name: "ORDER_NOT_FOUND (36061)",
        error: {
          httpStatus: 404,
          code: 36061,
          errorCode: "ORDER_NOT_FOUND",
          category: "RECONCILE",
        },
      },
      {
        name: "STATE_UNKNOWN (36064)",
        error: {
          httpStatus: 500,
          code: 36064,
          errorCode: "STATE_UNKNOWN",
          category: "RECONCILE",
        },
      },
    ];

    reconcileCases.forEach(({ name, error }) => {
      describe(name, () => {
        it("应该返回 PENDING 状态", () => {
          const result = handleSubmitError(error);
          expect(result.status).toBe("PENDING");
        });

        it("不应该拒绝 FO", () => {
          const result = handleSubmitError(error);
          expect(result.shouldRejectFO).toBe(false);
        });

        it("不应该接受 FO", () => {
          const result = handleSubmitError(error);
          expect(result.shouldAcceptFO).toBe(false);
        });

        it("不应该自动重试 (需要对账)", () => {
          const result = handleSubmitError(error);
          expect(result.retryable).toBe(false);
        });
      });
    });
  });
});

describe("canRetrySubmit", () => {
  it("SYNC_FAILED 状态应该可以重试", () => {
    expect(canRetrySubmit("SYNC_FAILED")).toBe(true);
  });

  it("SYNC_FAILED + SKU_NOT_MAPPED 应该可以重试", () => {
    expect(canRetrySubmit("SYNC_FAILED", "SKU_NOT_MAPPED")).toBe(true);
  });

  it("PENDING 状态应该可以重试", () => {
    expect(canRetrySubmit("PENDING")).toBe(true);
  });

  it("REJECTED 状态不应该可以重试", () => {
    expect(canRetrySubmit("REJECTED")).toBe(false);
  });

  it("CONFIRMED 状态不应该可以重试", () => {
    expect(canRetrySubmit("CONFIRMED")).toBe(false);
  });

  it("SHIPPED 状态不应该可以重试", () => {
    expect(canRetrySubmit("SHIPPED")).toBe(false);
  });
});

describe("shouldUseSameExternalNo", () => {
  it("SYNC_FAILED + SKU_NOT_MAPPED 应该使用相同 externalNo", () => {
    expect(shouldUseSameExternalNo("SYNC_FAILED", "SKU_NOT_MAPPED")).toBe(true);
  });

  it("SYNC_FAILED + INSUFFICIENT_STOCK 应该使用相同 externalNo (v1.7.9)", () => {
    expect(shouldUseSameExternalNo("SYNC_FAILED", "INSUFFICIENT_STOCK")).toBe(true);
  });

  it("PENDING 状态应该使用相同 externalNo", () => {
    expect(shouldUseSameExternalNo("PENDING")).toBe(true);
  });

  it("REJECTED 状态不应该使用相同 externalNo", () => {
    expect(shouldUseSameExternalNo("REJECTED")).toBe(false);
  });

  it("SYNC_FAILED 没有错误码也应该使用相同 externalNo (通用情况)", () => {
    expect(shouldUseSameExternalNo("SYNC_FAILED")).toBe(true);
  });
});

describe("handleRetrySubmitError (v1.7.9 hotfix)", () => {
  describe("已 accept FO 遇硬 VALIDATION 错误 - 不 reject", () => {
    const hardError: WmsSubmitError = {
      httpStatus: 422,
      code: 36057,
      errorCode: "ADDRESS_INVALID",
      category: "VALIDATION",
      field: "consignee.address1",
    };

    const acceptedFoRecord = {
      shopifyAccepted: true,
      status: "SYNC_FAILED" as const,
    };

    it("应该阻止 reject，返回 SYNC_FAILED 状态", () => {
      const result = handleRetrySubmitError(hardError, acceptedFoRecord);
      expect(result.status).toBe("SYNC_FAILED");
      expect(result.shouldRejectFO).toBe(false);
    });

    it("应该保持可重试", () => {
      const result = handleRetrySubmitError(hardError, acceptedFoRecord);
      expect(result.retryable).toBe(true);
    });

    it("不应该要求再次 accept (已 accept 过)", () => {
      const result = handleRetrySubmitError(hardError, acceptedFoRecord);
      expect(result.shouldAcceptFO).toBe(false);
    });

    it("应该保留原始错误码", () => {
      const result = handleRetrySubmitError(hardError, acceptedFoRecord);
      expect(result.errorCode).toBe("ADDRESS_INVALID");
    });
  });

  describe("已 accept FO 遇 INSUFFICIENT_STOCK - 走 soft 路径", () => {
    const insufficientStockError: WmsSubmitError = {
      httpStatus: 422,
      code: 36055,
      errorCode: "INSUFFICIENT_STOCK",
      category: "VALIDATION",
      field: "items[0].quantity",
    };

    const acceptedFoRecord = {
      shopifyAccepted: true,
      status: "SYNC_FAILED" as const,
    };

    it("应该走正常 soft 路径 (INSUFFICIENT_STOCK 现为 soft)", () => {
      const result = handleRetrySubmitError(insufficientStockError, acceptedFoRecord);
      expect(result.status).toBe("SYNC_FAILED");
      expect(result.shouldRejectFO).toBe(false);
      expect(result.retryable).toBe(true);
    });
  });

  describe("未 accept FO 遇硬错误 - 正常 reject", () => {
    const hardError: WmsSubmitError = {
      httpStatus: 422,
      code: 36057,
      errorCode: "ADDRESS_INVALID",
      category: "VALIDATION",
      field: "consignee.address1",
    };

    const notAcceptedFoRecord = {
      shopifyAccepted: false,
      status: "PENDING" as const,
    };

    it("未 accept 的 FO 遇硬错误应该正常 reject", () => {
      const result = handleRetrySubmitError(hardError, notAcceptedFoRecord);
      expect(result.status).toBe("REJECTED");
      expect(result.shouldRejectFO).toBe(true);
    });
  });

  describe("真实 bug 场景: FO 718743 Sync Retry REJECT_FAILED", () => {
    const insufficientStockError: WmsSubmitError = {
      httpStatus: 422,
      code: 36055,
      errorCode: "INSUFFICIENT_STOCK",
      category: "VALIDATION",
      field: "items[0].quantity",
    };

    const softAcceptedFoRecord = {
      shopifyAccepted: true,
      status: "SYNC_FAILED" as const,
    };

    it("soft accept 后 Retry 遇 INSUFFICIENT_STOCK 不应 reject", () => {
      const result = handleRetrySubmitError(insufficientStockError, softAcceptedFoRecord);
      expect(result.shouldRejectFO).toBe(false);
      expect(result.status).toBe("SYNC_FAILED");
      expect(result.retryable).toBe(true);
    });

    it("v1.7.9: INSUFFICIENT_STOCK 是 soft，所以走 accept-sync-fail 路径", () => {
      const result = handleRetrySubmitError(insufficientStockError, softAcceptedFoRecord);
      expect(result.shouldAcceptFO).toBe(true);
    });
  });
});

describe("shouldBlockRejectForAcceptedFO", () => {
  it("已 accept FO + shouldRejectFO=true 应该阻止", () => {
    const foRecord = { shopifyAccepted: true, status: "SYNC_FAILED" as const };
    const result = { shouldRejectFO: true } as any;
    expect(shouldBlockRejectForAcceptedFO(foRecord, result)).toBe(true);
  });

  it("已 accept FO + shouldRejectFO=false 不需要阻止", () => {
    const foRecord = { shopifyAccepted: true, status: "SYNC_FAILED" as const };
    const result = { shouldRejectFO: false } as any;
    expect(shouldBlockRejectForAcceptedFO(foRecord, result)).toBe(false);
  });

  it("未 accept FO + shouldRejectFO=true 不需要阻止", () => {
    const foRecord = { shopifyAccepted: false, status: "PENDING" as const };
    const result = { shouldRejectFO: true } as any;
    expect(shouldBlockRejectForAcceptedFO(foRecord, result)).toBe(false);
  });
});
