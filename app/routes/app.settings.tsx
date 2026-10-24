/**
 * Fulfillmen Account Settings Page
 * Handles WMS API key binding and connection status.
 */

import { useState } from "react";
import { BindingMessages } from "../lib/binding-messages";

interface ConnectionBannerProps {
  type: "error" | "success" | "warning";
  title: string;
  body: string;
}

function ConnectionBanner({ type, title, body }: ConnectionBannerProps) {
  const bgColor =
    type === "error"
      ? "bg-red-50 border-red-200"
      : type === "success"
        ? "bg-green-50 border-green-200"
        : "bg-yellow-50 border-yellow-200";

  return (
    <div className={`p-4 border rounded-md ${bgColor}`}>
      <h3 className="font-medium text-gray-900">{title}</h3>
      <p className="mt-1 text-sm text-gray-600">{body}</p>
    </div>
  );
}

interface SettingsPageProps {
  initialError?: string;
}

export default function SettingsPage({ initialError }: SettingsPageProps) {
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [success, setSuccess] = useState(false);

  const handleConnect = async () => {
    setError(null);
    setSuccess(false);

    if (!apiKey.trim()) {
      setError(BindingMessages.INVALID_KEY);
      return;
    }

    try {
      // Placeholder for actual API connection logic
      // The actual validation would be performed server-side
      setSuccess(true);
    } catch {
      setError(BindingMessages.CONNECTION_ERROR);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Fulfillmen Account Settings</h1>

      {error && (
        <ConnectionBanner
          type="error"
          title="Unable to connect"
          body={error}
        />
      )}

      {success && (
        <ConnectionBanner
          type="success"
          title="Connected"
          body={BindingMessages.CONNECTION_SUCCESS}
        />
      )}

      <div className="mt-6 space-y-4">
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

      <div className="mt-8 p-4 bg-gray-50 rounded-md">
        <h2 className="text-sm font-medium text-gray-900">Need help?</h2>
        <p className="mt-1 text-sm text-gray-600">
          If you need assistance with your API key, please contact{" "}
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
