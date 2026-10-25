# fulfillmen-shopify-app

Fulfillmen Logistics Shopify App - Node service for WMS integration.

## WMS Error Code Behavior Table

契约版本: **v1.7.9**

| Code | errorCode | HTTP | Category | Node Action | Shopify FO |
|------|-----------|------|----------|-------------|------------|
| 36050 | IDEMPOTENCY_CONFLICT | 409 | CONFLICT | 不重试，人工 | Reject |
| 36051 | SUBMIT_IN_PROGRESS | 409 | RETRYABLE | 5s 后重试 | 不变 |
| 36052 | LEGACY_DUPLICATE | 409 | CONFLICT | 不重试 | Reject |
| **36053** | **SKU_NOT_MAPPED** | **422** | **VALIDATION** | **Accept + SYNC_FAILED** | **Accept** ⚠️ |
| **36054** | **SKU_INACTIVE** | **422** | **VALIDATION** | **Accept + SYNC_FAILED** | **Accept** ⚠️ |
| **36055** | **INSUFFICIENT_STOCK** | **422** | **VALIDATION** | **Accept + SYNC_FAILED** | **Accept** ⚠️ |
| **36056** | **COUNTRY_NOT_SUPPORTED** | **422** | **VALIDATION** | **Accept + SYNC_FAILED** | **Accept** ⚠️ |
| 36057 | ADDRESS_INVALID | 422 | VALIDATION | 拒绝 | Reject |
| **36058** | **NO_ROUTE** | **422** | **VALIDATION** | **Accept + SYNC_FAILED** | **Accept** ⚠️ |
| 36059 | CUSTOMS_INFO_MISSING | 422 | VALIDATION | 拒绝 | Reject |
| 36060 | BALANCE_INSUFFICIENT | 422 | VALIDATION | 拒绝 | Reject |
| 36061 | ORDER_NOT_FOUND | 404 | RECONCILE | 对账 | 不变 |
| 36062 | RATE_LIMITED | 429 | RETRYABLE | 按 retryAfterMs | 不变 |
| 36063 | WMS_BUSY | 503 | RETRYABLE | 重试 | 不变 |
| 36064 | STATE_UNKNOWN | 500 | RECONCILE | 对账 | 不变 |
| 36065 | INTERNAL | 500 | RETRYABLE | 指数退避 | 不变 |
| 36066 | REQUEST_INVALID | 422 | VALIDATION | 拒绝 | Reject |
| 36067 | EXTERNAL_NO_VOIDED | 409 | CONFLICT | 不重试 | Reject |
| — | SKU_MISSING | — | VALIDATION | Node 本地拒绝 | Reject |

### v1.7.9 变更说明

**Soft 错误码扩展 (Accept + SYNC_FAILED)**:
| Code | errorCode | 说明 |
|------|-----------|------|
| 36053 | SKU_NOT_MAPPED | SKU 未映射 (v1.7.6) |
| 36054 | SKU_INACTIVE | SKU 未激活 |
| 36055 | INSUFFICIENT_STOCK | **库存不足 - 库存检查后移到仓储订单** |
| 36056 | COUNTRY_NOT_SUPPORTED | 国家不支持 |
| 36058 | NO_ROUTE | 无可用渠道 |

**产品决策**: 老板拍板「这里不需要判断是否有库存，库存会在仓储订单中判断」。

**Sync Retry Hotfix**: 
- 已 accept 的 FO 在 Sync Retry 时遇到任何错误（包括硬错误）都**不调用 shopify.reject**
- 保持 SYNC_FAILED 状态 + 错误码，让商家可以再次 Retry
- 修复 bug: FO 718743 已 soft accept 后 Retry 遇 INSUFFICIENT_STOCK → REJECT_FAILED

**仍为硬错误**: 36057 ADDRESS_INVALID, 36059 CUSTOMS_INFO_MISSING, 36060 BALANCE_INSUFFICIENT, 36066 REQUEST_INVALID

**重试路径**: 问题修复后可用**同一 externalNo** 重试 submit。

## Development

```bash
npm install
npm test
npm run typecheck
```

## Testing

```bash
npm test              # 运行所有测试
npm run test:watch    # 监听模式
```
