# `app/routes/app.settings.tsx` 接线（合入正式 tip，不要整页替换）

## loader

```ts
import { loadRegisterWarehouseSettings } from "../settings/register-warehouses.server";
import { getWmsInternalGetJson } from "../lib/wms-client.server"; // 正式 tip 现有内部 key GET

// 在 authenticate.admin 之后：
const warehouse = await loadRegisterWarehouseSettings(
  session.shop,
  getWmsInternalGetJson(), // GET /openapi/alibaba/warehouse/list
);
return { /* 现有字段 */, warehouse };
```

`getWmsInternalGetJson` 是占位名：复用正式 tip 里已经在用的内部 key GET（开户前无 `fk_`）。不要新建 list 接口。

## action

```ts
import {
  persistRegisterWarehousesFromForm,
  accountRegisterBodyFromForm,
} from "../settings/register-warehouses.server";

if (intent === "saveRegisterWarehouses") {
  const fields = await persistRegisterWarehousesFromForm(session.shop, form);
  return { intent, result: { ok: true as const, fields } };
}

if (intent === "register") {
  const fields = await persistRegisterWarehousesFromForm(session.shop, form);
  // existingRegisterBody = 正式 tip 现有开户字段，不要改名
  const body = accountRegisterBodyFromForm(existingRegisterBody, form);
  // 调用现有 account/register wrapper；body 已含 warehouseIds + defaultWarehouseId
  const result = await existingAccountRegister(body);
  return { intent, result };
}

if (intent === "bind") {
  // 若 bind 也会打 Register：同样 merge，字段名不可改
  const body = accountRegisterBodyFromForm(existingRegisterBody, form);
  // ...
}
```

## JSX（未绑定区块内）

```tsx
import { WarehousesSection } from "../settings/warehouses-section";

<Form method="post">
  {/* 现有开户/绑定字段保持不动 */}
  <WarehousesSection
    warehouses={warehouse.warehouses}
    selection={warehouse.selection}
    listError={warehouse.listError}
    busy={busy}
    showRegisterActions
  />
</Form>
```

表单控件 name 必须是 `warehouseIds`（多选）和 `defaultWarehouseId`（默认仓）。
