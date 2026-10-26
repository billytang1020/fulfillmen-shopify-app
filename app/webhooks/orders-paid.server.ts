/**
 * Orders Paid Webhook Handler
 *
 * Handles Shopify orders/paid webhook events for automatic order intake.
 * When autoSoftSubmit is enabled, this triggers automatic fulfillment request
 * submission for paid orders.
 *
 * Webhook flow:
 * 1. Shopify sends orders/paid event
 * 2. Validate HMAC signature
 * 3. Check if shop has autoSoftSubmit enabled
 * 4. If enabled, find UNSUBMITTED FOs for the order and submit fulfillment requests
 * 5. After submit, the existing FULFILLMENT_REQUEST pipeline handles WMS soft/confirm
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { getAutoSoftSubmit } from "../lib/shop-settings.server";
import { verifyWebhookHmac } from "../lib/webhook-hmac.server";

export interface OrdersPaidPayload {
  id: number;
  admin_graphql_api_id: string;
  name: string;
  order_number: number;
  fulfillment_status: string | null;
  financial_status: string;
  created_at: string;
  updated_at: string;
}

export interface AutoSubmitResult {
  success: boolean;
  skipped: boolean;
  reason?: string;
  submittedFoIds?: string[];
  errors?: string[];
}

/**
 * Process an orders/paid webhook
 *
 * @param shopDomain - The shop's myshopify.com domain
 * @param payload - The webhook payload
 * @returns AutoSubmitResult
 */
export async function processOrdersPaid(
  shopDomain: string,
  payload: OrdersPaidPayload
): Promise<AutoSubmitResult> {
  // Check if autoSoftSubmit is enabled for this shop
  const autoEnabled = await getAutoSoftSubmit(shopDomain);

  if (!autoEnabled) {
    return {
      success: true,
      skipped: true,
      reason: "autoSoftSubmit is disabled for this shop",
    };
  }

  // Extension point for Ryan's implementation:
  // TODO(Ryan): Implement the following logic:
  // 1. List FOs for this order with requestStatus=UNSUBMITTED on Fulfillmen location
  // 2. For each UNSUBMITTED FO, call fulfillmentOrderSubmitFulfillmentRequest(foId)
  // 3. On success, either:
  //    a. Enqueue the shop for FULFILLMENT_REQUEST processing, OR
  //    b. Wait for Shopify fulfillment_orders/fulfillment_request_submitted callback
  // 4. Handle idempotency: skip if FO already SUBMITTED or has successful FulfillmentOrderSync
  //
  // Placeholder implementation returns success to acknowledge webhook
  const result = await submitFulfillmentRequestsForOrder(shopDomain, payload);

  return result;
}

/**
 * Submit fulfillment requests for all UNSUBMITTED FOs of an order
 *
 * TODO(Ryan): Implement this function with:
 * - GraphQL query to list FOs by order ID with requestStatus filter
 * - fulfillmentOrderSubmitFulfillmentRequest mutation
 * - Idempotency checks against FulfillmentOrderSync table
 * - Error handling with exponential backoff for transient errors
 *
 * @param shopDomain - The shop's myshopify.com domain
 * @param payload - The orders/paid webhook payload
 */
async function submitFulfillmentRequestsForOrder(
  shopDomain: string,
  payload: OrdersPaidPayload
): Promise<AutoSubmitResult> {
  const orderId = payload.admin_graphql_api_id;

  // TODO(Ryan): Replace this stub with actual implementation
  // Steps:
  // 1. Get admin client for shop
  // 2. Query FOs for order: assignedFulfillmentOrders(assignmentStatus: ...) or order.fulfillmentOrders
  // 3. Filter to UNSUBMITTED status on Fulfillmen location
  // 4. For each: fulfillmentOrderSubmitFulfillmentRequest mutation
  // 5. Log audit trail
  // 6. Enqueue processor or rely on webhook callback

  console.log(
    `[orders/paid] Auto-submit placeholder for shop=${shopDomain} order=${orderId}`
  );

  return {
    success: true,
    skipped: false,
    reason: "Stub implementation - Ryan to complete fulfillment request submission",
    submittedFoIds: [],
  };
}

/**
 * Remix action handler for orders/paid webhook route
 */
export async function action({ request }: ActionFunctionArgs) {
  // Verify HMAC signature
  const hmacHeader = request.headers.get("X-Shopify-Hmac-Sha256");
  const shopDomain = request.headers.get("X-Shopify-Shop-Domain");
  const topic = request.headers.get("X-Shopify-Topic");

  if (!hmacHeader || !shopDomain) {
    return json({ error: "Missing required headers" }, { status: 401 });
  }

  if (topic !== "orders/paid") {
    return json({ error: "Invalid topic" }, { status: 400 });
  }

  const rawBody = await request.text();

  const isValid = await verifyWebhookHmac(rawBody, hmacHeader);
  if (!isValid) {
    return json({ error: "Invalid HMAC signature" }, { status: 401 });
  }

  let payload: OrdersPaidPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  try {
    const result = await processOrdersPaid(shopDomain, payload);

    // Always return 200 to acknowledge webhook receipt
    // Shopify will retry on non-2xx responses
    return json(result, { status: 200 });
  } catch (error) {
    console.error("[orders/paid] Error processing webhook:", error);

    // Return 200 anyway to prevent webhook retries for unexpected errors
    // The error is logged for investigation
    return json(
      {
        success: false,
        skipped: false,
        reason: "Internal error - logged for investigation",
      },
      { status: 200 }
    );
  }
}
