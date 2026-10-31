/**
 * 列仓给 Settings：复用 GET /openapi/alibaba/warehouse/list。
 * 开户前无 fk_，走现有内部 key / Node wrapper（Jeff 接到正式 tip 的 WMS client 即可）。
 *
 * 本 tip 不新开 shopify-app/warehouses 接口。
 */

import {
  WAREHOUSE_LIST_PATH,
  parseWarehouseListResponse,
  selectOptionalWarehouses,
  type WarehouseListItem,
} from "./register-warehouses";

export type WmsGetJson = (path: string) => Promise<unknown>;

export async function fetchOptionalWarehouses(
  getJson: WmsGetJson,
): Promise<WarehouseListItem[]> {
  const payload = await getJson(WAREHOUSE_LIST_PATH);
  return selectOptionalWarehouses(parseWarehouseListResponse(payload));
}
