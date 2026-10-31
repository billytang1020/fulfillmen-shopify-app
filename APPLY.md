# Jeff 合入说明（正式 Node tip，勿整页替换 GitHub 空 main）

GitHub `main` 是空壳。本分支是 **可 cherry-pick 的 tip #3 补丁**：Soft 因地址不完整卡住后，商家在 Shopify Admin 改完地址，App 用**当前**收货地址、**同一 ExternalNo** 再 Soft。

**不合不推 HK。** 等 Jeff 审合。无「改」= 不上正式。不 Mark / Submit Partner listing。

## 合入步骤

1. 在正式 tip 上 `git cherry-pick` 本分支决策核，或按文件拷贝。
2. Soft 失败路径（`processFulfillmentRequests` / `orders/submit` 之后）：若 `isAddressIncompleteFailure(wmsResponse)`，写 `recordAddressIncomplete(...)`，**不要** `shopify.reject`。
3. 订单 / FO 列表按 `app/routes/app.orders.address-resync.snippet.md` 接线按钮与 `intent=resyncAddress`。
4. `resyncAddressAndSoftSubmit` 的 `wmsSoftSubmit` **只接现网 Soft**（`orders/submit` / `wms.submit`）。不要接 `CreateOrder` / `Convert` / `Confirm`。
5. 若 tip #1（`buildSoftDraftSubmitOptions`）已经合进正式树：在 submit body 上 spread 它，三个 Soft-only 字段与本 tip 一致。本树 **没有** 该 helper，重试体已自带 `softHoldOnly: true` / `convertToOutbound: false`。

`address-resync-ui.ts` 是判定 + 文案，**不**依赖 `.server.ts`。行组件只 import 这个文件。

## 本 tip 做了什么

| 文件 | 作用 |
|------|------|
| `app/fulfillment/address-incomplete-resync.server.ts` | 认出地址失败、读当前 Shopify 地址、同一 ExternalNo Soft、不重复建店单 |
| `app/fulfillment/address-resync-ui.ts` | 「改完地址再同步 / Re-sync address」可见性 |
| `app/routes/app.orders.address-resync.snippet.md` | 正式树 FO 行接线 |
| `tests/address-incomplete-resync.test.ts` | 重试路径 + 不 Convert + 不重复 shopOrderId |

## WMS 耦合（Martin / Jeff，本 PR 不实现）

Node 只打现网 Soft，**不另起 API**。WMS 必须接受「同一 ExternalNo 再 Soft」：

1. `ExternalNo = SFO<foNumeric>` 已存在 → **更新**该 `MZL_ShopOrders` 的收货地址，禁止再插一行。
2. 请求带 `shopOrderId` → 只更新这一行（RefreshDraft / 现网 Soft 更新语义）。
3. 请求带 `softHoldOnly` / `convertToOutbound:false` / `refreshAddress:true` → 停在店单草稿，不要 Convert→Confirm。
4. 地址仍不完整 → 回 `ADDRESS_INCOMPLETE`（或 `ADDRESS_INVALID` / 36057），`shopOrderId` 仍是原来那张。
5. 成功 → 回同一 `shopOrderId`，Status=0 SoftHold。

在 WMS 对齐之前，Node 仍会发出上述契约；若 WMS 回了另一张 `shopOrderId`，Node **不改存新 id**（`duplicateRisk`），避免链到重复店单。
