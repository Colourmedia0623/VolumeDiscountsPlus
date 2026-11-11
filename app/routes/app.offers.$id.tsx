import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { redirect, useFetcher, useLoaderData, useNavigate } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  defaultOfferConfig,
  newTier,
  parseConfig,
  sortTiers,
  validateOffer,
  type CountMode,
  type OfferConfig,
  type Scope,
  type Tier,
  type TierType,
  type WidgetSettings,
} from "../lib/offers";
import {
  ShopifyUserError,
  getSettings,
  saveOffer,
} from "../lib/offers.server";
import { TierPreview } from "../components/TierPreview";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const settings = await getSettings(session.shop);

  if (params.id === "new") {
    return {
      id: null,
      title: "",
      status: "ACTIVE" as const,
      config: defaultOfferConfig(),
      settings,
    };
  }

  const offer = await prisma.offer.findFirst({
    where: { id: Number(params.id), shop: session.shop },
  });
  if (!offer) throw redirect("/app");
  return {
    id: offer.id,
    title: offer.title,
    status: offer.status as "ACTIVE" | "DRAFT",
    config: parseConfig(offer.config),
    settings,
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const form = await request.formData();
  const title = String(form.get("title") ?? "").trim();
  const status = form.get("status") === "DRAFT" ? "DRAFT" : "ACTIVE";
  const config = parseConfig(String(form.get("config") ?? ""));

  const errors = validateOffer(title, config);
  if (errors.length) return { errors };

  try {
    const offer = await saveOffer(admin, session.shop, {
      id: params.id === "new" ? undefined : Number(params.id),
      title,
      status,
      config,
    });
    if (params.id === "new") return redirect(`/app/offers/${offer.id}?saved=1`);
    return { errors: [] as string[], saved: true };
  } catch (e) {
    if (e instanceof ShopifyUserError) return { errors: e.messages };
    throw e;
  }
};

const TIER_TYPES: { value: TierType; label: string }[] = [
  { value: "percentage", label: "Percentage off" },
  { value: "amountOff", label: "Amount off each item" },
  { value: "fixedPrice", label: "Fixed price per item" },
];

