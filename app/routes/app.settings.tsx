import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getBindingService } from "../lib/wms-binding-runtime.server";
import { getSupportEmail } from "../lib/support.server";
import { getFulfillmentSetup, setupNeedsRetry } from "../fulfillment/index.server";
import { getAutoSoftSubmit, setAutoSoftSubmit } from "../lib/shop-settings.server";

type Verified = {
  ok: true;
  customerNameMasked: string | null;
  cusCodeMasked: string | null;
  alreadyBound: boolean;
  legacyShopifyAccounts: number;
};

// Fulfillmen account connection (contract v1 §2.2): customer code + API key,
// verify first, then confirm to bind. The key is posted over the session-token
// authenticated request, encrypted at rest, and never sent back to the browser.

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const svc = getBindingService();
  const binding = await svc.state(session.shop);
  let setup = binding.connected ? await getFulfillmentSetup(session.shop) : null;
  // Bound but the Fulfillmen location was never set up (or failed): retry once per page load (idempotent).
  if (binding.connected && setup && setupNeedsRetry(setup)) {
    await svc.setup(session.shop);
    setup = await getFulfillmentSetup(session.shop);
  }
  // Load autoSoftSubmit setting (only relevant when connected)
  const autoSoftSubmit = binding.connected ? await getAutoSoftSubmit(session.shop) : false;
  return { shop: session.shop, binding, setup, supportEmail: getSupportEmail(), autoSoftSubmit };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const cusCode = String(form.get("cusCode") ?? "").trim();
  const apiKey = String(form.get("apiKey") ?? "").trim();
  const svc = getBindingService();

  if (intent === "verify") return { intent, result: await svc.verify(session.shop, cusCode, apiKey) };
  if (intent === "bind") {
    const res = await admin.graphql(`#graphql
      query FulfillmenBindShop { shop { id name } }`);
    const shop = (await res.json()).data?.shop as { id: string; name: string } | undefined;
    return { intent, result: await svc.bind(session.shop, cusCode, apiKey, shop?.id ?? "", shop?.name ?? session.shop) };
  }
  if (intent === "retrySetup") {
    const r = await svc.setup(session.shop);
    return {
      intent,
      result: r.setup === "error"
        ? { ok: false as const, errorCode: r.code ?? "FS_SETUP_FAILED", message: `The Fulfillmen location could not be set up yet (${r.code ?? "FS_SETUP_FAILED"}). Please try again in a few minutes or contact ${getSupportEmail()}.` }
        : { ok: true as const },
    };
  }
  if (intent === "disconnect") return { intent, result: await svc.disconnect(session.shop) };
  if (intent === "saveAutoSoftSubmit") {
    const enabled = form.get("autoSoftSubmit") === "true";
    const success = await setAutoSoftSubmit(session.shop, enabled);
    return {
      intent,
      result: success
        ? { ok: true as const }
        : { ok: false as const, errorCode: "SAVE_FAILED", message: "Could not save the setting. Please try again." },
    };
  }
  return { intent, result: { ok: false as const, errorCode: "BAD_INTENT", message: "Unknown action." } };
};

const inputStyle = { width: "100%", maxWidth: 420, padding: "6px 8px", marginTop: 4 };

