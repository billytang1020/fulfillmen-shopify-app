-- Migration: Add autoSoftSubmit field to Shop model
-- Purpose: Enable automatic order intake when enabled (paid orders auto-submit to Fulfillmen)
-- Default: false (merchant must click Request Fulfillment manually)

ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "autoSoftSubmit" BOOLEAN NOT NULL DEFAULT false;

-- Note: This is a non-breaking, additive-only migration
-- Existing shops will have autoSoftSubmit = false (preserving current behavior)
-- Rollback: ALTER TABLE "Shop" DROP COLUMN "autoSoftSubmit";
