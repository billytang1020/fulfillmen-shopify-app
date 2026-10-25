/**
 * Fulfillment Request 处理逻辑
 *
 * 契约: shopify_node_wms_contract_v1.md v1.7.6
 *
 * 核心变更 (v1.7.6):
 * - 36053 SKU_NOT_MAPPED: 不再拒绝 FO，改为 accept + sync-fail
 * - 其他 VALIDATION 错误码 (36054-36060, 36066): 仍然拒绝 FO
 * - Node 本地 SKU_MISSING: 仍然拒绝 FO
 */

import {
  shouldAcceptSyncFail,
  shouldRejectFO,
  getErrorCategory,
  type WmsErrorCode,
} from "../wms/error-codes.js";
import {
  merchantMessageFor,
  rejectionReasonFor,
  shopifyRejectionMessageFor,
} from "../wms/mapper.js";
import type {
  FoSyncStatus,
  WmsSubmitError,
  HandleSubmitResult,
} from "./types.js";

/**
 * 处理 WMS 提交错误
 *
 * 根据契约 v1.7.6 的规定:
 * 1. SKU_NOT_MAPPED (36053): accept FO + sync-fail 状态 + 可重试
 * 2. 其他 VALIDATION (36054-36060, 36066): reject FO
 * 3. Node 本地 SKU_MISSING: reject FO
 * 4. CONFLICT (36050, 36052, 36067): reject FO
 * 5. RETRYABLE (36051, 36062, 36063, 36065): 不改 FO 状态, 重试
 * 6. RECONCILE (36061, 36064): 不改 FO 状态, 对账
 */
export function handleSubmitError(error: WmsSubmitError): HandleSubmitResult {
  const { errorCode, category, field, retryAfterMs, wmsOrderNo } = error;
  const merchantMsg = merchantMessageFor(errorCode);

  // Case 1: SKU_NOT_MAPPED - accept FO, sync-fail (v1.7.6 核心变更)
  if (shouldAcceptSyncFail(errorCode)) {
    return {
      success: false,
      status: "SYNC_FAILED",
      errorCode,
      merchantMessage: merchantMsg.message,
      shouldRejectFO: false,
      shouldAcceptFO: true,
      shopifyAcceptMessage: buildAcceptMessage(errorCode),
      retryable: true,
    };
  }

  // Case 2: Node 本地 SKU_MISSING - reject FO
  if (errorCode === "SKU_MISSING") {
    return {
      success: false,
      status: "REJECTED",
      errorCode,
      merchantMessage: merchantMsg.message,
      shouldRejectFO: true,
      shouldAcceptFO: false,
      shopifyRejectionReason: "INELIGIBLE_PRODUCT",
      shopifyRejectionMessage: shopifyRejectionMessageFor(errorCode),
      retryable: false,
    };
  }

  // Case 3: 其他 VALIDATION 错误 - reject FO
  if (shouldRejectFO(errorCode)) {
    const rejectionReason = rejectionReasonFor(errorCode) || "OTHER";
    return {
      success: false,
      status: "REJECTED",
      errorCode,
      merchantMessage: merchantMsg.message,
      shouldRejectFO: true,
      shouldAcceptFO: false,
      shopifyRejectionReason: rejectionReason,
      shopifyRejectionMessage: shopifyRejectionMessageFor(errorCode),
      retryable: false,
    };
  }

  // Case 4: CONFLICT 类错误
  if (category === "CONFLICT") {
    // LEGACY_DUPLICATE, EXTERNAL_NO_VOIDED: reject FO
    if (errorCode === "LEGACY_DUPLICATE" || errorCode === "EXTERNAL_NO_VOIDED") {
      const rejectionReason = rejectionReasonFor(errorCode) || "OTHER";
      return {
        success: false,
        status: "REJECTED",
        errorCode,
        wmsOrderNo,
        merchantMessage: merchantMsg.message,
        shouldRejectFO: true,
        shouldAcceptFO: false,
        shopifyRejectionReason: rejectionReason,
        shopifyRejectionMessage: shopifyRejectionMessageFor(errorCode),
        retryable: false,
      };
    }

    // IDEMPOTENCY_CONFLICT: reject FO
    if (errorCode === "IDEMPOTENCY_CONFLICT") {
      return {
        success: false,
        status: "REJECTED",
        errorCode,
        merchantMessage: merchantMsg.message,
        shouldRejectFO: true,
        shouldAcceptFO: false,
        shopifyRejectionReason: "OTHER",
        shopifyRejectionMessage: shopifyRejectionMessageFor(errorCode),
        retryable: false,
      };
    }

    // SUBMIT_IN_PROGRESS: 可重试，不改 FO 状态
    if (errorCode === "SUBMIT_IN_PROGRESS") {
      return {
        success: false,
        status: "PENDING",
        errorCode,
        merchantMessage: merchantMsg.message,
        shouldRejectFO: false,
        shouldAcceptFO: false,
        retryable: true,
        retryAfterMs: retryAfterMs || 5000,
      };
    }
  }

  // Case 5: RETRYABLE 类错误 - 不改 FO 状态，重试
  if (category === "RETRYABLE") {
    return {
      success: false,
      status: "PENDING",
      errorCode,
      merchantMessage: merchantMsg.message,
      shouldRejectFO: false,
      shouldAcceptFO: false,
      retryable: true,
      retryAfterMs: retryAfterMs ? Math.min(retryAfterMs, 15 * 60 * 1000) : undefined,
    };
  }

  // Case 6: RECONCILE 类错误 - 不改 FO 状态，进对账
  if (category === "RECONCILE") {
    return {
      success: false,
      status: "PENDING",
      errorCode,
      merchantMessage: merchantMsg.message,
      shouldRejectFO: false,
      shouldAcceptFO: false,
      retryable: false,
    };
  }

  // 未知错误码: 不改 FO 状态，记录日志
  return {
    success: false,
    status: "PENDING",
    errorCode,
    merchantMessage: merchantMsg.message,
    shouldRejectFO: false,
    shouldAcceptFO: false,
    retryable: false,
  };
}

/**
 * 构建接受 FO 时的消息
 *
 * 注意: 不声称有仓单号 (因为 SKU_NOT_MAPPED 时还没有 wmsOrderNo)
 */
function buildAcceptMessage(errorCode: string): string {
  if (errorCode === "SKU_NOT_MAPPED") {
    return "Order received. SKU mapping required before fulfillment.";
  }
  return "Order received. Processing in progress.";
}

/**
 * 检查 FO 同步记录是否可以重试提交
 *
 * v1.7.6: SKU_NOT_MAPPED 的 SYNC_FAILED 状态可以重试
 */
export function canRetrySubmit(
  status: FoSyncStatus,
  errorCode?: string
): boolean {
  // SYNC_FAILED 状态可以重试 (主要用于 SKU_NOT_MAPPED)
  if (status === "SYNC_FAILED") {
    return true;
  }

  // PENDING 状态可以重试
  if (status === "PENDING") {
    return true;
  }

  return false;
}

/**
 * 判断是否应该使用相同的 externalNo 重试
 *
 * v1.7.6: SKU_NOT_MAPPED 修复映射后可以用同一 externalNo 重试
 */
export function shouldUseSameExternalNo(
  status: FoSyncStatus,
  errorCode?: string
): boolean {
  // SYNC_FAILED 状态: 同一 externalNo 重试 (主要用于 SKU_NOT_MAPPED)
  if (status === "SYNC_FAILED") {
    return true;
  }

  // PENDING 状态: 同一 externalNo 重试
  if (status === "PENDING") {
    return true;
  }

  return false;
}
