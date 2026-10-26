/**
 * Shop Settings Helpers
 *
 * Provides helpers to read shop-level settings, particularly the autoSoftSubmit
 * flag for automatic order intake. Uses the existing Prisma client pattern.
 */

import prisma from "../db.server";

/**
 * Check if a shop has WMS binding connected (has wmsCustomerId or boundAt set).
 */
function isWmsConnected(shop: { wmsCustomerId: string | null; boundAt: Date | null }): boolean {
  return !!(shop.wmsCustomerId || shop.boundAt);
}

/**
 * Get the autoSoftSubmit setting for a shop.
 *
 * Used by the fulfillment module (Ryan's code) to determine whether to process
 * orders/paid webhook automatically.
 *
 * @param shop - The shop's myshopify.com domain (Shop.shop primary key)
 * @returns Promise<boolean> - true if automatic order intake is enabled AND WMS is connected
 */
export async function getAutoSoftSubmit(shop: string): Promise<boolean> {
  const row = await prisma.shop.findUnique({
    where: { shop },
    select: { autoSoftSubmit: true, wmsCustomerId: true, boundAt: true },
  });

  // If shop not found or WMS not connected, auto submit is disabled
  if (!row || !isWmsConnected(row)) {
    return false;
  }

  return row.autoSoftSubmit;
}

/**
 * Set the autoSoftSubmit setting for a shop.
 *
 * @param shop - The shop's myshopify.com domain
 * @param enabled - Whether to enable automatic order intake
 * @returns Promise<boolean> - true if update was successful
 */
export async function setAutoSoftSubmit(shop: string, enabled: boolean): Promise<boolean> {
  try {
    await prisma.shop.update({
      where: { shop },
      data: { autoSoftSubmit: enabled },
    });
    return true;
  } catch {
    return false;
  }
}
