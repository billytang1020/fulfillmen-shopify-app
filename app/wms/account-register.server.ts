/**
 * account/register 路径：在现有 register body 上附上 Anders 仓字段。
 *
 * WMS tip 依赖（本 PR 不实现）：
 *   - Register 成功建户后同流程开通 GFF_CusMealMag（每仓一行）
 *   - bind 新建 Style=8 时写 isStock = defaultWarehouseId
 *   - 无分区可先开通
 *
 * 若 WMS Register 尚未收这两个字段，Node 仍按契约整形发出，不另起字段名。
 */

import {
  ACCOUNT_REGISTER_PATH,
  buildRegisterWarehouseFields,
  mergeRegisterWarehouseFields,
  type RegisterWarehouseFields,
  type WarehouseSelectionInput,
} from "./register-warehouses";

export { ACCOUNT_REGISTER_PATH };

export type AccountRegisterBody = Record<string, unknown> & RegisterWarehouseFields;

/**
 * 给现有 register / account-register 调用点用：
 * 先组原来的 body，再走这一层，保证一定带 warehouseIds + defaultWarehouseId。
 */
export function shapeAccountRegisterBody(
  existingBody: Record<string, unknown>,
  selection: WarehouseSelectionInput = {},
  defaultId?: string,
): AccountRegisterBody {
  return mergeRegisterWarehouseFields(existingBody, selection, defaultId);
}

/** 仅仓字段（Settings 已选、其它开户字段由现有 register 表单提供）。 */
export function registerWarehousePayload(
  selection: WarehouseSelectionInput = {},
  defaultId?: string,
): RegisterWarehouseFields {
  return buildRegisterWarehouseFields(selection, defaultId);
}
