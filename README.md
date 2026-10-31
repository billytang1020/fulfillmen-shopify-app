# fulfillmen-shopify-app

Fulfillmen Logistics Shopify App（Node）。

## Tip #5 — Settings 默认惠州仓 + Register 带仓

老板拍板（Billy 2026-10-31，Anders 方案全按推荐）：

- 默认惠州 = **536**（Huizhou），排除 **589**（HuiZhou3FL）
- 可选仓 = 全部 Style=4
- Settings 多选 → `account/register` 带 `warehouseIds` + `defaultWarehouseId`
- 默认仓用配置项（可改），不是写死到业务逻辑之外

合入方式见 `APPLY.md`。**等 Jeff 审合。不 Mark/Submit。无「改」= 不上 HK。**

### Register 契约增量（字段名不可改）

```json
{
  "warehouseIds": ["536"],
  "defaultWarehouseId": "536"
}
```

空/缺省 `warehouseIds` → `["536"]`（或配置默认仓）。  
`defaultWarehouseId` 缺省 → `warehouseIds[0]`。

列仓：`GET /openapi/alibaba/warehouse/list`（内部 key，开户前无 `fk_`）。

### WMS tip 依赖

Anders Register 须开通 `GFF_CusMealMag`，bind 写 `isStock`。本 PR 只整形 Node payload + Settings UI。
