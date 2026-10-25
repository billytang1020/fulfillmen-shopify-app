/**
 * Fulfillment 相关类型定义
 */

/**
 * FO 同步状态
 */
export type FoSyncStatus =
  | "PENDING" // 待处理
  | "SUBMITTED" // 已提交到 WMS
  | "CONFIRMED" // WMS 已确认
  | "SYNC_FAILED" // 同步失败（可重试）
  | "REJECTED" // 已拒绝（终态）
  | "SHIPPED" // 已发货
  | "CANCELLED"; // 已取消

/**
 * FO 同步记录
 */
export interface FoSyncRecord {
  /** Shopify FO ID */
  fulfillmentOrderId: string;
  /** 外部单号 SFO{foId} */
  externalNo: string;
  /** 店铺域名 */
  shopDomain: string;
  /** WMS 客户代码 */
  cusCode: string;
  /** WMS 订单号 (成功时) */
  wmsOrderNo?: string;
  /** 同步状态 */
  status: FoSyncStatus;
  /** 最后错误码 */
  lastErrorCode?: string;
  /** 商家可见消息 */
  merchantMessage?: string;
  /** Shopify FO 是否已接受 */
  shopifyAccepted: boolean;
  /** 创建时间 */
  createdAt: Date;
  /** 更新时间 */
  updatedAt: Date;
  /** 重试次数 */
  retryCount: number;
}

/**
 * WMS 提交响应
 */
export interface WmsSubmitResponse {
  code: number;
  message?: string;
  data?: {
    externalNo: string;
    status: "CONFIRMED" | "REJECTED" | "UNKNOWN";
    idempotentReplay?: boolean;
    wmsOrderNo?: string;
    orders?: Array<{
      wmsOrderNo: string;
      outboundId: string;
      lineRefs: string[];
    }>;
    errorCode?: string;
    category?: string;
    field?: string;
    retryAfterMs?: number;
  };
}

/**
 * WMS 提交错误响应
 */
export interface WmsSubmitError {
  httpStatus: number;
  code: number;
  errorCode: string;
  category: string;
  field?: string;
  message?: string;
  retryAfterMs?: number;
  wmsOrderNo?: string;
}

/**
 * 处理结果
 */
export interface HandleSubmitResult {
  /** 处理是否成功 */
  success: boolean;
  /** 新的同步状态 */
  status: FoSyncStatus;
  /** WMS 订单号 */
  wmsOrderNo?: string;
  /** 错误码 */
  errorCode?: string;
  /** 商家消息 */
  merchantMessage?: string;
  /** 是否需要拒绝 Shopify FO */
  shouldRejectFO: boolean;
  /** 是否需要接受 Shopify FO */
  shouldAcceptFO: boolean;
  /** Shopify 拒绝原因 */
  shopifyRejectionReason?: string;
  /** Shopify 拒绝消息 */
  shopifyRejectionMessage?: string;
  /** 接受时的消息 */
  shopifyAcceptMessage?: string;
  /** 是否可重试 */
  retryable: boolean;
  /** 建议重试延迟 (ms) */
  retryAfterMs?: number;
}
