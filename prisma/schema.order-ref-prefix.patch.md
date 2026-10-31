# Shop model 增量（合入正式 tip 的 `prisma/schema.prisma`）

在现有 `model Shop` 末尾加一列，不要改其它字段：

```prisma
  // Tip #4: 订单参考号前缀。空/NULL = 遗留 SFO{foNumeric}；有值 = {prefix}{Order.name}。
  // 同一 wmsCustomerId 下每店应唯一。WMS CreateShopOrder.OrderNo 公开长度 30。
  orderRefPrefix  String?
```
