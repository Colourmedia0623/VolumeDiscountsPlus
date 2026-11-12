// Shared offer types, defaults and validation. Used by both the admin UI and
// the server-side sync code, so keep it free of server-only imports.
import type { CurrencyFormat, DateFormat } from "./formats";

export type TierType = "percentage" | "amountOff" | "fixedPrice" | "none";
/** Price ending the discounted unit price is rounded down to. "" = no rounding. */
export type PriceEnding = "" | ".99" | ".95" | ".49" | ".00";
export const PRICE_ENDINGS: Exclude<PriceEnding, "">[] = [
  ".99",
  ".95",
  ".49",
  ".00",
];
export type Scope = "all" | "products" | "collections";
export type CountMode = "product" | "variant" | "combined";

export interface Tier {
  /** Minimum quantity to unlock the tier. */
  minQty: number;
  type: TierType;
  /** Percent off, amount off each item, or the fixed unit price. Unused for "none". */
  value: number;
  /** Round the discounted unit price down to this ending, e.g. ".99". */
  rounding: PriceEnding;
  /** Card title on the product page. Empty = automatic range, e.g. "18 - 35 items". */
  title: string;
  /** Short line under the title, e.g. "Perfect for gifting". */
  subtitle: string;
  /** Ribbon above the card, e.g. "Most popular". Empty hides it. */
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
  /** Draw a line either side of the heading. */
  headingLines: boolean;
  /** Plural name used in automatic tier titles, e.g. "mugs" in "18 - 35 mugs". */
  unitName: string;
  /** Tag next to the title, e.g. "5% OFF". */
  showDiscountTag: boolean;
  /** `{discount}` is replaced by "5%" or "£0.10". */
  discountTagText: string;
  /** What the price on each card shows: the price of one item, or the tier total. */
  priceDisplay: "each" | "total";
  /** Text after the per-item price, e.g. "/ each ex VAT". */
  eachPriceText: string;
  /** Show the full price struck through next to the discounted price. */
  showCompareAt: boolean;
  /** Line under the cards with the selected tier's total. */
  showTotal: boolean;
  totalText: string;
  /** Show £12 instead of £12.00 (display only). */
  hideDecimals: boolean;
  /** Small print under the cards. Empty hides it. */
  footerText: string;
  /** This offer's colours and layout. Null = the store's default style. */
  style: WidgetSettings | null;
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
  /** Discount tag ("5% OFF") colours. */
  tagColor: string;
  tagTextColor: string;
  /** Per-part text colours. Empty = use textColor. */
  headingColor: string;
  titleColor: string;
  subtitleColor: string;
  priceColor: string;
  compareColor: string;
  /** Outline of unselected cards. Empty = a faint grey. */
  borderColor: string;
  /** Unselected card under the mouse. Empty = background unchanged / darker grey outline. */
  hoverBackgroundColor: string;
  hoverBorderColor: string;
  /** All text in an unselected card under the mouse. Empty = unchanged. */
  hoverTextColor: string;
  /** Width of the selected card's border, in px. */
  borderWidth: number;
  borderRadius: number;
  /** Gap between cards and their inner padding, in px. */
  spacing: number;
  layout: "stack" | "grid";
  /** Store-wide display formats (Settings page). Not changed per offer. */
  dateFormat: DateFormat;
  currencyFormat: CurrencyFormat;
}

export const DEFAULT_WIDGET_SETTINGS: WidgetSettings = {
  accentColor: "#1f6f5c",
  textColor: "#1a1a1a",
  backgroundColor: "#ffffff",
  selectedBackgroundColor: "#eef7f4",
  badgeColor: "#f2b134",
  badgeTextColor: "#1a1a1a",
  tagColor: "#1f6f5c",
  tagTextColor: "#ffffff",
  headingColor: "",
  titleColor: "",
  subtitleColor: "",
  priceColor: "",
  compareColor: "",
  borderColor: "",
  hoverBackgroundColor: "",
  hoverBorderColor: "",
  hoverTextColor: "",
  borderWidth: 2,
  borderRadius: 10,
  spacing: 12,
  layout: "stack",
  dateFormat: "d MMM yyyy",
  currencyFormat: "store",
};

type Palette = Pick<
  WidgetSettings,
  | "accentColor"
  | "textColor"
  | "backgroundColor"
  | "selectedBackgroundColor"
  | "badgeColor"
  | "badgeTextColor"
  | "tagColor"
  | "tagTextColor"
>;

/** Per-part colours a colour scheme resets, so the scheme shows as designed. */
export const PART_COLOR_RESET: Partial<WidgetSettings> = {
  headingColor: "",
  titleColor: "",
  subtitleColor: "",
  priceColor: "",
  compareColor: "",
  borderColor: "",
  hoverBackgroundColor: "",
  hoverBorderColor: "",
  hoverTextColor: "",
};

