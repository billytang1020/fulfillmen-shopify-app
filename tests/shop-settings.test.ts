/**
 * Shop Settings Tests
 *
 * Tests for the autoSoftSubmit helper functions.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma client
vi.mock("../app/lib/prisma.server", () => ({
  prisma: {
    shop: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from "../app/lib/prisma.server";
import {
  getAutoSoftSubmit,
  getShopSettings,
  setAutoSoftSubmit,
} from "../app/lib/shop-settings.server";

describe("getAutoSoftSubmit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns false when shop is not found", async () => {
    vi.mocked(prisma.shop.findUnique).mockResolvedValue(null);

    const result = await getAutoSoftSubmit("unknown.myshopify.com");

    expect(result).toBe(false);
  });

  it("returns false when WMS is not connected", async () => {
    vi.mocked(prisma.shop.findUnique).mockResolvedValue({
      autoSoftSubmit: true,
      wmsConnected: false,
    } as any);

    const result = await getAutoSoftSubmit("test.myshopify.com");

    expect(result).toBe(false);
  });

  it("returns false when autoSoftSubmit is disabled", async () => {
    vi.mocked(prisma.shop.findUnique).mockResolvedValue({
      autoSoftSubmit: false,
      wmsConnected: true,
    } as any);

    const result = await getAutoSoftSubmit("test.myshopify.com");

    expect(result).toBe(false);
  });

  it("returns true when WMS connected and autoSoftSubmit enabled", async () => {
    vi.mocked(prisma.shop.findUnique).mockResolvedValue({
      autoSoftSubmit: true,
      wmsConnected: true,
    } as any);

    const result = await getAutoSoftSubmit("test.myshopify.com");

    expect(result).toBe(true);
  });
});

describe("getShopSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when shop is not found", async () => {
    vi.mocked(prisma.shop.findUnique).mockResolvedValue(null);

    const result = await getShopSettings("unknown.myshopify.com");

    expect(result).toBe(null);
  });

  it("returns shop settings when found", async () => {
    vi.mocked(prisma.shop.findUnique).mockResolvedValue({
      autoSoftSubmit: true,
      wmsConnected: true,
    } as any);

    const result = await getShopSettings("test.myshopify.com");

    expect(result).toEqual({
      autoSoftSubmit: true,
      wmsConnected: true,
    });
  });
});

describe("setAutoSoftSubmit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true on successful update", async () => {
    vi.mocked(prisma.shop.update).mockResolvedValue({} as any);

    const result = await setAutoSoftSubmit("test.myshopify.com", true);

    expect(result).toBe(true);
    expect(prisma.shop.update).toHaveBeenCalledWith({
      where: { domain: "test.myshopify.com" },
      data: { autoSoftSubmit: true },
    });
  });

  it("returns false on update failure", async () => {
    vi.mocked(prisma.shop.update).mockRejectedValue(new Error("DB error"));

    const result = await setAutoSoftSubmit("test.myshopify.com", true);

    expect(result).toBe(false);
  });
});
