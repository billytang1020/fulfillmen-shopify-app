/**
 * Orders Paid Webhook Tests
 *
 * Tests for the orders/paid webhook handler.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock shop-settings module
vi.mock("../app/lib/shop-settings.server", () => ({
  getAutoSoftSubmit: vi.fn(),
}));

import { getAutoSoftSubmit } from "../app/lib/shop-settings.server";
import {
  processOrdersPaid,
  type OrdersPaidPayload,
} from "../app/webhooks/orders-paid.server";

const mockPayload: OrdersPaidPayload = {
  id: 12345,
  admin_graphql_api_id: "gid://shopify/Order/12345",
  name: "#1001",
  order_number: 1001,
  fulfillment_status: null,
  financial_status: "paid",
  created_at: "2026-10-26T10:00:00Z",
  updated_at: "2026-10-26T10:00:00Z",
};

describe("processOrdersPaid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips processing when autoSoftSubmit is disabled", async () => {
    vi.mocked(getAutoSoftSubmit).mockResolvedValue(false);

    const result = await processOrdersPaid("test.myshopify.com", mockPayload);

    expect(result.success).toBe(true);
    expect(result.skipped).toBe(true);
    expect(result.reason).toContain("autoSoftSubmit is disabled");
  });

  it("processes order when autoSoftSubmit is enabled", async () => {
    vi.mocked(getAutoSoftSubmit).mockResolvedValue(true);

    const result = await processOrdersPaid("test.myshopify.com", mockPayload);

    expect(result.success).toBe(true);
    expect(result.skipped).toBe(false);
    // Stub implementation returns placeholder result
    expect(result.reason).toContain("Stub implementation");
  });

  it("calls getAutoSoftSubmit with correct shop domain", async () => {
    vi.mocked(getAutoSoftSubmit).mockResolvedValue(false);

    await processOrdersPaid("my-shop.myshopify.com", mockPayload);

    expect(getAutoSoftSubmit).toHaveBeenCalledWith("my-shop.myshopify.com");
  });
});
