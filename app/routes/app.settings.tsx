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
    <s-page heading="Default widget style">
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

      <s-section>
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
        <TierPreview config={defaultOfferConfig()} style={s} unitPrice={25} />
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