/** One-click colour schemes for the style editor. */
export const PALETTES: { name: string; colors: Palette }[] = [
  {
    name: "Evergreen",
    colors: {
      accentColor: "#1f6f5c",
      textColor: "#1a1a1a",
      backgroundColor: "#ffffff",
      selectedBackgroundColor: "#eef7f4",
      badgeColor: "#f2b134",
      badgeTextColor: "#1a1a1a",
      tagColor: "#1f6f5c",
      tagTextColor: "#ffffff",
    },
  },
  {
    name: "Harbour",
    colors: {
      accentColor: "#0b4f8a",
      textColor: "#13263a",
      backgroundColor: "#f4f8fc",
      selectedBackgroundColor: "#e2eefa",
      badgeColor: "#ff8a3d",
      badgeTextColor: "#ffffff",
      tagColor: "#0b4f8a",
      tagTextColor: "#ffffff",
    },
  },
  {
    name: "Midnight & apricot",
    colors: {
      accentColor: "#1d2b53",
      textColor: "#1d2b53",
      backgroundColor: "#edf2f4",
      selectedBackgroundColor: "#fde4cf",
      badgeColor: "#f59e0b",
      badgeTextColor: "#ffffff",
      tagColor: "#1d2b53",
      tagTextColor: "#ffffff",
    },
  },
  {
    name: "Terracotta",
    colors: {
      accentColor: "#b4532a",
      textColor: "#2f2a26",
      backgroundColor: "#fffaf6",
      selectedBackgroundColor: "#fbe9de",
      badgeColor: "#2f2a26",
      badgeTextColor: "#ffffff",
      tagColor: "#b4532a",
      tagTextColor: "#ffffff",
    },
  },
  {
    name: "Plum",
    colors: {
      accentColor: "#6b2d6b",
      textColor: "#2a1a2a",
      backgroundColor: "#ffffff",
      selectedBackgroundColor: "#f6ecf6",
      badgeColor: "#e0a800",
      badgeTextColor: "#2a1a2a",
      tagColor: "#6b2d6b",
      tagTextColor: "#ffffff",
    },
  },
  {
    name: "Lagoon",
    colors: {
      accentColor: "#0f766e",
      textColor: "#123330",
      backgroundColor: "#f3faf9",
      selectedBackgroundColor: "#dcf1ee",
      badgeColor: "#f26b5b",
      badgeTextColor: "#ffffff",
      tagColor: "#0f766e",
      tagTextColor: "#ffffff",
    },
  },
  {
    name: "Berry",
    colors: {
      accentColor: "#9d174d",
      textColor: "#2b1020",
      backgroundColor: "#ffffff",
      selectedBackgroundColor: "#fdecf3",
      badgeColor: "#9d174d",
      badgeTextColor: "#ffffff",
      tagColor: "#f9c74f",
      tagTextColor: "#2b1020",
    },
  },
  {
    name: "Graphite",
    colors: {
      accentColor: "#222222",
      textColor: "#222222",
      backgroundColor: "#ffffff",
      selectedBackgroundColor: "#f1f1f1",
      badgeColor: "#e63946",
      badgeTextColor: "#ffffff",
      tagColor: "#222222",
      tagTextColor: "#ffffff",
    },
  },
  {
    name: "Sand",
    colors: {
      accentColor: "#7a5c3a",
      textColor: "#3b2f22",
      backgroundColor: "#faf6ef",
      selectedBackgroundColor: "#f0e6d6",
      badgeColor: "#3b2f22",
      badgeTextColor: "#faf6ef",
      tagColor: "#7a5c3a",
      tagTextColor: "#ffffff",
    },
  },
];

export const DEFAULT_RIBBON = "Most popular";

export function newTier(minQty: number, value: number): Tier {
  return {
    minQty,
    type: "percentage",
    value,
    rounding: "",
    title: "",
    subtitle: "",
    badge: "",
    label: "",
  };
}

