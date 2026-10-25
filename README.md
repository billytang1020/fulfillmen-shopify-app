# fulfillmen-shopify-app

Fulfillmen Logistics Shopify App - Node service for WMS integration.

## WMS Error Code Behavior Table

契约版本: v1.7.6

| Code | errorCode | HTTP | Category | Node Action | Shopify FO |
|------|-----------|------|----------|-------------|------------|
| 36050 | IDEMPOTENCY_CONFLICT | 409 | CONFLICT | 不重试，人工 | Reject |
| 36051 | SUBMIT_IN_PROGRESS | 409 | RETRYABLE | 5s 后重试 | 不变 |
| 36052 | LEGACY_DUPLICATE | 409 | CONFLICT | 不重试 | Reject |
| **36053** | **SKU_NOT_MAPPED** | **422** | **VALIDATION** | **Accept + Sync-fail 状态** | **Accept** ⚠️ |
| 36054 | SKU_INACTIVE | 422 | VALIDATION | 拒绝 | Reject |
| 36055 | INSUFFICIENT_STOCK | 422 | VALIDATION | 拒绝 | Reject |
| 36056 | COUNTRY_NOT_SUPPORTED | 422 | VALIDATION | 拒绝 | Reject |
| 36057 | ADDRESS_INVALID | 422 | VALIDATION | 拒绝 | Reject |
| 36058 | NO_ROUTE | 422 | VALIDATION | 拒绝 | Reject |
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

### v1.7.6 变更说明

**SKU_NOT_MAPPED (36053) 行为变更**:
- ❌ 旧: 拒绝 Shopify Fulfillment Order
- ✅ 新: **接受** FO + 本地 SYNC_FAILED 状态 + 同步页展示错误 + 可重试

**原因**: 老板拍板 accept-sync-fail 方案，让商家可以在 WMS 补齐 SKU 映射后重试，而不是被拒绝后无法操作。

**重试路径**: 映射补齐后可用**同一 externalNo** 重试 submit。

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
