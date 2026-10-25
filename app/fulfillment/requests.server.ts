/**
 * Fulfillment Request 处理逻辑
 *
 * 契约: shopify_node_wms_contract_v1.md v1.7.9
 *
 * 核心变更:
 * - v1.7.6: SKU_NOT_MAPPED (36053) accept + sync-fail
 * - v1.7.9: 更多 soft 错误码 (36054, 36055, 36056, 36058) accept + sync-fail
 * - v1.7.9 hotfix: 已 accept 的 FO 在 Sync Retry 遇硬错误时不 reject
 *
 * 硬错误 (仍 reject FO): 36057, 36059, 36060, 36066, CONFLICT 类
 * Node 本地 SKU_MISSING: 仍然 reject FO
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
 * 注意: 不声称有仓单号 (soft 错误时还没有 wmsOrderNo)
 * v1.7.9: 扩展支持更多 soft 错误码
 */
function buildAcceptMessage(errorCode: string): string {
  switch (errorCode) {
    case "SKU_NOT_MAPPED":
      return "Order received. SKU mapping required before fulfillment.";
    case "SKU_INACTIVE":
      return "Order received. Product SKU is inactive, please activate it to proceed.";
    case "NO_ROUTE":
      return "Order received. Shipping channel configuration required before fulfillment.";
    case "COUNTRY_NOT_SUPPORTED":
      return "Order received. Country shipping support required before fulfillment.";
    case "INSUFFICIENT_STOCK":
      return "Order received. Stock will be checked during warehouse fulfillment.";
    default:
      return "Order received. Processing in progress.";
  }
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

/**
 * Sync Retry 专用: 处理已 accept FO 在重试时的 WMS 错误
 *
 * v1.7.9 hotfix: 解决以下 bug:
 * - FO 已通过 soft path accept (status=SYNC_FAILED, shopifyAccepted=true)
 * - Sync Retry 时 WMS 返回硬 VALIDATION 错误 (如 INSUFFICIENT_STOCK 变硬)
 * - 不应调用 shopify.reject (因为 FO 已 accept，reject 会失败 → REJECT_FAILED)
 * - 保持 SYNC_FAILED 状态 + 错误码，让商家可以再次 Retry
 *
 * @param error WMS 返回的错误
 * @param foSyncRecord 当前 FO 同步记录
 * @returns 处理结果 (已 accept FO 遇硬错误时会阻止 reject)
 */
export function handleRetrySubmitError(
  error: WmsSubmitError,
  foSyncRecord: {
    shopifyAccepted: boolean;
    status: FoSyncStatus;
  }
): HandleSubmitResult {
  const baseResult = handleSubmitError(error);

  // 如果 FO 已被 Shopify accept，且 baseResult 要求 reject FO，则阻止 reject
  // 保持 SYNC_FAILED 状态，让商家可以重试
  if (foSyncRecord.shopifyAccepted && baseResult.shouldRejectFO) {
    const merchantMsg = merchantMessageFor(error.errorCode);
    return {
      success: false,
      status: "SYNC_FAILED",
      errorCode: error.errorCode,
      merchantMessage: merchantMsg.message,
      shouldRejectFO: false, // 关键: 阻止 reject 已 accept 的 FO
      shouldAcceptFO: false, // 已经 accept 过了
      retryable: true, // 允许商家再次重试
    };
  }

  // 其他情况走正常流程
  return baseResult;
}

/**
 * 检查是否应该阻止对已 accept FO 的 reject 操作
 *
 * v1.7.9 hotfix 辅助函数: 用于在实际调用 shopify.reject 前检查
 */
export function shouldBlockRejectForAcceptedFO(
  foSyncRecord: {
    shopifyAccepted: boolean;
    status: FoSyncStatus;
  },
  result: HandleSubmitResult
): boolean {
  return foSyncRecord.shopifyAccepted && result.shouldRejectFO;
}
