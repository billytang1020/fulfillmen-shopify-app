# fulfillmen-shopify-app

GitHub `main` 是空壳。本分支是 **tip #4** 可 cherry-pick 补丁，不是整树替换。

## Tip #4 — 可配置订单参考号前缀

现网 Soft submit 的 WMS ExternalNo / 店铺参考号是硬编码：

```
SFO + Shopify Fulfillment Order 数字
例：FO 22191996371075 → SFO22191996371075
```

多店商家分不清店。Settings 增加每店前缀：

| `orderRefPrefix` | ExternalNo |
|------------------|------------|
| 空（默认） | 遗留 `SFO{foNumeric}`，现有店不变 |
| `sample` + Shopify `#1001` | `sample#1001` |

Soft **submit / cancel / query** 必须用同一把 `externalNo`。已写入 `FulfillmentOrderSync` 的值优先，改前缀不回溯。

### 唯一性

同一 Fulfillmen 客户下，每店前缀应唯一。Shopify 单号按店重计（都有 `#1001`）；前缀重复会在 WMS 撞 ExternalNo。空前缀走 SFO+FO，FO id 全局唯一，不参与前缀碰撞。

### WMS 长度（仓库/公开契约能找到的约束）

公开 `POST /api-json/ShopOrder.ashx?action=CreateShopOrder`：

- `OrderNo`：String，必填，**长度 30**
- 重复：`以下订单号重复:…`

Node 按 30 封顶（`WMS_SHOP_ORDER_NO_MAX`），前缀最多 16。超长拒绝、不截断。Jeff 若确认 Soft `externalNo` 列更长，只改该常量。契约注释里没有更长的 Soft ExternalNo 上限。

等 Jeff 审合。无「改」= 不上 HK。不 Mark / Submit。

合入步骤见 `APPLY.md`。
