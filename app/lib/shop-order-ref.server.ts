/**
 * 每店订单参考号前缀的读写。
 *
 * 正式 tip 的 Prisma Shop 只加一列 `orderRefPrefix`（见 prisma/migrations）。
 * db 入口若不是 ../db.server，合入时改这一处 import。
 *
 * 本文件不进本 stub 的 vitest：避免空 main 缺 prisma client。
 */

import prisma from "../db.server";
import {
  findDuplicateOrderRefPrefix,
  normalizeOrderRefPrefix,
  type ExternalNoBuildResult,
} from "../wms/order-external-no";

export type PersistedOrderRefPrefix = {
  prefix: string;
};

export async function getOrderRefPrefix(shop: string): Promise<string> {
  const row = await prisma.shop.findUnique({
    where: { shop },
    select: { orderRefPrefix: true },
  });
  return normalizeOrderRefPrefix(row?.orderRefPrefix);
}

export async function saveOrderRefPrefix(
  shop: string,
  raw: unknown,
  customerId?: string | null,
): Promise<{ ok: true; prefix: string } | { ok: false; error: string; clashShop?: string }> {
  const prefix = normalizeOrderRefPrefix(raw);

  const others = await prisma.shop.findMany({
    where: { shop: { not: shop } },
    select: {
      shop: true,
      orderRefPrefix: true,
      wmsCustomerId: true,
    },
  });

  const clashShop = findDuplicateOrderRefPrefix({
    shop,
    prefix,
    customerId,
    otherShops: others.map((row: { shop: string; orderRefPrefix?: string | null; wmsCustomerId?: string | null }) => ({
      shop: row.shop,
      prefix: row.orderRefPrefix,
      customerId: row.wmsCustomerId,
    })),
  });

  if (clashShop) {
    return {
      ok: false,
      error: `Prefix "${prefix}" is already used by ${clashShop}. Each shop under the same merchant needs a unique prefix.`,
      clashShop,
    };
  }

  await prisma.shop.upsert({
    where: { shop },
    create: { shop, orderRefPrefix: prefix || null },
    update: { orderRefPrefix: prefix || null },
  });

  return { ok: true, prefix };
}

/** Jeff 接线：从 Shop 读前缀，交给 build / resolve。 */
export async function orderRefInputForShop(shop: string): Promise<{
  prefix: string;
}> {
  return { prefix: await getOrderRefPrefix(shop) };
}

export type { ExternalNoBuildResult };
