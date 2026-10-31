/**
 * Settings 选仓面板：多选 Style=4，默认勾惠州 536。
 *
 * 接到现有 app/routes/app.settings.tsx：
 *   1. loader 返回 warehouses / warehouseSelection
 *   2. action 处理 saveRegisterWarehouses / register
 *   3. 未绑定区块里渲染 <WarehousesSection />
 *
 * 用原生 checkbox/radio，name 必须是 warehouseIds / defaultWarehouseId，
 * 与 Anders 契约和 registerWarehouseFieldsFromForm 对齐。
 */

import type { RegisterWarehouseFields, WarehouseListItem } from "../wms/register-warehouses";

const labelStyle = { display: "block", marginTop: 8 };
const hintStyle = { fontSize: 12, opacity: 0.8 };

export function WarehousesSection(props: {
  warehouses: WarehouseListItem[];
  selection: RegisterWarehouseFields;
  listError?: string | null;
  busy?: boolean;
  /** 未绑定：可保存选仓，并随 register 一起提交。 */
  showRegisterActions?: boolean;
}) {
  const { warehouses, selection, listError, busy, showRegisterActions = true } = props;

  return (
    <s-section heading="Fulfillment warehouses">
      <s-paragraph>
        Choose the warehouses to open with your Fulfillmen account. Huizhou is
        selected by default. You can add any other active warehouse.
      </s-paragraph>
      {listError ? (
        <s-banner tone="warning" heading="Could not load warehouses">
          <s-paragraph>
            {listError} Huizhou (536) will still be sent on register.
          </s-paragraph>
        </s-banner>
      ) : null}
      {warehouses.length === 0 && !listError ? (
        <s-paragraph>
          No optional warehouses were returned. Register will use the default
          Huizhou warehouse (536).
        </s-paragraph>
      ) : null}

      <s-stack direction="block" gap="tight">
        {warehouses.map((wh) => {
          const checked = selection.warehouseIds.includes(wh.id);
          const isHuizhou = wh.id === "536";
          return (
            <label key={wh.id} style={labelStyle}>
              <input
                type="checkbox"
                name="warehouseIds"
                value={wh.id}
                defaultChecked={checked}
                disabled={busy}
              />{" "}
              {wh.name}
              {isHuizhou ? " (Huizhou, default)" : ""}
              <span style={hintStyle}> · {wh.id}</span>
              <br />
              <input
                type="radio"
                name="defaultWarehouseId"
                value={wh.id}
                defaultChecked={selection.defaultWarehouseId === wh.id}
                disabled={busy}
              />{" "}
              <span style={hintStyle}>Use as default stock warehouse</span>
            </label>
          );
        })}
      </s-stack>

      {/* 惠州不在可选列表、但默认选中时，用 hidden 带上；服务端空表单也会回落到 536 */}
      {!warehouses.some((wh) => wh.id === "536") && selection.warehouseIds.includes("536") ? (
        <input type="hidden" name="warehouseIds" value="536" />
      ) : null}
      {!warehouses.some((wh) => wh.id === selection.defaultWarehouseId) ? (
        <input type="hidden" name="defaultWarehouseId" value={selection.defaultWarehouseId} />
      ) : null}

      {showRegisterActions ? (
        <s-stack direction="inline" gap="base">
          <button type="submit" name="intent" value="saveRegisterWarehouses" disabled={busy}>
            Save warehouses
          </button>
          <button type="submit" name="intent" value="register" disabled={busy}>
            Create account with selected warehouses
          </button>
        </s-stack>
      ) : null}
    </s-section>
  );
}
