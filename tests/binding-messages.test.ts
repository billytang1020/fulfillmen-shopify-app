import { describe, it, expect } from "vitest";
import { BindingMessages, getBindingMessage } from "../app/lib/binding-messages";

describe("BindingMessages", () => {
  describe("WRONG_KEY_ENV", () => {
    it("should have a user-friendly message without technical prefixes", () => {
      const message = BindingMessages.WRONG_KEY_ENV;

      // Verify the message is user-friendly
      expect(message).toContain("not valid for this app environment");
      expect(message).toContain("service@fulfillmen.com");

      // Verify technical details are NOT exposed
      expect(message).not.toContain("fk_test_");
      expect(message).not.toContain("fk_live_");
      expect(message).not.toContain("prefix");
    });

    it("should match the expected message", () => {
      expect(BindingMessages.WRONG_KEY_ENV).toBe(
        "This API key is not valid for this app environment. Please use the key issued for this app, or contact support at service@fulfillmen.com for assistance."
      );
    });
  });

  describe("AUTH_WRONG_ENV", () => {
    it("should have a user-friendly message without technical prefixes", () => {
      const message = BindingMessages.AUTH_WRONG_ENV;

      // Verify the message is user-friendly
      expect(message).toContain("do not match this app environment");

      // Verify technical details are NOT exposed
      expect(message).not.toContain("fk_test_");
      expect(message).not.toContain("fk_live_");
      expect(message).not.toContain("prefix");
    });

    it("should match the expected message", () => {
      expect(BindingMessages.AUTH_WRONG_ENV).toBe(
        "The provided credentials do not match this app environment. Please verify you are using the correct API key for this app."
      );
    });
  });

  describe("getBindingMessage helper", () => {
    it("should return the correct message for WRONG_KEY_ENV", () => {
      expect(getBindingMessage("WRONG_KEY_ENV")).toBe(BindingMessages.WRONG_KEY_ENV);
    });

    it("should return the correct message for AUTH_WRONG_ENV", () => {
      expect(getBindingMessage("AUTH_WRONG_ENV")).toBe(BindingMessages.AUTH_WRONG_ENV);
    });

    it("should return the correct message for all keys", () => {
      const keys = Object.keys(BindingMessages) as (keyof typeof BindingMessages)[];
      for (const key of keys) {
        expect(getBindingMessage(key)).toBe(BindingMessages[key]);
      }
    });
  });

  describe("message content validation", () => {
    it("should have no messages exposing API key format details", () => {
      const allMessages = Object.values(BindingMessages);
      for (const message of allMessages) {
        expect(message).not.toContain("fk_test_");
        expect(message).not.toContain("fk_live_");
        expect(message).not.toMatch(/test keys start with/i);
        expect(message).not.toMatch(/live keys start with/i);
      }
    });
  });
});
