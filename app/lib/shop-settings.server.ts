/**
 * Shop Settings Server Utilities
 *
 * Provides helpers to read/write shop-level settings, particularly
 * the autoSoftSubmit flag for automatic order intake.
 */

import { prisma } from "./prisma.server";

export interface ShopSettings {
  autoSoftSubmit: boolean;
  wmsConnected: boolean;
}

/**
 * Get the autoSoftSubmit setting for a shop.
 *
 * Used by the fulfillment module (Ryan's code) to determine whether
 * to process orders/paid webhook automatically.
 *
 * @param shopDomain - The shop's myshopify.com domain
 * @returns Promise<boolean> - true if automatic order intake is enabled
 */
export async function getAutoSoftSubmit(shopDomain: string): Promise<boolean> {
  const shop = await prisma.shop.findUnique({
    where: { domain: shopDomain },
    select: { autoSoftSubmit: true, wmsConnected: true },
  });

  // If shop not found or WMS not connected, auto submit is disabled
  if (!shop || !shop.wmsConnected) {
    return false;
  }

  return shop.autoSoftSubmit;
}

/**
 * Get full shop settings for the settings page.
 *
 * @param shopDomain - The shop's myshopify.com domain
 * @returns Promise<ShopSettings | null>
 */
export async function getShopSettings(
  shopDomain: string
): Promise<ShopSettings | null> {
  const shop = await prisma.shop.findUnique({
    where: { domain: shopDomain },
    select: { autoSoftSubmit: true, wmsConnected: true },
  });

  if (!shop) {
    return null;
  }

  return {
    autoSoftSubmit: shop.autoSoftSubmit,
    wmsConnected: shop.wmsConnected,
  };
}

/**
 * Update the autoSoftSubmit setting for a shop.
 *
 * @param shopDomain - The shop's myshopify.com domain
 * @param enabled - Whether to enable automatic order intake
 * @returns Promise<boolean> - true if update was successful
 */
export async function setAutoSoftSubmit(
  shopDomain: string,
  enabled: boolean
): Promise<boolean> {
  try {
    await prisma.shop.update({
      where: { domain: shopDomain },
      data: { autoSoftSubmit: enabled },
    });
    return true;
  } catch {
    return false;
  }
}
