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
import prisma from "../db.server";
import {
  DEFAULT_WIDGET_SETTINGS,
  PALETTES,
  parseConfig,
  defaultOfferConfig,
  parseSettings,
  type WidgetSettings,
} from "../lib/offers";
import { getSettings, publishWidgetData, saveSettings } from "../lib/offers.server";
import {
  CURRENCY_FORMATS,
  DATE_FORMATS,
  formatDate,
  formatMoney,
  type CurrencyFormat,
  type DateFormat,
} from "../lib/formats";
import { TierPreview } from "../components/TierPreview";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  let currency = "GBP";
  try {
    const res = await admin.graphql(`#graphql
      query VdpSettingsCurrency { shop { currencyCode } }`);
    currency = (await res.json()).data?.shop?.currencyCode || "GBP";
  } catch {
    // Keep GBP for the examples.
  }
  return { settings: await getSettings(session.shop), currency };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const form = await request.formData();
  const settings = parseSettings(String(form.get("settings") ?? ""));
  await saveSettings(admin, session.shop, settings);
  if (form.get("applyAll") === "1") {
    // Clear each offer's own style so it falls back to this default.
    const offers = await prisma.offer.findMany({ where: { shop: session.shop } });
    for (const o of offers) {
      const config = parseConfig(o.config);
      if (!config.style) continue;
      await prisma.offer.update({
        where: { id: o.id },
        data: { config: JSON.stringify({ ...config, style: null }) },
      });
    }
    await publishWidgetData(admin, session.shop);
    return { ok: true, message: "Style saved and applied to all offers" };
  }
  return { ok: true, message: "Default style saved" };
};

const COLORS: { key: keyof WidgetSettings; label: string }[] = [
  { key: "backgroundColor", label: "Card" },
  { key: "selectedBackgroundColor", label: "Selected card" },
  { key: "accentColor", label: "Selected border and radio" },
  { key: "textColor", label: "Text" },
  { key: "tagColor", label: "Discount tag" },
  { key: "tagTextColor", label: "Discount tag text" },
  { key: "badgeColor", label: "Ribbon" },
  { key: "badgeTextColor", label: "Ribbon text" },
];

export default function Settings() {
  const loaded = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const [s, setS] = useState<WidgetSettings>(loaded.settings);
  const set = (patch: Partial<WidgetSettings>) => setS((x) => ({ ...x, ...patch }));

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) {
      shopify.toast.show(fetcher.data.message);
    }
  }, [fetcher.state, fetcher.data, shopify]);

  return (
    <s-page heading="Settings">
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
      <s-button
        slot="secondary-actions"
        onClick={() =>
          fetcher.submit({ settings: JSON.stringify(s), applyAll: "1" }, { method: "POST" })
        }
      >
        Save and apply to all offers
      </s-button>
      <s-button slot="secondary-actions" onClick={() => setS({ ...DEFAULT_WIDGET_SETTINGS })}>
        Reset to defaults
      </s-button>

      <s-section heading="Formats">
        <s-grid gridTemplateColumns="1fr 1fr" gap="base">
          <s-select
            label="Date format"
            details={`Used in the app, e.g. ${formatDate(new Date(), s.dateFormat)}.`}
            value={s.dateFormat}
            onChange={(e) => set({ dateFormat: e.currentTarget.value as DateFormat })}
          >
            {DATE_FORMATS.map((f) => (
              <s-option key={f.value} value={f.value}>
                {f.label}
              </s-option>
            ))}
          </s-select>
          <s-select
            label="Currency format"
            details="Used for prices in the tier widget and the app's previews."
            value={s.currencyFormat}
            onChange={(e) => set({ currencyFormat: e.currentTarget.value as CurrencyFormat })}
          >
            {CURRENCY_FORMATS.map((f) => (
              <s-option key={f.value} value={f.value}>
                {f.value === "store"
                  ? f.label
                  : formatMoney(1234.56, loaded.currency, f.value)}
              </s-option>
            ))}
          </s-select>
        </s-grid>
      </s-section>

      <s-section heading="Default widget style">
        <s-paragraph>
          New offers start with this style. Each offer can then have its own
          colours in the offer editor.
        </s-paragraph>
      </s-section>

      <s-section heading="Colours">
        <s-stack direction="inline" gap="small-200">
          {PALETTES.map((p) => (
            <s-button key={p.name} onClick={() => set(p.colors)}>
              {p.name}
            </s-button>
          ))}
        </s-stack>
        <s-box paddingBlockStart="base" />
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
          <s-number-field
            label="Spacing"
            suffix="px"
            min={4}
            max={24}
            value={String(s.spacing)}
            onInput={(e) => set({ spacing: Math.min(24, Math.max(4, Number(e.currentTarget.value) || 12)) })}
          />
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Preview">
        <TierPreview
          config={defaultOfferConfig()}
          style={s}
          unitPrice={25}
          currency={loaded.currency}
          currencyFormat={s.currencyFormat}
        />
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
