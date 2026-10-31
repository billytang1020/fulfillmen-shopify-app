/**
 * Settings loader/action 接线。正式 tip 的 app.settings.tsx 只需调用这里。
 *
 * loader:
 *   const warehouse = await loadRegisterWarehouseSettings(session.shop, getJson);
 *
 * action (save / register / bind):
 *   const fields = registerWarehouseFieldsFromForm(form, defaultId);
 *   await saveRegisterWarehouses(session.shop, fields, defaultId);
 *   const body = shapeAccountRegisterBody(existingBody, fields, defaultId);
 */

import { fetchOptionalWarehouses, type WmsGetJson } from "../wms/warehouse-list.server";
import { shapeAccountRegisterBody } from "../wms/account-register.server";
import {
  getPersistedRegisterWarehouses,
  saveRegisterWarehouses,
  viewRegisterWarehouses,
} from "../lib/shop-warehouses.server";
import {
  getRegisterDefaultWarehouseId,
  registerWarehouseFieldsFromForm,
  type RegisterWarehouseFields,
  type WarehouseListItem,
} from "../wms/register-warehouses";

export type RegisterWarehouseLoaderData = {
  warehouses: WarehouseListItem[];
  selection: RegisterWarehouseFields;
  defaultWarehouseIdConfig: string;
  listError: string | null;
};

export async function loadRegisterWarehouseSettings(
  shop: string,
  getJson: WmsGetJson,
  env: Record<string, string | undefined> = process.env,
): Promise<RegisterWarehouseLoaderData> {
  const defaultWarehouseIdConfig = getRegisterDefaultWarehouseId(env);
  const persisted = await getPersistedRegisterWarehouses(shop);

  let warehouses: WarehouseListItem[] = [];
  let listError: string | null = null;
  try {
    warehouses = await fetchOptionalWarehouses(getJson);
  } catch (err) {
    listError = err instanceof Error ? err.message : "Warehouse list request failed.";
  }

  return {
    warehouses,
    selection: viewRegisterWarehouses({
      optional: warehouses,
      persisted,
      defaultId: defaultWarehouseIdConfig,
    }),
    defaultWarehouseIdConfig,
    listError,
  };
}

export async function persistRegisterWarehousesFromForm(
  shop: string,
  form: Pick<FormData, "get" | "getAll">,
  env: Record<string, string | undefined> = process.env,
): Promise<RegisterWarehouseFields> {
  const defaultId = getRegisterDefaultWarehouseId(env);
  const fields = registerWarehouseFieldsFromForm(form, defaultId);
  return saveRegisterWarehouses(shop, fields, defaultId);
}

/**
 * register / account-register / bind→Register 共用：
 * 表单选仓 + 现有 body → 带 warehouseIds / defaultWarehouseId 的请求体。
 */
export function accountRegisterBodyFromForm(
  existingBody: Record<string, unknown>,
  form: Pick<FormData, "get" | "getAll">,
  env: Record<string, string | undefined> = process.env,
) {
  const defaultId = getRegisterDefaultWarehouseId(env);
  return shapeAccountRegisterBody(
    existingBody,
    registerWarehouseFieldsFromForm(form, defaultId),
    defaultId,
  );
}
