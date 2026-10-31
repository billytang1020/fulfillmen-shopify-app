-- Tip #5: persist Settings warehouse picks for account/register.
-- Jeff: apply on the formal tip Shop table (PostgreSQL).
-- registerWarehouseIds = Anders warehouseIds; registerDefaultWarehouseId = defaultWarehouseId.

ALTER TABLE "Shop"
  ADD COLUMN IF NOT EXISTS "registerWarehouseIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "Shop"
  ADD COLUMN IF NOT EXISTS "registerDefaultWarehouseId" TEXT;
