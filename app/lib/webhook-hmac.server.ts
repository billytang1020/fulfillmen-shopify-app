/**
 * Shopify Webhook HMAC Verification
 *
 * Verifies the authenticity of Shopify webhook requests using HMAC-SHA256.
 * This is critical for security - webhooks must be verified before processing.
 */

import crypto from "crypto";

/**
 * Verify Shopify webhook HMAC signature
 *
 * @param rawBody - The raw request body as a string
 * @param hmacHeader - The X-Shopify-Hmac-Sha256 header value
 * @returns true if the signature is valid
 */
export async function verifyWebhookHmac(
  rawBody: string,
  hmacHeader: string
): Promise<boolean> {
  const secret = process.env.SHOPIFY_API_SECRET;

  if (!secret) {
    console.error("[webhook-hmac] SHOPIFY_API_SECRET not configured");
    return false;
  }

  try {
    const computedHmac = crypto
      .createHmac("sha256", secret)
      .update(rawBody, "utf8")
      .digest("base64");

    // Use timingSafeEqual to prevent timing attacks
    const computedBuffer = Buffer.from(computedHmac);
    const headerBuffer = Buffer.from(hmacHeader);

    if (computedBuffer.length !== headerBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(computedBuffer, headerBuffer);
  } catch (error) {
    console.error("[webhook-hmac] Error verifying signature:", error);
    return false;
  }
}
