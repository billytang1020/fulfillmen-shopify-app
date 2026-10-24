/**
 * User-facing binding error messages for Fulfillmen WMS API integration.
 * These messages are shown to merchants when connecting their account.
 *
 * Note: Avoid exposing technical details like API key prefixes (fk_test_, fk_live_)
 * to keep the user experience friendly and non-intimidating.
 */

export const BindingMessages = {
  /**
   * Shown when the API key environment does not match the current app environment.
   * For example, using a test key in production or vice versa.
   */
  WRONG_KEY_ENV:
    "This API key is not valid for this app environment. Please use the key issued for this app, or contact support at service@fulfillmen.com for assistance.",

  /**
   * Authentication error when environment mismatch is detected.
   */
  AUTH_WRONG_ENV:
    "The provided credentials do not match this app environment. Please verify you are using the correct API key for this app.",

  /**
   * Generic invalid key error.
   */
  INVALID_KEY: "The API key you entered is invalid. Please check and try again.",

  /**
   * Connection successful.
   */
  CONNECTION_SUCCESS: "Your Fulfillmen account has been connected successfully.",

  /**
   * Generic connection error.
   */
  CONNECTION_ERROR:
    "Could not connect to your Fulfillmen account. Please try again or contact support at service@fulfillmen.com.",
} as const;

export type BindingMessageKey = keyof typeof BindingMessages;

export function getBindingMessage(key: BindingMessageKey): string {
  return BindingMessages[key];
}
