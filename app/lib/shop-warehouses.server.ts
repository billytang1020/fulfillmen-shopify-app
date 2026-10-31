/**
 * 把 Settings 勾选的仓存到 Shop 行，供 register / bind 再读。
 *
 * 正式 tip 的 Prisma Shop 模型只需加两列（见 prisma/migrations）。
 * db 入口若不是 ../db.server，改这一处 import 即可。
 */

import prisma from "../db.server";
import {
  buildRegisterWarehouseFields,
  resolveDefaultWarehouseId,
  resolveSelectedWarehouseIds,
  type RegisterWarehouseFields,
  type WarehouseListItem,
} from "../wms/register-warehouses";

export type PersistedRegisterWarehouses = {
  warehouseIds: string[];
  defaultWarehouseId: string | null;
};

export async function getPersistedRegisterWarehouses(
  shop: string,
): Promise<PersistedRegisterWarehouses> {
  const row = await prisma.shop.findUnique({
    where: { shop },
    select: {
      registerWarehouseIds: true,
      registerDefaultWarehouseId: true,
    },
  });

  return {
    warehouseIds: Array.isArray(row?.registerWarehouseIds)
      ? row.registerWarehouseIds.map(String).filter(Boolean)
      : [],
    defaultWarehouseId: row?.registerDefaultWarehouseId
      ? String(row.registerDefaultWarehouseId)
      : null,
  };
}

export async function saveRegisterWarehouses(
  shop: string,
  selection: { warehouseIds?: unknown[]; defaultWarehouseId?: unknown },
  defaultId?: string,
): Promise<RegisterWarehouseFields> {
  const fields = buildRegisterWarehouseFields(selection, defaultId);
  await prisma.shop.upsert({
    where: { shop },
    create: {
      shop,
      registerWarehouseIds: fields.warehouseIds,
      registerDefaultWarehouseId: fields.defaultWarehouseId,
    },
    update: {
      registerWarehouseIds: fields.warehouseIds,
      registerDefaultWarehouseId: fields.defaultWarehouseId,
    },
  });
  return fields;
}

/** loader 用：列表 + 默认勾惠州（或已保存选仓）。 */
export function viewRegisterWarehouses(args: {
  optional: readonly WarehouseListItem[];
  persisted: PersistedRegisterWarehouses;
  defaultId?: string;
}): RegisterWarehouseFields {
  const warehouseIds = resolveSelectedWarehouseIds({
    optional: args.optional,
    persistedIds: args.persisted.warehouseIds,
    defaultId: args.defaultId,
  });
  const defaultWarehouseId = resolveDefaultWarehouseId({
    warehouseIds,
    persistedDefaultId: args.persisted.defaultWarehouseId,
    defaultId: args.defaultId,
  });
  return { warehouseIds, defaultWarehouseId };
}
