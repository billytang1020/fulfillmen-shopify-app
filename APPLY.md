# Jeff 合入说明（正式 Node tip，勿整页替换 GitHub 空 main）

GitHub `main` 是空壳。本分支是 **可 cherry-pick 的 tip #5 补丁**，接到 Guillermo 正式树（含现有 Settings / account-register）。

**不合不推 HK。** 等 Jeff 审合。无「改」= 不上正式。

## 合入步骤

1. 在正式 tip 上 `git cherry-pick` 本分支，或按文件拷贝。
2. `prisma/schema.prisma` 的 `Shop` 只加两列（见 `prisma/schema.register-warehouses.patch.md`）。
3. 跑 `prisma/migrations/20261031_add_register_warehouses/migration.sql`。
4. 按 `app/routes/app.settings.warehouses.snippet.md` 接到现有 `app.settings.tsx`。
5. 现有 `account/register` wrapper：先组原 body，再 `shapeAccountRegisterBody(body, form)`。
6. 列仓：复用现有内部 key 的 `GET /openapi/alibaba/warehouse/list`，不要新建 list API。

## 本 tip 做了什么

| 文件 | 作用 |
|------|------|
| `app/wms/register-warehouses.ts` | 默认惠州 536、排除 589、Style=4、payload 整形 |
| `app/wms/warehouse-list.server.ts` | list wrapper |
| `app/wms/account-register.server.ts` | register body 合并 `warehouseIds` + `defaultWarehouseId` |
| `app/lib/shop-warehouses.server.ts` | Shop 行持久化选仓 |
| `app/settings/warehouses-section.tsx` | Settings 多选 UI |
| `app/settings/register-warehouses.server.ts` | loader/action 接线 |
| `tests/register-warehouses.test.ts` | payload 形状 + 默认勾惠州 |

`app/lib/shop-warehouses.server.ts` 的 `import prisma from "../db.server"` 若正式树路径不同，只改这一处。

## Anders WMS tip 耦合（本 PR 不实现）

Register 字段若尚未上 WMS tip，Node **仍按契约发出**，不另起字段名。

WMS 侧须另开 tip（等 Jeff 合）：

1. `POST account/register` 收可选 `warehouseIds` / `defaultWarehouseId`
2. 建户成功后同流程开通 `GFF_CusMealMag`（每仓一行）
3. bind 新建 Style=8 写 `isStock` = `defaultWarehouseId`
4. 配置项 `ShopifyApp_RegisterDefaultWarehouseId`（建议 536）
5. 非法仓 → 36023 `field=warehouseIds`
6. 无分区可先开

Node 配置别名（可选，非密钥）：`SHOPIFY_APP_REGISTER_DEFAULT_WAREHOUSE_ID`