export default function OfferEditor() {
  const loaded = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const navigate = useNavigate();
  const shopify = useAppBridge();

  const [title, setTitle] = useState(loaded.title);
  const [status, setStatus] = useState(loaded.status);
  const [config, setConfig] = useState<OfferConfig>(loaded.config);
  const settings: WidgetSettings = loaded.settings;

  const saving = fetcher.state !== "idle";
  const errors = fetcher.data?.errors ?? [];

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && "saved" in fetcher.data) {
      shopify.toast.show("Offer saved");
    }
  }, [fetcher.state, fetcher.data, shopify]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("saved")) {
      shopify.toast.show("Offer created");
    }
  }, [shopify]);

  const update = (patch: Partial<OfferConfig>) =>
    setConfig((c) => ({ ...c, ...patch }));

  const updateTier = (i: number, patch: Partial<Tier>) =>
    setConfig((c) => ({
      ...c,
      tiers: c.tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)),
    }));

  const addTier = () =>
    setConfig((c) => {
      const last = sortTiers(c.tiers).at(-1);
      const qty = (last?.minQty ?? 1) + 1;
      const value =
        last?.type === "percentage" ? Math.min(last.value + 5, 100) : 10;
      return { ...c, tiers: [...c.tiers, newTier(qty, value)] };
    });

  const removeTier = (i: number) =>
    setConfig((c) => ({
      ...c,
      tiers: c.tiers.filter((_, j) => j !== i),
      preselectTier:
        c.preselectTier === i ? -1 : c.preselectTier > i ? c.preselectTier - 1 : c.preselectTier,
    }));

  const pickProducts = async () => {
    const selected = await shopify.resourcePicker({
      type: "product",
      multiple: true,
      selectionIds: config.products.map((p) => ({ id: p.id })),
      filter: { variants: false },
    });
    if (!selected) return;
    update({
      products: selected.map((p) => ({
        id: p.id,
        title: p.title,
        image: "images" in p ? p.images?.[0]?.originalSrc : undefined,
      })),
    });
  };

  const pickCollections = async () => {
    const selected = await shopify.resourcePicker({
      type: "collection",
      multiple: true,
      selectionIds: config.collections.map((c) => ({ id: c.id })),
    });
    if (!selected) return;
    update({
      collections: selected.map((c) => ({ id: c.id, title: c.title })),
    });
  };

  const save = () => {
    fetcher.submit(
      { title, status, config: JSON.stringify(config) },
      { method: "POST" },
    );
  };

  return (
    <s-page
      heading={loaded.id ? title || "Edit offer" : "Create offer"}
      inlineSize="large"
    >
      <s-link slot="breadcrumb-actions" href="/app">
        Offers
      </s-link>
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={save}
        loading={saving || undefined}
      >
        Save
      </s-button>
      <s-button slot="secondary-actions" onClick={() => navigate("/app")}>
        Cancel
      </s-button>

      {errors.length > 0 && (
        <s-banner tone="critical" heading="Fix these before saving">
          <s-unordered-list>
            {errors.map((e) => (
              <s-list-item key={e}>{e}</s-list-item>
            ))}
          </s-unordered-list>
        </s-banner>
      )}

      <s-section heading="Offer">
        <s-stack gap="base">
          <s-text-field
            label="Offer name"
            details="Only you see this, and it's the discount's name in Shopify admin."
            placeholder="e.g. Bulk savings on socks"
            value={title}
            onInput={(e) => setTitle(e.currentTarget.value)}
          />
          <s-select
            label="Status"
            value={status}
            onChange={(e) => setStatus(e.currentTarget.value as "ACTIVE" | "DRAFT")}
          >
            <s-option value="ACTIVE">Active</s-option>
            <s-option value="DRAFT">Paused</s-option>
          </s-select>
        </s-stack>
      </s-section>

      <s-section heading="Discount tiers">
        <s-stack gap="base">
          {config.tiers.map((tier, i) => (
            <s-box
              key={i}
              padding="base"
              border="base"
              borderRadius="base"
              background="subdued"
            >
              <s-stack gap="base">
                <s-stack direction="inline" justifyContent="space-between" alignItems="center">
                  <s-heading>Tier {i + 1}</s-heading>
                  <s-button
                    variant="tertiary"
                    tone="critical"
                    icon="delete"
                    accessibilityLabel={`Remove tier ${i + 1}`}
                    onClick={() => removeTier(i)}
                  />
                </s-stack>
                <s-grid gridTemplateColumns="1fr 1.4fr 1fr" gap="base">
                  <s-number-field
                    label="Minimum quantity"
                    min={1}
                    step={1}
                    value={String(tier.minQty)}
                    onInput={(e) => {
                      const minQty = Math.max(1, Math.floor(Number(e.currentTarget.value) || 1));
                      const autoTitle = tier.title === `Buy ${tier.minQty}`;
                      updateTier(i, { minQty, ...(autoTitle ? { title: `Buy ${minQty}` } : {}) });
                    }}
                  />
                  <s-select
                    label="Discount type"
                    value={tier.type}
                    onChange={(e) =>
                      updateTier(i, { type: e.currentTarget.value as TierType })
                    }
                  >
                    {TIER_TYPES.map((t) => (
                      <s-option key={t.value} value={t.value}>
                        {t.label}
                      </s-option>
                    ))}
                  </s-select>
                  <s-number-field
                    label={tier.type === "percentage" ? "Percent off" : tier.type === "amountOff" ? "Amount off" : "Price each"}
                    min={0}
                    step={tier.type === "percentage" ? 1 : 0.01}
                    suffix={tier.type === "percentage" ? "%" : undefined}
                    value={String(tier.value)}
                    onInput={(e) =>
                      updateTier(i, { value: Number(e.currentTarget.value) || 0 })
                    }
                  />
                </s-grid>
                <s-grid gridTemplateColumns="1fr 1fr 1fr" gap="base">
                  <s-text-field
                    label="Card title"
                    value={tier.title}
                    onInput={(e) => updateTier(i, { title: e.currentTarget.value })}
                  />
                  <s-text-field
                    label="Card subtitle"
                    placeholder="Optional"
                    value={tier.subtitle}
                    onInput={(e) => updateTier(i, { subtitle: e.currentTarget.value })}
                  />
                  <s-text-field
                    label="Badge"
                    placeholder="e.g. Most popular"
                    value={tier.badge}
                    onInput={(e) => updateTier(i, { badge: e.currentTarget.value })}
                  />
                </s-grid>
                <s-text-field
                  label="Checkout message"
                  placeholder={config.message.replace(/\{qty\}/g, String(tier.minQty))}
                  details="Shown next to the discount in cart and checkout. Leave blank to use the default below."
                  value={tier.label}
                  onInput={(e) => updateTier(i, { label: e.currentTarget.value })}
                />
              </s-stack>
            </s-box>
          ))}
          <s-button icon="plus" onClick={addTier}>
            Add tier
          </s-button>
          <s-text-field
            label="Default checkout message"
            details="Use {qty} for the tier's quantity."
            value={config.message}
            onInput={(e) => update({ message: e.currentTarget.value })}
          />
        </s-stack>
      </s-section>

      <s-section heading="Products">
        <s-stack gap="base">
          <s-select
            label="Applies to"
            value={config.scope}
            onChange={(e) => update({ scope: e.currentTarget.value as Scope })}
          >
            <s-option value="all">All products</s-option>
            <s-option value="products">Specific products</s-option>
            <s-option value="collections">Specific collections</s-option>
          </s-select>

          {config.scope === "products" && (
            <s-stack gap="small">
              <s-button onClick={pickProducts}>
                {config.products.length ? "Change products" : "Select products"}
              </s-button>
              {config.products.map((p) => (
                <s-stack key={p.id} direction="inline" gap="small" alignItems="center">
                  {p.image && <s-thumbnail src={p.image} alt={p.title} size="small" />}
                  <s-text>{p.title}</s-text>
                </s-stack>
              ))}
            </s-stack>
          )}

          {config.scope === "collections" && (
            <s-stack gap="small">
              <s-button onClick={pickCollections}>
                {config.collections.length ? "Change collections" : "Select collections"}
              </s-button>
              {config.collections.map((c) => (
                <s-text key={c.id}>{c.title}</s-text>
              ))}
            </s-stack>
          )}

          <s-select
            label="Count quantity"
            value={config.countMode}
            onChange={(e) => update({ countMode: e.currentTarget.value as CountMode })}
            details={
              config.countMode === "product"
                ? "Different sizes or colours of the same product add up."
                : config.countMode === "variant"
                  ? "Each size or colour needs to reach the tier on its own."
                  : "Any eligible products add up together (mix and match)."
            }
          >
            <s-option value="product">Per product</s-option>
            <s-option value="variant">Per variant</s-option>
            <s-option value="combined">Across all eligible products</s-option>
          </s-select>
        </s-stack>
      </s-section>

      <s-section heading="Product page widget">
        <s-stack gap="base">
          <s-text-field
            label="Heading"
            value={config.heading}
            onInput={(e) => update({ heading: e.currentTarget.value })}
          />
          <s-checkbox
            label="Show a single-item option at full price"
            checked={config.showSingleTier}
            onChange={(e) => update({ showSingleTier: e.currentTarget.checked })}
          />
          <s-select
            label="Selected when the page loads"
            value={String(config.preselectTier)}
            onChange={(e) => update({ preselectTier: Number(e.currentTarget.value) })}
          >
            <s-option value="-1">Single item</s-option>
            {config.tiers.map((t, i) => (
              <s-option key={i} value={String(i)}>
                {t.title || `Tier ${i + 1}`}
              </s-option>
            ))}
          </s-select>
        </s-stack>
      </s-section>

      <s-section heading="Combinations and schedule">
        <s-stack gap="base">
          <s-paragraph>This offer can combine with:</s-paragraph>
          <s-checkbox
            label="Other product discounts"
            checked={config.combinesWith.productDiscounts}
            onChange={(e) =>
              update({ combinesWith: { ...config.combinesWith, productDiscounts: e.currentTarget.checked } })
            }
          />
          <s-checkbox
            label="Order discounts"
            checked={config.combinesWith.orderDiscounts}
            onChange={(e) =>
              update({ combinesWith: { ...config.combinesWith, orderDiscounts: e.currentTarget.checked } })
            }
          />
          <s-checkbox
            label="Shipping discounts"
            checked={config.combinesWith.shippingDiscounts}
            onChange={(e) =>
              update({ combinesWith: { ...config.combinesWith, shippingDiscounts: e.currentTarget.checked } })
            }
          />
          <s-grid gridTemplateColumns="1fr 1fr" gap="base">
            <s-date-field
              label="Start date"
              details="Leave blank to start now."
              value={config.startsAt?.slice(0, 10) ?? ""}
              onChange={(e) =>
                update({ startsAt: e.currentTarget.value ? new Date(e.currentTarget.value).toISOString() : null })
              }
            />
            <s-date-field
              label="End date"
              details="Leave blank to run until you pause it."
              value={config.endsAt?.slice(0, 10) ?? ""}
              onChange={(e) =>
                update({ endsAt: e.currentTarget.value ? new Date(e.currentTarget.value).toISOString() : null })
              }
            />
          </s-grid>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Preview">
        <s-paragraph>
          <s-text tone="neutral">Shown with a sample price of $25.00.</s-text>
        </s-paragraph>
        <TierPreview config={config} settings={settings} unitPrice={25} />
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
