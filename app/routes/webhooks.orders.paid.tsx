/**
 * Webhook: orders/paid
 *
 * Handles Shopify orders/paid webhook for automatic order intake.
 * When Shop.autoSoftSubmit is true, triggers automatic fulfillment request
 * submission for paid orders on the Fulfillmen location.
 *
 * Flow:
 * 1. Verify HMAC signature
 * 2. Check if shop has autoSoftSubmit enabled
 * 3. If disabled → 200 (no action)
 * 4. If enabled → call extension point for FO submit (Ryan's implementation)
 */

import type { ActionFunctionArgs } from "react-router";
import { verifyWebhookHmac } from "../lib/webhook-hmac.server";
import { getAutoSoftSubmit } from "../lib/shop-settings.server";

interface OrdersPaidPayload {
  id: number;
  admin_graphql_api_id: string;
  name: string;
  order_number: number;
  fulfillment_status: string | null;
  financial_status: string;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const hmacHeader = request.headers.get("X-Shopify-Hmac-Sha256");
  const shopDomain = request.headers.get("X-Shopify-Shop-Domain");
  const topic = request.headers.get("X-Shopify-Topic");

  // Validate required headers
  if (!shopDomain) {
    return new Response("Missing shop domain", { status: 401 });
  }

  // Read raw body for HMAC verification
  const rawBody = await request.text();

  // Verify HMAC signature using existing utility
  const secret = process.env.SHOPIFY_API_SECRET;
  if (!verifyWebhookHmac(rawBody, hmacHeader, secret)) {
    return new Response("Invalid HMAC", { status: 401 });
  }

  // Validate topic
  if (topic !== "orders/paid") {
    return new Response("Invalid topic", { status: 400 });
  }

  // Parse payload
  let payload: OrdersPaidPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // Check if autoSoftSubmit is enabled for this shop
  const autoEnabled = await getAutoSoftSubmit(shopDomain);

  if (!autoEnabled) {
    // Auto-submit disabled, acknowledge webhook without action
    return new Response(JSON.stringify({ status: "skipped", reason: "autoSoftSubmit disabled" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Auto-submit enabled: call extension point for Ryan's implementation
  // TODO(Ryan): Implement the actual FO submit logic:
  // 1. Get admin client for shop (authenticate.webhook or similar)
  // 2. Query FOs for this order with requestStatus=UNSUBMITTED on Fulfillmen location
  // 3. For each UNSUBMITTED FO: fulfillmentOrderSubmitFulfillmentRequest(foId)
  // 4. Log audit trail
  // 5. Enqueue processor or rely on fulfillment_orders/fulfillment_request_submitted callback
  //
  // Idempotency:
  // - Already SUBMITTED FOs → skip
  // - FO with successful FulfillmentOrderSync → skip
  // - submit mutation userErrors (already requested) → treat as success/skip

  const result = await processAutoSoftSubmit(shopDomain, payload);

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

/**
 * Process automatic soft-submit for a paid order.
 *
 * TODO(Ryan): Replace this stub with actual implementation.
 */
async function processAutoSoftSubmit(
  shop: string,
  payload: OrdersPaidPayload,
): Promise<{ status: string; orderId: string; submittedFoIds?: string[]; error?: string }> {
  const orderId = payload.admin_graphql_api_id;

  // Stub implementation - Ryan to complete
  console.log(`[orders/paid] Auto soft-submit stub for shop=${shop} order=${orderId}`);

  return {
    status: "stub",
    orderId,
    submittedFoIds: [],
  };
}
