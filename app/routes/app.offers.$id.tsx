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
  DEFAULT_RIBBON,
  PALETTES,
  PRICE_ENDINGS,
  defaultOfferConfig,
  describeTier,
  newTier,
  parseConfig,
  rangeTitle,
  sortTiers,
  validateOffer,
  type CountMode,
  type OfferConfig,
  type PriceEnding,
  type Scope,
  type Tier,
  type TierType,
  type WidgetSettings,
} from "../lib/offers";
import {
  ShopifyUserError,
  getDiscountEngine,
  getSettings,
  saveOffer,
} from "../lib/offers.server";
import { TierPreview, moneyFormatter } from "../components/TierPreview";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const settings = await getSettings(session.shop);
  const currency = await shopCurrency(admin);
  const builtin = (await getDiscountEngine(session.shop)) === "builtin";

  if (params.id === "new") {
    return {
      id: null,
      title: "",
      status: "ACTIVE" as const,
      // New offers start from the store's default style.
      config: { ...defaultOfferConfig(), style: settings },
      settings,
      currency,
      builtin,
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
    currency,
    builtin,
  };
};

async function shopCurrency(admin: {
  graphql: (q: string) => Promise<Response>;
}) {
  try {
    const res = await admin.graphql(`#graphql
      query VdpShopCurrency { shop { currencyCode } }`);
    const json = await res.json();
    return (json.data?.shop?.currencyCode as string) || "GBP";
  } catch {
    return "GBP";
  }
}

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

const TIER_TYPES: {
  value: TierType;
  label: string;
  icon: "discount" | "cash-pound" | "price-list" | "x-circle";
}[] = [
  { value: "percentage", label: "% off", icon: "discount" },
  { value: "amountOff", label: "Amount off", icon: "cash-pound" },
  { value: "fixedPrice", label: "Set price", icon: "price-list" },
  { value: "none", label: "No discount", icon: "x-circle" },
];

const STYLE_COLORS: { key: keyof WidgetSettings; label: string }[] = [
  { key: "backgroundColor", label: "Card" },
  { key: "selectedBackgroundColor", label: "Selected card" },
  { key: "accentColor", label: "Selected border and radio" },
  { key: "textColor", label: "Text" },
  { key: "tagColor", label: "Discount tag" },
  { key: "tagTextColor", label: "Discount tag text" },
  { key: "badgeColor", label: "Ribbon" },
  { key: "badgeTextColor", label: "Ribbon text" },
];

/** Next quantity not already used by a tier, starting at `from`. */
function freeQty(tiers: Tier[], from: number) {
  let q = Math.max(1, from);
  while (tiers.some((t) => t.minQty === q)) q++;
  return q;
}

