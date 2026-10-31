import { describe, expect, it } from "vitest";
import {
  AUTO_INTAKE_HELP,
  INTAKE_COPY,
  LEGACY_WAREHOUSE_AUTO_PUSH_PHRASE,
  WMS_SHOP_AUTO_PUSH_URL,
  impliesWarehouseAutoPush,
  justBoundSuccessMessage,
} from "../app/lib/intake-copy";

describe("intake copy", () => {
  it("softens the just-bound banner so it no longer claims warehouse auto-push", () => {
    const message = justBoundSuccessMessage("demo.myshopify.com");
    expect(message).toContain("demo.myshopify.com");
    expect(message).toContain("shop order draft");
    expect(message).toContain("进店铺订单草稿；仓单请用 WMS 自动推单");
    expect(impliesWarehouseAutoPush(message)).toBe(false);
    expect(message.toLowerCase()).not.toContain(LEGACY_WAREHOUSE_AUTO_PUSH_PHRASE);
  });

  it("softens automatic-intake help the same way", () => {
    expect(AUTO_INTAKE_HELP).toContain("shop order draft");
    expect(AUTO_INTAKE_HELP).toContain("进店铺订单草稿；仓单请用 WMS 自动推单");
    expect(AUTO_INTAKE_HELP).toContain(WMS_SHOP_AUTO_PUSH_URL);
    expect(impliesWarehouseAutoPush(AUTO_INTAKE_HELP)).toBe(false);
  });

  it("still flags the formal-tip legacy sentence as warehouse auto-push", () => {
    const legacy =
      "Orders assigned to the Fulfillmen location will be sent to the warehouse automatically.";
    expect(impliesWarehouseAutoPush(legacy)).toBe(true);
  });

  it("keeps English + Chinese as the existing Settings pattern (no locale files)", () => {
    expect(INTAKE_COPY.justBoundZh).toBe("进店铺订单草稿；仓单请用 WMS 自动推单");
    expect(INTAKE_COPY.autoIntakeHelpZh).toBe("进店铺订单草稿；仓单请用 WMS 自动推单");
  });
});
