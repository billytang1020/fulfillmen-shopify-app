-- Migration: Add autoSoftSubmit field to Shop model
-- Purpose: Enable automatic order intake when enabled (paid orders auto-submit to Fulfillmen)
-- Default: false (merchant must click Request Fulfillment manually)

ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "autoSoftSubmit" BOOLEAN NOT NULL DEFAULT false;

-- Rollback: ALTER TABLE "Shop" DROP COLUMN "autoSoftSubmit";