export default function OfferEditor() {
  const loaded = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const navigate = useNavigate();
  const shopify = useAppBridge();

  const [title, setTitle] = useState(loaded.title);
  const [status, setStatus] = useState(loaded.status);
  const [config, setConfig] = useState<OfferConfig>(loaded.config);
  const [openTier, setOpenTier] = useState<number | null>(loaded.id ? null : 0);
  const [samplePrice, setSamplePrice] = useState(25);
  const settings: WidgetSettings = loaded.settings;
  const style = config.style ?? settings;
  const money = moneyFormatter(loaded.currency, false, settings.currencyFormat);

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

  const setStyle = (patch: Partial<WidgetSettings>) =>
    setConfig((c) => ({ ...c, style: { ...(c.style ?? settings), ...patch } }));

  const updateTier = (i: number, patch: Partial<Tier>) =>
    setConfig((c) => ({
      ...c,
      tiers: c.tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)),
    }));

  const addTier = () => {
    setConfig((c) => {
      const last = sortTiers(c.tiers).at(-1);
      const qty = freeQty(c.tiers, (last?.minQty ?? 1) + 1);
      const value =
        last?.type === "percentage" ? Math.min(last.value + 5, 100) : 10;
      return { ...c, tiers: [...c.tiers, newTier(qty, value)] };
    });
    setOpenTier(config.tiers.length);
  };

  const duplicateTier = (i: number) => {
    setConfig((c) => {
      const t = c.tiers[i];
      const copy = { ...t, minQty: freeQty(c.tiers, t.minQty + 1), badge: "" };
      return { ...c, tiers: [...c.tiers, copy] };
    });
    setOpenTier(config.tiers.length);
  };

  // One "most popular" tier at a time.
  const togglePopular = (i: number) =>
    setConfig((c) => {
      const on = !c.tiers[i].badge;
      return {
        ...c,
        tiers: c.tiers.map((t, j) =>
          j === i
            ? { ...t, badge: on ? DEFAULT_RIBBON : "" }
            : on && t.badge === DEFAULT_RIBBON
              ? { ...t, badge: "" }
              : t,
        ),
      };
    });

  const removeTier = (i: number) => {
    setConfig((c) => ({
      ...c,
      tiers: c.tiers.filter((_, j) => j !== i),
      preselectTier:
        c.preselectTier === i
          ? -1
          : c.preselectTier > i
            ? c.preselectTier - 1
            : c.preselectTier,
    }));
    setOpenTier(null);
  };

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

  // Tiers are edited in the order entered but labelled by their sorted range.
  const sorted = sortTiers(config.tiers);
  const autoTitle = (t: Tier) => {
    const bands =
      config.showSingleTier && sorted[0]?.minQty > 1
        ? [{ minQty: 1 } as Tier, ...sorted]
        : sorted;
    return rangeTitle(bands, bands.indexOf(t), config.unitName);
  };
  const order = config.tiers
    .map((t, i) => ({ t, i }))
    .sort((a, b) => a.t.minQty - b.t.minQty || a.i - b.i);

  return (
    <s-page
      heading={loaded.id ? title || "Edit offer" : "Create offer"}
      inlineSize="base"
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

      {loaded.builtin && (
        <s-banner
          tone="info"
          heading="This store uses Shopify's built-in discounts"
        >
          <s-paragraph>
            Shopify only runs app discounts from a private app on Shopify Plus,
            so each tier is saved as a normal automatic discount. Price rounding
            and “Set price” tiers aren’t available, and quantities count across
            all of this offer’s products together.
          </s-paragraph>
        </s-banner>
      )}

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
          <s-grid gridTemplateColumns="2fr 1fr" gap="base">
            <s-text-field
              label="Offer name"
              details="Only you see this. It's also the discount's name in Shopify admin."
              placeholder="e.g. 11oz white mugs bulk pricing"
              value={title}
              onInput={(e) => setTitle(e.currentTarget.value)}
            />
            <s-select
              label="Status"
              value={status}
              onChange={(e) =>
                setStatus(e.currentTarget.value as "ACTIVE" | "DRAFT")
              }
            >
              <s-option value="ACTIVE">Active</s-option>
              <s-option value="DRAFT">Paused</s-option>
            </s-select>
          </s-grid>
          <s-text-field
            label="Heading above the tiers"
            placeholder="e.g. Bundle and save"
            value={config.heading}
            onInput={(e) => update({ heading: e.currentTarget.value })}
          />
          <s-switch
            label="Show lines either side of the heading"
            checked={config.headingLines}
            onChange={(e) => update({ headingLines: e.currentTarget.checked })}
          />
        </s-stack>
      </s-section>

      <s-section heading="Products">
        <s-stack gap="base">
          <s-choice-list
            label="Apply this offer to"
            values={[config.scope]}
            onChange={(e) =>
              update({ scope: e.currentTarget.values[0] as Scope })
            }
          >
            <s-choice value="all">All products</s-choice>
            <s-choice value="products">Specific products</s-choice>
            <s-choice value="collections">
              Products in specific collections
            </s-choice>
          </s-choice-list>

          {config.scope === "products" && (
            <s-stack gap="small">
              <s-button icon="plus-circle" onClick={pickProducts}>
                {config.products.length ? "Change products" : "Select products"}
              </s-button>
              {config.products.map((p) => (
                <s-stack
                  key={p.id}
                  direction="inline"
                  gap="small"
                  alignItems="center"
                >
                  {p.image && (
                    <s-thumbnail src={p.image} alt={p.title} size="small" />
                  )}
                  <s-text>{p.title}</s-text>
                </s-stack>
              ))}
            </s-stack>
          )}

          {config.scope === "collections" && (
            <s-stack gap="small">
              <s-button icon="plus-circle" onClick={pickCollections}>
                {config.collections.length
                  ? "Change collections"
                  : "Select collections"}
              </s-button>
              {config.collections.map((c) => (
                <s-text key={c.id}>{c.title}</s-text>
              ))}
            </s-stack>
          )}

          {!loaded.builtin && (
            <s-select
              label="Count quantity"
              value={config.countMode}
              onChange={(e) =>
                update({ countMode: e.currentTarget.value as CountMode })
              }
              details={
                config.countMode === "product"
                  ? "Different sizes or colours of the same product add up."
                  : config.countMode === "variant"
                    ? "Each size or colour needs to reach the tier on its own."
                    : "Any of the selected products add up together (mix and match)."
              }
            >
              <s-option value="product">Per product</s-option>
              <s-option value="variant">Per variant</s-option>
              <s-option value="combined">Across all selected products</s-option>
            </s-select>
          )}
        </s-stack>
      </s-section>

      <s-section heading="Tiers">
        <s-stack gap="base">
          <s-grid gridTemplateColumns="1fr 1fr" gap="base">
            <s-text-field
              label="Item name"
              details="Used in automatic tier titles, e.g. “18 - 35 mugs”."
              placeholder="items"
              value={config.unitName}
              onInput={(e) => update({ unitName: e.currentTarget.value })}
            />
            <s-select
              label="Selected when the page loads"
              value={String(config.preselectTier)}
              onChange={(e) =>
                update({ preselectTier: Number(e.currentTarget.value) })
              }
            >
              <s-option value="-1">First card</s-option>
              {order.map(({ t, i }) => (
                <s-option key={i} value={String(i)}>
                  {t.title || autoTitle(t)}
                </s-option>
              ))}
            </s-select>
          </s-grid>

          {order.map(({ t: tier, i }, pos) => {
            const open = openTier === i;
            return (
              <s-box
                key={i}
                border="base"
                borderRadius="base"
                background={open ? "base" : "subdued"}
              >
                <s-box padding="small-100 base">
                  <s-grid
                    gridTemplateColumns="1fr auto"
                    alignItems="center"
                    gap="small"
                  >
                    <s-clickable
                      onClick={() => setOpenTier(open ? null : i)}
                      accessibilityLabel={
                        open ? "Collapse tier" : "Expand tier"
                      }
                    >
                      <s-stack
                        direction="inline"
                        gap="small"
                        alignItems="center"
                      >
                        <s-text type="strong">Tier {pos + 1}</s-text>
                        <s-text>{tier.title || autoTitle(tier)}</s-text>
                        <s-badge
                          tone={tier.type === "none" ? "neutral" : "success"}
                        >
                          {describeTier(tier, money)}
                        </s-badge>
                        {tier.badge && (
                          <s-badge tone="warning">{tier.badge}</s-badge>
                        )}
                      </s-stack>
                    </s-clickable>
                    <s-stack
                      direction="inline"
                      gap="small-300"
                      alignItems="center"
                    >
                      <s-button
                        variant="tertiary"
                        icon={tier.badge ? "star-filled" : "star"}
                        accessibilityLabel={
                          tier.badge ? "Remove ribbon" : "Mark as most popular"
                        }
                        onClick={() => togglePopular(i)}
                      />
                      <s-button
                        variant="tertiary"
                        icon="duplicate"
                        accessibilityLabel={`Duplicate tier ${pos + 1}`}
                        onClick={() => duplicateTier(i)}
                      />
                      <s-button
                        variant="tertiary"
                        tone="critical"
                        icon="delete"
                        accessibilityLabel={`Remove tier ${pos + 1}`}
                        onClick={() => removeTier(i)}
                      />
                      <s-button
                        variant="tertiary"
                        icon={open ? "chevron-up" : "chevron-down"}
                        accessibilityLabel={
                          open ? "Collapse tier" : "Expand tier"
                        }
                        onClick={() => setOpenTier(open ? null : i)}
                      />
                    </s-stack>
                  </s-grid>
                </s-box>
                {open && (
                  <s-box
                    padding="base"
                    borderWidth="small none none none"
                    borderColor="base"
                  >
                    <s-stack gap="base">
                      <s-stack gap="small-200">
                        <s-text type="strong">Discount type</s-text>
                        <s-stack direction="inline" gap="small-200">
                          {TIER_TYPES.filter(
                            (t) => !loaded.builtin || t.value !== "fixedPrice",
                          ).map((t) => (
                            <s-button
                              key={t.value}
                              icon={t.icon}
                              variant={
                                tier.type === t.value ? "primary" : "secondary"
                              }
                              onClick={() => updateTier(i, { type: t.value })}
                            >
                              {t.label}
                            </s-button>
                          ))}
                        </s-stack>
                      </s-stack>
                      <s-grid gridTemplateColumns="1fr 1fr" gap="base">
                        {tier.type !== "none" ? (
                          <s-number-field
                            label={
                              tier.type === "percentage"
                                ? "Discount"
                                : tier.type === "amountOff"
                                  ? "Amount off each item"
                                  : "Price for each item"
                            }
                            min={0}
                            step={tier.type === "percentage" ? 1 : 0.01}
                            suffix={
                              tier.type === "percentage" ? "%" : loaded.currency
                            }
                            value={String(tier.value)}
                            onInput={(e) =>
                              updateTier(i, {
                                value: Number(e.currentTarget.value) || 0,
                              })
                            }
                          />
                        ) : (
                          <s-paragraph>
                            <s-text tone="neutral">
                              Full price. Use this for a starting band such as 1
                              - 17 items.
                            </s-text>
                          </s-paragraph>
                        )}
                        <s-number-field
                          label="From quantity"
                          min={1}
                          step={1}
                          value={String(tier.minQty)}
                          details={`Covers ${autoTitle(tier)}.`}
                          onInput={(e) =>
                            updateTier(i, {
                              minQty: Math.max(
                                1,
                                Math.floor(Number(e.currentTarget.value) || 1),
                              ),
                            })
                          }
                        />
                      </s-grid>
                      {tier.type !== "none" && !loaded.builtin && (
                        <s-stack
                          direction="inline"
                          gap="base"
                          alignItems="center"
                        >
                          <s-switch
                            label="Round the price down"
                            checked={!!tier.rounding}
                            onChange={(e) =>
                              updateTier(i, {
                                rounding: e.currentTarget.checked ? ".99" : "",
                              })
                            }
                          />
                          {tier.rounding && (
                            <s-select
                              label="Price ending"
                              labelAccessibilityVisibility="exclusive"
                              value={tier.rounding}
                              onChange={(e) =>
                                updateTier(i, {
                                  rounding: e.currentTarget
                                    .value as PriceEnding,
                                })
                              }
                            >
                              {PRICE_ENDINGS.map((p) => (
                                <s-option key={p} value={p}>
                                  {p}
                                </s-option>
                              ))}
                            </s-select>
                          )}
                        </s-stack>
                      )}
                      <s-grid gridTemplateColumns="1fr 1fr" gap="base">
                        <s-text-field
                          label="Title"
                          placeholder={autoTitle(tier)}
                          details="Leave blank for the automatic range."
                          value={tier.title}
                          onInput={(e) =>
                            updateTier(i, { title: e.currentTarget.value })
                          }
                        />
                        <s-text-field
                          label="Subtitle"
                          placeholder="e.g. Great deal, £0.95 inc VAT"
                          value={tier.subtitle}
                          onInput={(e) =>
                            updateTier(i, { subtitle: e.currentTarget.value })
                          }
                        />
                      </s-grid>
                      <s-grid gridTemplateColumns="1fr 1fr" gap="base">
                        <s-text-field
                          label="Ribbon"
                          placeholder="e.g. Most popular"
                          value={tier.badge}
                          onInput={(e) =>
                            updateTier(i, { badge: e.currentTarget.value })
                          }
                        />
                        <s-text-field
                          label="Checkout message"
                          placeholder={config.message.replace(
                            /\{qty\}/g,
                            String(tier.minQty),
                          )}
                          value={tier.label}
                          onInput={(e) =>
                            updateTier(i, { label: e.currentTarget.value })
                          }
                        />
                      </s-grid>
                    </s-stack>
                  </s-box>
                )}
              </s-box>
            );
          })}
          <s-stack direction="inline" gap="base">
            <s-button icon="plus" onClick={addTier}>
              Add tier
            </s-button>
          </s-stack>
          <s-switch
            label="Add a full-price card for quantities below the first tier"
            checked={config.showSingleTier}
            onChange={(e) =>
              update({ showSingleTier: e.currentTarget.checked })
            }
          />
          <s-text-field
            label="Default checkout message"
            details="Shown next to the discount in cart and checkout. Use {qty} for the tier's quantity."
            value={config.message}
            onInput={(e) => update({ message: e.currentTarget.value })}
          />
        </s-stack>
      </s-section>

      <s-section heading="Colour and style">
        <s-stack gap="base">
          <s-choice-list
            label="Layout"
            values={[style.layout]}
            onChange={(e) =>
              setStyle({
                layout: e.currentTarget.values[0] as WidgetSettings["layout"],
              })
            }
          >
            <s-choice value="stack">Stacked list</s-choice>
            <s-choice value="grid">Side by side</s-choice>
          </s-choice-list>
          <s-grid gridTemplateColumns="1fr 1fr" gap="base">
            <s-number-field
              label="Corner roundness"
              suffix="px"
              min={0}
              max={40}
              value={String(style.borderRadius)}
              onInput={(e) =>
                setStyle({
                  borderRadius: Math.max(0, Number(e.currentTarget.value) || 0),
                })
              }
            />
            <s-number-field
              label="Spacing"
              suffix="px"
              min={4}
              max={24}
              value={String(style.spacing)}
              onInput={(e) =>
                setStyle({
                  spacing: Math.min(
                    24,
                    Math.max(4, Number(e.currentTarget.value) || 12),
                  ),
                })
              }
            />
          </s-grid>
          <s-stack gap="small-200">
            <s-text type="strong">Colour schemes</s-text>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {PALETTES.map((p) => {
                const current = (
                  Object.keys(p.colors) as (keyof typeof p.colors)[]
                ).every(
                  (k) => style[k].toLowerCase() === p.colors[k].toLowerCase(),
                );
                return (
                  <button
                    key={p.name}
                    type="button"
                    title={p.name}
                    aria-label={`Use the ${p.name} colour scheme`}
                    aria-pressed={current}
                    onClick={() => setStyle(p.colors)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "4px 10px 4px 4px",
                      borderRadius: 999,
                      border: `2px solid ${current ? "#303030" : "#e3e3e3"}`,
                      background: "#fff",
                      cursor: "pointer",
                      font: "inherit",
                      fontSize: 12,
                    }}
                  >
                    <span
                      style={{
                        display: "flex",
                        borderRadius: 999,
                        overflow: "hidden",
                        border: "1px solid rgba(0,0,0,0.1)",
                      }}
                    >
                      {[
                        p.colors.selectedBackgroundColor,
                        p.colors.accentColor,
                        p.colors.badgeColor,
                      ].map((c, k) => (
                        <span
                          key={k}
                          style={{ width: 10, height: 20, background: c }}
                        />
                      ))}
                    </span>
                    {p.name}
                  </button>
                );
              })}
            </div>
          </s-stack>
          <s-grid gridTemplateColumns="1fr 1fr" gap="base">
            {STYLE_COLORS.map(({ key, label }) => (
              <s-color-field
                key={key}
                label={label}
                value={String(style[key])}
                onChange={(e) =>
                  setStyle({
                    [key]: e.currentTarget.value,
                  } as Partial<WidgetSettings>)
                }
              />
            ))}
          </s-grid>
          <s-button
            variant="tertiary"
            onClick={() => update({ style: settings })}
          >
            Reset to my default style
          </s-button>
        </s-stack>
      </s-section>

      <s-section heading="Prices and text">
        <s-stack gap="base">
          <s-select
            label="Price on each card"
            value={config.priceDisplay}
            onChange={(e) =>
              update({
                priceDisplay: e.currentTarget
                  .value as OfferConfig["priceDisplay"],
              })
            }
          >
            <s-option value="each">Price for one item</s-option>
            <s-option value="total">Total for the tier quantity</s-option>
          </s-select>
          {config.priceDisplay === "each" && (
            <s-text-field
              label="Text after the item price"
              placeholder="e.g. / each ex VAT"
              details="Unit prices are shown to the penny, so they can differ by up to 1p from the total divided by the quantity."
              value={config.eachPriceText}
              onInput={(e) => update({ eachPriceText: e.currentTarget.value })}
            />
          )}
          <s-switch
            label="Show the full price crossed out"
            checked={config.showCompareAt}
            onChange={(e) => update({ showCompareAt: e.currentTarget.checked })}
          />
          <s-switch
            label="Show a total under the tiers"
            checked={config.showTotal}
            onChange={(e) => update({ showTotal: e.currentTarget.checked })}
          />
          {config.showTotal && (
            <s-text-field
              label="Total label"
              value={config.totalText}
              onInput={(e) => update({ totalText: e.currentTarget.value })}
            />
          )}
          <s-switch
            label="Show the discount tag next to each title"
            checked={config.showDiscountTag}
            onChange={(e) =>
              update({ showDiscountTag: e.currentTarget.checked })
            }
          />
          {config.showDiscountTag && (
            <s-text-field
              label="Discount tag text"
              details="{discount} becomes the saving, e.g. 5% or £0.10."
              value={config.discountTagText}
              onInput={(e) =>
                update({ discountTagText: e.currentTarget.value })
              }
            />
          )}
          <s-switch
            label="Hide pence in prices (e.g. £12 instead of £12.00)"
            checked={config.hideDecimals}
            onChange={(e) => update({ hideDecimals: e.currentTarget.checked })}
          />
          <s-text-field
            label="Footer text"
            placeholder="Optional, e.g. Prices exclude VAT"
            value={config.footerText}
            onInput={(e) => update({ footerText: e.currentTarget.value })}
          />
        </s-stack>
      </s-section>

      <s-section heading="Combinations and schedule">
        <s-stack gap="base">
          <s-paragraph>This offer can combine with:</s-paragraph>
          <s-checkbox
            label="Other product discounts"
            checked={config.combinesWith.productDiscounts}
            onChange={(e) =>
              update({
                combinesWith: {
                  ...config.combinesWith,
                  productDiscounts: e.currentTarget.checked,
                },
              })
            }
          />
          <s-checkbox
            label="Order discounts"
            checked={config.combinesWith.orderDiscounts}
            onChange={(e) =>
              update({
                combinesWith: {
                  ...config.combinesWith,
                  orderDiscounts: e.currentTarget.checked,
                },
              })
            }
          />
          <s-checkbox
            label="Shipping discounts"
            checked={config.combinesWith.shippingDiscounts}
            onChange={(e) =>
              update({
                combinesWith: {
                  ...config.combinesWith,
                  shippingDiscounts: e.currentTarget.checked,
                },
              })
            }
          />
          <s-grid gridTemplateColumns="1fr 1fr" gap="base">
            <s-date-field
              label="Start date"
              details="Leave blank to start now."
              value={config.startsAt?.slice(0, 10) ?? ""}
              onChange={(e) =>
                update({
                  startsAt: e.currentTarget.value
                    ? new Date(e.currentTarget.value).toISOString()
                    : null,
                })
              }
            />
            <s-date-field
              label="End date"
              details="Leave blank to run until you pause it."
              value={config.endsAt?.slice(0, 10) ?? ""}
              onChange={(e) =>
                update({
                  endsAt: e.currentTarget.value
                    ? new Date(e.currentTarget.value).toISOString()
                    : null,
                })
              }
            />
          </s-grid>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Preview">
        <s-stack gap="base">
          <TierPreview
            config={config}
            style={style}
            unitPrice={samplePrice}
            currency={loaded.currency}
            currencyFormat={settings.currencyFormat}
          />
          <s-number-field
            label="Sample price for one item"
            min={0}
            step={0.01}
            suffix={loaded.currency}
            value={String(samplePrice)}
            onInput={(e) =>
              setSamplePrice(Math.max(0, Number(e.currentTarget.value) || 0))
            }
          />
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
