# 嵌入 Admin FO 行接线（合入正式 tip，不要整页替换）

正式树已有订单 / FO 列表。本 tip 只加一个 intent，不要新建路由文件除非现网没有 action。

## loader（行数据）

把 FO 同步行的 `status` / `lastErrorCode` / `lastErrorField` / `lastErrorMessage` 原样交给 UI。
`ADDRESS_INCOMPLETE` 由 Soft 失败路径调用 `recordAddressIncomplete` 写入，不要另造状态名。

```ts
import { addressResyncAction } from "../fulfillment/address-resync-ui";

// 每行：
const addressResync = addressResyncAction(row);
```

## action

```ts
import { resyncAddressAndSoftSubmit } from "../fulfillment/address-incomplete-resync.server";

if (intent === "resyncAddress") {
  const rec = await loadFoSyncRow(fulfillmentOrderId); // 现网 FO 行
  const result = await resyncAddressAndSoftSubmit(rec, {
    fetchOrderShippingAddress: (orderId) =>
      adminGraphqlOrderShippingAddress(orderId), // Order.shippingAddress
    fetchFoDestination: (foId) => adminGraphqlFoDestination(foId), // 仅兜底
    wmsSoftSubmit: (body) => existingOrdersSubmit(body), // 现网 Soft，禁止 Convert
  });
  // persist result.link（shopOrderId / status / lastErrorCode）
  return { intent, result };
}
```

GraphQL 原文在 `ORDER_SHIPPING_ADDRESS_QUERY` / `FO_DESTINATION_QUERY`。
**必须读当前 Order.shippingAddress**，不要复用第一次 Soft 缓存的 destination。

## JSX（FO 行 / 订单行）

只在 `addressResync` 有值时渲染。SKU / 库存 / 已确认行不出现。

```tsx
{addressResync ? (
  <Form method="post">
    <input type="hidden" name="intent" value={addressResync.intent} />
    <input type="hidden" name="fulfillmentOrderId" value={row.fulfillmentOrderId} />
    <Button submit>{addressResync.label}</Button>
  </Form>
) : null}
```

文案固定：`改完地址再同步 / Re-sync address`。不要改成「改」单独一字（和 HK 部署口令冲突）。
