# Jeff 合入说明（正式 Node tip，勿整页替换 GitHub 空 main）

GitHub `main` 是空壳。本分支是 **可 cherry-pick 的 tip #4 补丁**：
可配置店铺订单参考号前缀（WMS ExternalNo）。

**不合不推 HK。** 等 Jeff 审合。无「改」= 不上正式。不 Mark / Submit。

## 调查结论（假设已核实）

正式 Soft submit 现网 ExternalNo = **`SFO` + FO 数字**（`SFO{foNumeric}`）。

| 证据 | 值 |
|------|----|
| Jeff RO / 取消草稿 | `SFO22191996371075`（ShopOrder 724054） |
| Kent Sync Retry | `SFO5875767738575` |
| FoSync 注释 / Guillermo | `externalNo = SFO{foNumeric}`，`@unique` |

本 stub 没有正式 `mapper.ts` 拼串实现。合入时在正式树搜 `` `SFO` `` / `SFO${` / `externalNo =`，**只留一个** `buildOrderExternalNo` / `keysForFulfillmentOrder` 出口。

## 合入步骤

1. 在正式 tip 上 cherry-pick 或按文件拷贝 `app/wms/order-external-no.ts`。
2. `Shop` 只加一列（见 `prisma/schema.order-ref-prefix.patch.md`）。
3. 跑 `prisma/migrations/20261031_add_order_ref_prefix/migration.sql`。
4. 按 `app/routes/app.settings.order-ref.snippet.md` 接到现有 Settings。
5. Soft `orders/submit`、cancel、query / reconcile：**同一** `resolved.keys.*`。
6. 算出后立刻写入 `FulfillmentOrderSync.externalNo`；后续只读落库值。

`app/lib/shop-order-ref.server.ts` 的 `import prisma from "../db.server"` 若路径不同，只改这一处。

## 行为

| Settings `orderRefPrefix` | ExternalNo |
|---------------------------|------------|
| 空 / 未设（默认） | `SFO` + FO 数字，现有店不变 |
| `sample` + Shopify `#1001` | `sample#1001` |
| 已有 FoSync.externalNo | **用落库值**，改前缀不回溯 |

配置了前缀但拿不到 `Order.name`：**失败**，不准回退 SFO（否则同一 FO 两把钥匙）。

## Jeff：WMS ExternalNo 唯一性 / 索引（本 PR 不改 WMS）

请 Jeff 在 WMS 侧核对并留笔记（等你合，不阻塞本 Node tip 审）：

1. Soft `orders/submit` 的 `externalNo` 落哪一列？公开契约最近的是 **CreateShopOrder.OrderNo，长度 30**（重复时报「以下订单号重复」）。若 Soft 列更长，告诉 Node 改 `WMS_SHOP_ORDER_NO_MAX`。
2. 唯一性范围：按 **客户（cusCode）** 还是按 **店铺（ShopName / wmsShopId）**？
   - 若按客户唯一：同一客户两店都叫 `#1001`，前缀必须不同，否则 `sample#1001` 撞单。
   - 这就是 Settings 文案「同一客户下每店前缀须唯一」的原因。
3. 现网索引若假设 `SFO` + 纯数字，新格式带 `#` 和字母，确认索引 / 排序 / 校验不要拒。
4. 已存在的 `SFO…` 行不要回写。只有新 FO 在店配置了前缀后才用新格式。

## 超范围

- 不改 HK / 正式、不 Mark/Submit、不碰 `.env`
- 不做 WMS 唯一索引 DDL（Jeff）
- 不做仓单 Convert / Mark 出库