export default function SettingsPage() {
  const { shop, binding, setup, supportEmail, autoSoftSubmit } = useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  const busy = useNavigation().state !== "idle";
  const r = data?.result;
  const verified = data?.intent === "verify" && r?.ok ? (r as Verified) : null;
  const error = r && !r.ok ? r : null;
  const justBound = data?.intent === "bind" && r?.ok;
  const autoSoftSubmitSaved = data?.intent === "saveAutoSoftSubmit" && r?.ok;

  return (
    <s-page heading="Fulfillmen account">
      {error ? (
        <s-banner tone="critical" heading="Could not complete the request">
          <s-paragraph>{error.message}</s-paragraph>
        </s-banner>
      ) : null}
      {justBound ? (
        <s-banner tone="success" heading="Connected">
          <s-paragraph>
            {shop} is now connected to Fulfillmen. Orders assigned to the Fulfillmen
            location will be sent to the warehouse automatically.
          </s-paragraph>
        </s-banner>
      ) : null}
      {autoSoftSubmitSaved ? (
        <s-banner tone="success" heading="Saved">
          <s-paragraph>Your automatic order intake setting has been updated.</s-paragraph>
        </s-banner>
      ) : null}

      {binding.connected ? (
        <s-section heading="Connected">
          <s-paragraph>
            Customer code: {binding.cusCode} · API key: {binding.keyId}
            {binding.boundAt ? ` · since ${binding.boundAt.slice(0, 10)}` : ""}
          </s-paragraph>
          <s-paragraph>
            Disconnecting removes the Fulfillmen location from your store (its
            inventory records are kept as a regular location) and stops new orders
            from being sent to Fulfillmen. Open fulfillment orders assigned to
            Fulfillmen must be completed or cancelled first. If your store still has
            the older Fulfillmen integration enabled, that integration will resume
            importing orders.
          </s-paragraph>
          {setup && setup.status !== "READY" ? (
            <s-banner tone="warning" heading="Fulfillmen location not set up yet">
              <s-paragraph>
                Your account is connected, but the Fulfillmen location could not be added to your store
                {setup.lastErrorCode ? ` (${setup.lastErrorCode})` : ""}. Orders are not sent to Fulfillmen until it is set up.
              </s-paragraph>
              <Form method="post">
                <button type="submit" name="intent" value="retrySetup" disabled={busy}>
                  Retry setup
                </button>
              </Form>
            </s-banner>
          ) : null}
          <Form method="post">
            <button type="submit" name="intent" value="disconnect" disabled={busy}>
              Disconnect
            </button>
          </Form>
        </s-section>
      ) : (
        <s-section heading="Connect your Fulfillmen account">
          <s-paragraph>
            Enter your Fulfillmen customer code and an API key created in the
            Fulfillmen portal. We check the details first; nothing changes until
            you confirm.
          </s-paragraph>
          <Form method="post" autoComplete="off">
            <s-stack direction="block" gap="base">
              <label>
                Customer code
                <br />
                <input name="cusCode" required style={inputStyle} />
              </label>
              <label>
                API key
                <br />
                <input name="apiKey" type="password" required placeholder="fk_..." style={inputStyle} />
              </label>
              {verified ? (
                <s-box padding="base" background="subdued" borderRadius="base">
                  <s-paragraph>
                    Fulfillmen account: {verified.customerNameMasked ?? "-"} ({verified.cusCodeMasked ?? "-"})
                  </s-paragraph>
                  {verified.legacyShopifyAccounts > 0 ? (
                    <s-paragraph>
                      This account also has {verified.legacyShopifyAccounts} store(s) on the older
                      Fulfillmen Shopify integration. Once connected here, the older
                      integration stops importing orders for this store.
                    </s-paragraph>
                  ) : null}
                  <button type="submit" name="intent" value="bind" disabled={busy}>
                    Confirm and connect
                  </button>
                </s-box>
              ) : (
                <button type="submit" name="intent" value="verify" disabled={busy}>
                  Check details
                </button>
              )}
            </s-stack>
          </Form>
        </s-section>
      )}

      {/* Automatic order intake section - only visible when connected */}
      {binding.connected ? (
        <s-section heading="Automatic order intake">
          <s-paragraph>
            When enabled, paid orders are automatically sent to Fulfillmen for
            fulfillment without clicking Request Fulfillment. When disabled, you
            must manually request fulfillment for each order in Shopify.
          </s-paragraph>
          <Form method="post">
            <s-stack direction="block" gap="tight">
              <s-checkbox
                name="autoSoftSubmitCheckbox"
                checked={autoSoftSubmit}
                onChange={(e: CustomEvent<{ checked: boolean }>) => {
                  const form = (e.target as HTMLElement).closest("form");
                  if (form) {
                    const input = form.querySelector('input[name="autoSoftSubmit"]') as HTMLInputElement;
                    if (input) input.value = String(e.detail.checked);
                  }
                }}
              >
                Automatically send paid orders to Fulfillmen
              </s-checkbox>
              <input type="hidden" name="autoSoftSubmit" value={String(autoSoftSubmit)} />
              <button type="submit" name="intent" value="saveAutoSoftSubmit" disabled={busy}>
                Save
              </button>
            </s-stack>
          </Form>
          <s-paragraph>
            <small>
              Note: This setting only affects new orders. Previously placed orders
              that have not been requested will not be automatically sent.
            </small>
          </s-paragraph>
        </s-section>
      ) : null}

      <s-section slot="aside" heading="Help">
        <s-paragraph>
          Need a customer code or API key? Contact Fulfillmen support at{" "}
          <s-link href={`mailto:${supportEmail}`}>{supportEmail}</s-link>.
          Privacy policy: <s-link href="https://fulfillmen.com/shopify-app-privacy/" target="_blank">fulfillmen.com/shopify-app-privacy</s-link>
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
