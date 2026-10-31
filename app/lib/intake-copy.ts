/**
 * Merchant-facing intake copy (2026-10-31 Billy).
 *
 * Formal tip Settings is English-only (no locales/). Keep that pattern, and add
 * a brief Chinese line so the warehouse auto-push expectation is unambiguous.
 *
 * APPLY (Jeff, formal tip `app/routes/app.settings.tsx`):
 * 1. `import { justBoundSuccessMessage, AUTO_INTAKE_HELP } from "../lib/intake-copy";`
 * 2. Replace the just-bound paragraph that currently says
 *    "Orders assigned to the Fulfillmen location will be sent to the warehouse automatically."
 *    with `{justBoundSuccessMessage(shop)}`.
 * 3. If the Automatic order intake blurb still says orders are "sent to Fulfillmen
 *    for fulfillment" / "automatically sent to Fulfillmen", replace it with
 *    `AUTO_INTAKE_HELP`.
 */

/** Existing WMS UI merchants use to push shop drafts → warehouse / outbound. */
export const WMS_SHOP_AUTO_PUSH_URL =
  "https://wms.fulfillmen.com/user/shop/shop_order.aspx";

/** Phrase that must no longer appear in App UI after this tip. */
export const LEGACY_WAREHOUSE_AUTO_PUSH_PHRASE =
  "sent to the warehouse automatically";

export const INTAKE_COPY = {
  /**
   * Just-bound success banner. English first (existing Settings voice),
   * then the required Chinese one-liner.
   */
  justBoundEn: (shop: string) =>
    `${shop} is now connected to Fulfillmen. New orders become a shop order draft; push warehouse orders with WMS auto-push.`,
  justBoundZh: "进店铺订单草稿；仓单请用 WMS 自动推单",
  autoIntakeHelpEn:
    "When enabled, paid orders create a Fulfillmen shop order draft. Warehouse / outbound orders are pushed from WMS auto-push, not by this App.",
  autoIntakeHelpZh: "进店铺订单草稿；仓单请用 WMS 自动推单",
} as const;

/** One paragraph for the just-bound success banner. */
export function justBoundSuccessMessage(shop: string): string {
  return `${INTAKE_COPY.justBoundEn(shop)} ${INTAKE_COPY.justBoundZh}`;
}

/** Help text for the Automatic order intake toggle (if that block is on the tip). */
export const AUTO_INTAKE_HELP = `${INTAKE_COPY.autoIntakeHelpEn} ${INTAKE_COPY.autoIntakeHelpZh} (${WMS_SHOP_AUTO_PUSH_URL})`;

/** True if copy still claims the App auto-pushes to the warehouse. */
export function impliesWarehouseAutoPush(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes(LEGACY_WAREHOUSE_AUTO_PUSH_PHRASE) ||
    lower.includes("sent to the warehouse") ||
    lower.includes("automatically sent to fulfillmen for fulfillment")
  );
}
