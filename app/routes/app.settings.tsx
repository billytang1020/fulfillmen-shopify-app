/**
 * Fulfillmen Account Settings Page
 *
 * Handles WMS API key binding, connection status, and automatic order intake toggle.
 */

import { useState, useCallback } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useActionData } from "@remix-run/react";
import { getShopSettings, setAutoSoftSubmit } from "../lib/shop-settings.server";

// Placeholder: Replace with actual session/auth utility
async function getShopDomain(request: Request): Promise<string | null> {
  // TODO: Extract shop domain from session/auth context
  return null;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const shopDomain = await getShopDomain(request);
  if (!shopDomain) {
    return json({ settings: null, error: "Not authenticated" });
  }

  const settings = await getShopSettings(shopDomain);
  return json({ settings, error: null });
}

export async function action({ request }: ActionFunctionArgs) {
  const shopDomain = await getShopDomain(request);
  if (!shopDomain) {
    return json({ success: false, error: "Not authenticated" });
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "saveAutoSoftSubmit") {
    const enabled = formData.get("autoSoftSubmit") === "true";
    const success = await setAutoSoftSubmit(shopDomain, enabled);
    return json({
      success,
      error: success ? null : "Failed to save setting",
      intent,
    });
  }

  return json({ success: false, error: "Unknown action" });
}

interface ConnectionBannerProps {
  type: "error" | "success" | "warning" | "info";
  title: string;
  body: string;
}

function ConnectionBanner({ type, title, body }: ConnectionBannerProps) {
  const styles: Record<string, string> = {
    error: "bg-red-50 border-red-200 text-red-800",
    success: "bg-green-50 border-green-200 text-green-800",
    warning: "bg-yellow-50 border-yellow-200 text-yellow-800",
    info: "bg-blue-50 border-blue-200 text-blue-800",
  };

  return (
    <div className={`p-4 border rounded-md mb-4 ${styles[type]}`}>
      <h3 className="font-medium">{title}</h3>
      <p className="mt-1 text-sm opacity-90">{body}</p>
    </div>
  );
}

interface AutoOrderIntakeSectionProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  saving: boolean;
}

function AutoOrderIntakeSection({
  enabled,
  onToggle,
  saving,
}: AutoOrderIntakeSectionProps) {
  return (
    <div className="mt-8 p-6 bg-white border border-gray-200 rounded-lg shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900 mb-2">
        Automatic order intake
      </h2>
      <p className="text-sm text-gray-600 mb-4">
        When enabled, paid orders are automatically sent to Fulfillmen for
        fulfillment without clicking Request Fulfillment. When disabled, you
        must manually request fulfillment for each order.
      </p>

      <label className="flex items-center cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          disabled={saving}
          className="w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 disabled:opacity-50"
        />
        <span className="ml-3 text-sm font-medium text-gray-700">
          Automatically send paid orders to Fulfillmen
        </span>
        {saving && (
          <span className="ml-2 text-xs text-gray-500">(Saving...)</span>
        )}
      </label>

      <p className="mt-3 text-xs text-gray-500">
        Note: This setting only affects new orders. Previously placed orders
        that have not been requested will not be automatically sent.
      </p>
    </div>
  );
}

export default function SettingsPage() {
  const { settings, error: loadError } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();

  const [autoSoftSubmit, setAutoSoftSubmitState] = useState(
    settings?.autoSoftSubmit ?? false
  );
  const [saving, setSaving] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [connectionSuccess, setConnectionSuccess] = useState(false);

  const handleAutoSoftSubmitToggle = useCallback(
    (enabled: boolean) => {
      setAutoSoftSubmitState(enabled);
      setSaving(true);

      const formData = new FormData();
      formData.set("intent", "saveAutoSoftSubmit");
      formData.set("autoSoftSubmit", enabled.toString());

      submit(formData, {
        method: "post",
        replace: true,
      });

      // Reset saving state after a short delay (actual state comes from server)
      setTimeout(() => setSaving(false), 500);
    },
    [submit]
  );

  const handleConnect = async () => {
    setConnectionError(null);
    setConnectionSuccess(false);

    if (!apiKey.trim()) {
      setConnectionError(
        "The API key you entered is invalid. Please check and try again."
      );
      return;
    }

    try {
      // Placeholder for actual API connection logic
      setConnectionSuccess(true);
    } catch {
      setConnectionError(
        "Could not connect to your Fulfillmen account. Please try again or contact support at service@fulfillmen.com."
      );
    }
  };

  const wmsConnected = settings?.wmsConnected ?? false;

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Fulfillmen Account Settings</h1>

      {loadError && (
        <ConnectionBanner type="error" title="Error" body={loadError} />
      )}

      {connectionError && (
        <ConnectionBanner
          type="error"
          title="Unable to connect"
          body={connectionError}
        />
      )}

      {connectionSuccess && (
        <ConnectionBanner
          type="success"
          title="Connected"
          body="Your Fulfillmen account has been connected successfully."
        />
      )}

      {actionData?.intent === "saveAutoSoftSubmit" && actionData?.success && (
        <ConnectionBanner
          type="success"
          title="Saved"
          body="Your automatic order intake setting has been updated."
        />
      )}

      {actionData?.intent === "saveAutoSoftSubmit" && actionData?.error && (
        <ConnectionBanner
          type="error"
          title="Error"
          body={actionData.error}
        />
      )}

      {/* API Key Connection Section */}
      <div className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          WMS Connection
        </h2>

        {wmsConnected ? (
          <div className="flex items-center text-green-700">
            <svg
              className="w-5 h-5 mr-2"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <span className="font-medium">Connected to Fulfillmen WMS</span>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label
                htmlFor="apiKey"
                className="block text-sm font-medium text-gray-700"
              >
                API Key
              </label>
              <input
                type="text"
                id="apiKey"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="Enter your Fulfillmen API key"
              />
            </div>

            <button
              onClick={handleConnect}
              className="w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Connect Account
            </button>
          </div>
        )}
      </div>

      {/* Auto Order Intake Section - Only shown when WMS is connected */}
      {wmsConnected && (
        <AutoOrderIntakeSection
          enabled={autoSoftSubmit}
          onToggle={handleAutoSoftSubmitToggle}
          saving={saving}
        />
      )}

      {/* Help Section */}
      <div className="mt-8 p-4 bg-gray-50 rounded-md">
        <h2 className="text-sm font-medium text-gray-900">Need help?</h2>
        <p className="mt-1 text-sm text-gray-600">
          If you need assistance with your API key or settings, please contact{" "}
          <a
            href="mailto:service@fulfillmen.com"
            className="text-indigo-600 hover:text-indigo-500"
          >
            service@fulfillmen.com
          </a>
        </p>
      </div>
    </div>
  );
}
