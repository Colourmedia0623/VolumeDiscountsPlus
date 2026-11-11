import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import {
  DEFAULT_WIDGET_SETTINGS,
  defaultOfferConfig,
  parseSettings,
  type WidgetSettings,
} from "../lib/offers";
import { getSettings, saveSettings } from "../lib/offers.server";
import { TierPreview } from "../components/TierPreview";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return { settings: await getSettings(session.shop) };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const form = await request.formData();
  const settings = parseSettings(String(form.get("settings") ?? ""));
  await saveSettings(admin, session.shop, settings);
  return { ok: true };
};

const COLORS: { key: keyof WidgetSettings; label: string }[] = [
  { key: "accentColor", label: "Accent (selected border, savings)" },
  { key: "textColor", label: "Text" },
  { key: "backgroundColor", label: "Card background" },
  { key: "selectedBackgroundColor", label: "Selected card background" },
  { key: "badgeColor", label: "Badge background" },
  { key: "badgeTextColor", label: "Badge text" },
];

export default function Settings() {
  const loaded = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const [s, setS] = useState<WidgetSettings>(loaded.settings);
  const set = (patch: Partial<WidgetSettings>) => setS((x) => ({ ...x, ...patch }));

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) {
      shopify.toast.show("Style saved");
    }
  }, [fetcher.state, fetcher.data, shopify]);

  return (
    <s-page heading="Widget style">
      <s-button
        slot="primary-action"
        variant="primary"
        loading={fetcher.state !== "idle" || undefined}
        onClick={() =>
          fetcher.submit({ settings: JSON.stringify(s) }, { method: "POST" })
        }
      >
        Save
      </s-button>
      <s-button slot="secondary-actions" onClick={() => setS({ ...DEFAULT_WIDGET_SETTINGS })}>
        Reset to defaults
      </s-button>

      <s-section heading="Colours">
        <s-grid gridTemplateColumns="1fr 1fr" gap="base">
          {COLORS.map(({ key, label }) => (
            <s-color-field
              key={key}
              label={label}
              value={String(s[key])}
              onChange={(e) => set({ [key]: e.currentTarget.value } as Partial<WidgetSettings>)}
            />
          ))}
        </s-grid>
      </s-section>

      <s-section heading="Layout">
        <s-stack gap="base">
          <s-select
            label="Card layout"
            value={s.layout}
            onChange={(e) => set({ layout: e.currentTarget.value as WidgetSettings["layout"] })}
          >
            <s-option value="stack">Stacked rows</s-option>
            <s-option value="grid">Side-by-side boxes</s-option>
          </s-select>
          <s-number-field
            label="Corner radius"
            suffix="px"
            min={0}
            max={30}
            value={String(s.borderRadius)}
            onInput={(e) => set({ borderRadius: Number(e.currentTarget.value) || 0 })}
          />
          <s-checkbox
            label="Show price per item"
            checked={s.showPerItemPrice}
            onChange={(e) => set({ showPerItemPrice: e.currentTarget.checked })}
          />
          <s-checkbox
            label="Show “Save $X” tag"
            checked={s.showSavings}
            onChange={(e) => set({ showSavings: e.currentTarget.checked })}
          />
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Preview">
        <TierPreview config={defaultOfferConfig()} settings={s} unitPrice={25} />
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
