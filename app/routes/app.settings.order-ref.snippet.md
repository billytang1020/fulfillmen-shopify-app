# `app/routes/app.settings.tsx` 接线（合入正式 tip，不要整页替换）

字段名必须是 `orderRefPrefix`。留空 = 遗留 `SFO{foNumeric}`。

## loader

```ts
import { getOrderRefPrefix } from "../lib/shop-order-ref.server";

// authenticate.admin 之后：
const orderRefPrefix = await getOrderRefPrefix(session.shop);
return { /* 现有字段 */, orderRefPrefix };
```

## action

```ts
import { saveOrderRefPrefix } from "../lib/shop-order-ref.server";
import { ORDER_REF_PREFIX_FIELD } from "../wms/order-external-no";

if (intent === "saveOrderRefPrefix") {
  const saved = await saveOrderRefPrefix(
    session.shop,
    form.get(ORDER_REF_PREFIX_FIELD),
    shopRow?.wmsCustomerId ?? null,
  );
  return { intent, result: saved };
}
```

## JSX（已绑定 Settings 区块）

```tsx
<Form method="post">
  <input type="hidden" name="intent" value="saveOrderRefPrefix" />
  <s-text-field
    name="orderRefPrefix"
    label="Order reference prefix"
    value={orderRefPrefix}
    maxLength={16}
    autoComplete="off"
    helpText="Leave empty to keep SFO + fulfillment order id. Example: sample + Shopify #1001 → sample#1001. Unique per shop under the same Fulfillmen account."
  />
  <s-button type="submit">Save prefix</s-button>
</Form>
```

中文帮助（若正式 UI 双语）：「订单参考号前缀。留空沿用 SFO+履约单号。例：sample + #1001 → sample#1001。同一客户下每店前缀须唯一。」

## Soft submit / cancel / query

正式树里所有 `SFO${foNumeric}` / `` `SFO${…}` `` 只留一处调用：

```ts
import {
  keysForFulfillmentOrder,
  buildOrderExternalNoOrThrow,
} from "../wms/order-external-no";
import { getOrderRefPrefix } from "../lib/shop-order-ref.server";

const prefix = await getOrderRefPrefix(shop);
const resolved = keysForFulfillmentOrder({
  persistedExternalNo: rec?.externalNo,
  prefix,
  fulfillmentOrderId: fo.id,          // GID 或数字
  shopifyOrderName: order.name,       // Shopify Order.name，通常带 #
});
if (!resolved.ok || !resolved.keys) throw new Error(resolved.message);

await wms.submit({ ...existingBody, ...resolved.keys.submit });
await wms.cancel({ ...existingCancel, ...resolved.keys.cancel });
await wms.query?.({ ...existingQuery, ...resolved.keys.query });
```

第一次算出后立刻写入 `FulfillmentOrderSync.externalNo`。后面 cancel / query / retry 只读落库值。
