-- Tip #4: per-shop Shopify order ExternalNo prefix.
-- NULL / empty = legacy SFO{foNumeric} (existing shops unchanged).
-- Set = {prefix}{Shopify Order.name}, e.g. sample#1001.

ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "orderRefPrefix" TEXT;

COMMENT ON COLUMN "Shop"."orderRefPrefix" IS
  'Shopify order ExternalNo prefix. Empty/NULL = legacy SFO+FO id. Set = {prefix}{Order.name}. Unique per shop under the same merchant. Aligns with WMS CreateShopOrder.OrderNo max 30.';
