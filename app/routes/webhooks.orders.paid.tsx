/**
 * Webhook Route: orders/paid
 *
 * This route handles the Shopify orders/paid webhook.
 * Re-exports the action from the server module.
 */

export { action } from "../webhooks/orders-paid.server";
