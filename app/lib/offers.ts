// Shared offer types, defaults and validation. Used by both the admin UI and
// the server-side sync code, so keep it free of server-only imports.

export type TierType = "percentage" | "amountOff" | "fixedPrice";
export type Scope = "all" | "products" | "collections";
export type CountMode = "product" | "variant" | "combined";

export interface Tier {
  /** Minimum quantity to unlock the tier. */
  minQty: number;
  type: TierType;
  /** Percent off, amount off each item, or the fixed unit price. */
  value: number;
  /** Card title on the product page, e.g. "Buy 2". */
  title: string;
  /** Short line under the title, e.g. "Perfect for gifting". */
  subtitle: string;
  /** Optional ribbon, e.g. "Most popular". Empty hides it. */
  badge: string;
  /** Message shown in cart/checkout. Empty uses the offer's default. */
  label: string;
}

export interface ResourceRef {
  id: string;
  title: string;
  image?: string;
}

export interface OfferConfig {
  scope: Scope;
  products: ResourceRef[];
  collections: ResourceRef[];
  countMode: CountMode;
  /** Cart/checkout message. `{qty}` is replaced by the tier's quantity. */
  message: string;
  tiers: Tier[];
  /** Heading above the tier cards on the product page. */
  heading: string;
  /** Show a "Buy 1, standard price" card before the discount tiers. */
  showSingleTier: boolean;
  /** Tier index (into `tiers`) selected when the page loads, -1 = single. */
  preselectTier: number;
  combinesWith: {
    orderDiscounts: boolean;
    productDiscounts: boolean;
    shippingDiscounts: boolean;
  };
  startsAt: string | null;
  endsAt: string | null;
}

export interface WidgetSettings {
  accentColor: string;
  textColor: string;
  backgroundColor: string;
  selectedBackgroundColor: string;
  badgeColor: string;
  badgeTextColor: string;
  borderRadius: number;
  layout: "stack" | "grid";
  showPerItemPrice: boolean;
  showSavings: boolean;
}

export const DEFAULT_WIDGET_SETTINGS: WidgetSettings = {
  accentColor: "#1f6f5c",
  textColor: "#1a1a1a",
  backgroundColor: "#ffffff",
  selectedBackgroundColor: "#eef7f4",
  badgeColor: "#f2b134",
  badgeTextColor: "#1a1a1a",
  borderRadius: 10,
  layout: "stack",
  showPerItemPrice: true,
  showSavings: true,
};

export function newTier(minQty: number, value: number): Tier {
  return {
    minQty,
    type: "percentage",
    value,
    title: `Buy ${minQty}`,
    subtitle: "",
    badge: "",
    label: "",
  };
}

export function defaultOfferConfig(): OfferConfig {
  const tiers = [newTier(2, 10), newTier(3, 15)];
  tiers[1].badge = "Most popular";
  return {
    scope: "all",
    products: [],
    collections: [],
    countMode: "product",
    message: "Buy {qty}+ and save",
    tiers,
    heading: "Buy more, save more",
    showSingleTier: true,
    preselectTier: 1,
    combinesWith: {
      orderDiscounts: true,
      productDiscounts: false,
      shippingDiscounts: true,
    },
    startsAt: null,
    endsAt: null,
  };
}

export function parseConfig(json: string | null | undefined): OfferConfig {
  const base = defaultOfferConfig();
  if (!json) return base;
  try {
    const parsed = JSON.parse(json);
    return {
      ...base,
      ...parsed,
      combinesWith: { ...base.combinesWith, ...(parsed.combinesWith ?? {}) },
    };
  } catch {
    return base;
  }
}

export function parseSettings(json: string | null | undefined): WidgetSettings {
  if (!json) return { ...DEFAULT_WIDGET_SETTINGS };
  try {
    return { ...DEFAULT_WIDGET_SETTINGS, ...JSON.parse(json) };
  } catch {
    return { ...DEFAULT_WIDGET_SETTINGS };
  }
}

/** Returns a list of human-readable problems; empty means valid. */
export function validateOffer(title: string, config: OfferConfig): string[] {
  const errors: string[] = [];
  if (!title.trim()) errors.push("Give the offer a name.");
  if (!config.tiers.length) errors.push("Add at least one tier.");

  const seen = new Set<number>();
  config.tiers.forEach((t, i) => {
    const n = `Tier ${i + 1}`;
    if (!Number.isInteger(t.minQty) || t.minQty < 1) {
      errors.push(`${n}: quantity must be a whole number of 1 or more.`);
    }
    if (seen.has(t.minQty)) errors.push(`${n}: two tiers use quantity ${t.minQty}.`);
    seen.add(t.minQty);
    if (!Number.isFinite(t.value) || t.value < 0) {
      errors.push(`${n}: enter a discount value.`);
    } else if (t.type === "percentage" && (t.value <= 0 || t.value > 100)) {
      errors.push(`${n}: percentage must be between 0 and 100.`);
    } else if (t.type === "amountOff" && t.value <= 0) {
      errors.push(`${n}: amount off must be more than 0.`);
    }
  });

  if (config.scope === "products" && !config.products.length) {
    errors.push("Pick at least one product, or apply the offer to all products.");
  }
  if (config.scope === "collections" && !config.collections.length) {
    errors.push("Pick at least one collection, or apply the offer to all products.");
  }
  if (config.startsAt && config.endsAt && config.endsAt <= config.startsAt) {
    errors.push("The end date must be after the start date.");
  }
  return errors;
}

/** Tiers sorted by quantity, which is how they're shown and stored. */
export function sortTiers(tiers: Tier[]): Tier[] {
  return [...tiers].sort((a, b) => a.minQty - b.minQty);
}

/** The JSON the discount Function reads from the discount's metafield. */
export function functionConfiguration(config: OfferConfig) {
  return {
    scope: config.scope,
    productIds: config.products.map((p) => p.id),
    countMode: config.countMode,
    message: config.message,
    tiers: config.tiers.map((t) => ({
      minQty: t.minQty,
      type: t.type,
      value: t.value,
      label: t.label || undefined,
    })),
  };
}

/** Input-query variables for the Function (collection membership check). */
export function functionInput(config: OfferConfig) {
  return {
    collectionIds:
      config.scope === "collections" ? config.collections.map((c) => c.id) : [],
  };
}

/** Plain-English summary of one tier, used in the admin list and preview. */
export function describeTier(t: Tier, currency = "$"): string {
  switch (t.type) {
    case "percentage":
      return `Buy ${t.minQty}+, ${t.value}% off`;
    case "amountOff":
      return `Buy ${t.minQty}+, ${currency}${t.value.toFixed(2)} off each`;
    case "fixedPrice":
      return `Buy ${t.minQty}+, ${currency}${t.value.toFixed(2)} each`;
  }
}

/** Unit price after a tier is applied (same maths as the Function). */
export function discountedUnitPrice(unit: number, t: Tier | null): number {
  if (!t) return unit;
  switch (t.type) {
    case "percentage":
      return Math.max(0, unit * (1 - Math.min(t.value, 100) / 100));
    case "amountOff":
      return Math.max(0, unit - t.value);
    case "fixedPrice":
      return Math.min(unit, t.value);
  }
}