export function defaultOfferConfig(): OfferConfig {
  const tiers = [newTier(2, 10), newTier(3, 15)];
  tiers[1].badge = DEFAULT_RIBBON;
  return {
    scope: "all",
    products: [],
    collections: [],
    countMode: "product",
    message: "Buy {qty}+ and save",
    tiers,
    heading: "Buy more, save more",
    headingLines: true,
    unitName: "items",
    showDiscountTag: true,
    discountTagText: "{discount} OFF",
    priceDisplay: "each",
    eachPriceText: "each",
    showCompareAt: true,
    showTotal: false,
    totalText: "Total:",
    hideDecimals: false,
    footerText: "",
    style: null,
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
      tiers: Array.isArray(parsed.tiers)
        ? parsed.tiers.map((t: Partial<Tier>) => ({ ...newTier(1, 0), ...t }))
        : base.tiers,
      combinesWith: { ...base.combinesWith, ...(parsed.combinesWith ?? {}) },
      style: parsed.style
        ? { ...DEFAULT_WIDGET_SETTINGS, ...parsed.style }
        : null,
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
    if (seen.has(t.minQty))
      errors.push(`${n}: two tiers use quantity ${t.minQty}.`);
    seen.add(t.minQty);
    if (t.type === "none") {
      // No discount: nothing to check.
    } else if (!Number.isFinite(t.value) || t.value < 0) {
      errors.push(`${n}: enter a discount value.`);
    } else if (t.type === "percentage" && t.value > 100) {
      errors.push(`${n}: percentage can't be more than 100.`);
    }
  });

  if (config.scope === "products" && !config.products.length) {
    errors.push(
      "Pick at least one product, or apply the offer to all products.",
    );
  }
  if (config.scope === "collections" && !config.collections.length) {
    errors.push(
      "Pick at least one collection, or apply the offer to all products.",
    );
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
      rounding: t.rounding || undefined,
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

/** Plain-English summary of one tier, used in the admin. */
export function describeTier(
  t: Tier,
  money: (n: number) => string = (n) => n.toFixed(2),
): string {
  switch (t.type) {
    case "percentage":
      return `${t.value}% off`;
    case "amountOff":
      return `${money(t.value)} off each`;
    case "fixedPrice":
      return `${money(t.value)} each`;
    case "none":
      return "No discount";
  }
}

/** Rounds a price (in minor units, e.g. pence) down to an ending like .99. */
export function applyPriceEnding(
  cents: number,
  ending: PriceEnding | undefined,
): number {
  if (!ending) return cents;
  const end = Math.round(Number(ending) * 100);
  const rounded = Math.floor((cents - end) / 100) * 100 + end;
  // Never round to free or below zero; keep the exact price instead.
  return rounded > 0 && rounded <= cents ? rounded : cents;
}

/** Unit price after a tier is applied (same maths as the Function). */
export function discountedUnitPrice(unit: number, t: Tier | null): number {
  if (!t) return unit;
  let price: number;
  switch (t.type) {
    case "percentage":
      price = Math.max(0, unit * (1 - Math.min(t.value, 100) / 100));
      break;
    case "amountOff":
      price = Math.max(0, unit - t.value);
      break;
    case "fixedPrice":
      price = Math.min(unit, t.value);
      break;
    default:
      return unit;
  }
  return applyPriceEnding(Math.round(price * 100), t.rounding) / 100;
}

/** Total for `qty` items. Unrounded % tiers apply to the line total, like checkout. */
export function tierTotal(unit: number, t: Tier | null, qty: number): number {
  if (t && t.type === "percentage" && !t.rounding) {
    return (
      Math.round(unit * qty * (1 - Math.min(t.value, 100) / 100) * 100) / 100
    );
  }
  return discountedUnitPrice(unit, t) * qty;
}

/**
 * Automatic card title from the tier ranges, e.g. "1 - 17 mugs", "18 - 35 mugs",
 * "36+ mugs". `tiers` must be sorted by quantity.
 */
export function rangeTitle(tiers: Tier[], i: number, unitName: string): string {
  const from = tiers[i].minQty;
  const next = tiers[i + 1]?.minQty;
  let unit = unitName.trim();
  // "1 item", not "1 items".
  if (from === 1 && next === 2) unit = singular(unit);
  const range =
    next === undefined
      ? `${from}+`
      : next - 1 <= from
        ? `${from}`
        : `${from} - ${next - 1}`;
  return unit ? `${range} ${unit}` : range;
}

/** Rough singular for item names: "items" → "item", "boxes" → "box". */
export function singular(word: string): string {
  if (/(ss|us|is)$/i.test(word)) return word;
  if (/(s|x|z|ch|sh)es$/i.test(word)) return word.slice(0, -2);
  if (/ies$/i.test(word)) return word.slice(0, -3) + "y";
  if (/s$/i.test(word)) return word.slice(0, -1);
  return word;
}

/** Text inside the discount tag, e.g. "5% OFF". Empty when the tier has no discount. */
export function discountTag(
  config: Pick<OfferConfig, "discountTagText">,
  t: Tier | null,
  unit: number,
  money: (n: number) => string,
): string {
  if (!t || t.type === "none" || !(t.value > 0 || t.type === "fixedPrice"))
    return "";
  let amount = "";
  if (t.type === "percentage") amount = `${t.value}%`;
  else if (t.type === "amountOff") amount = money(t.value);
  else {
    const pct =
      unit > 0
        ? Math.round((1 - discountedUnitPrice(unit, t) / unit) * 100)
        : 0;
    if (pct <= 0) return "";
    amount = `${pct}%`;
  }
  return (config.discountTagText || "{discount} OFF").replace(
    /\{discount\}/g,
    amount,
  );
}
