/**
 * @typedef {import("../generated/api").CartInput} RunInput
 * @typedef {import("../generated/api").CartLinesDiscountsGenerateRunResult} CartLinesDiscountsGenerateRunResult
 *
 * @typedef {"percentage" | "amountOff" | "fixedPrice" | "none"} TierType
 * @typedef {{ minQty: number, type: TierType, value: number, rounding?: string, label?: string }} Tier
 * @typedef {{
 *   scope?: "all" | "products" | "collections",
 *   productIds?: string[],
 *   countMode?: "product" | "variant" | "combined",
 *   message?: string,
 *   tiers?: Tier[],
 * }} OfferConfig
 */

const EMPTY = { operations: [] };
// Enum values from the schema, inlined so the logic tests can run without
// the CLI-generated types.
const DISCOUNT_CLASS_PRODUCT = "PRODUCT";
const SELECTION_ALL = "ALL";

/**
 * Tiered quantity-break discount.
 *
 * Eligible cart lines are grouped (per product, per variant, or all together),
 * the group's total quantity picks the best tier it qualifies for, and that
 * tier's discount is applied to every line in the group.
 *
 * @param {RunInput} input
 * @returns {CartLinesDiscountsGenerateRunResult}
 */
export function cartLinesDiscountsGenerateRun(input) {
  if (!input.discount.discountClasses.includes(DISCOUNT_CLASS_PRODUCT)) {
    return EMPTY;
  }

  /** @type {OfferConfig} */
  const config = input.discount.metafield?.jsonValue ?? {};
  const tiers = normaliseTiers(config.tiers);
  if (!tiers.length || !input.cart.lines.length) return EMPTY;

  const scope = config.scope ?? "all";
  const productIds = new Set(config.productIds ?? []);
  const countMode = config.countMode ?? "product";
  // Fixed amounts are set in the store's currency; the cart may be in another.
  const rate = Number(input.presentmentCurrencyRate) || 1;

  /** @type {Map<string, typeof input.cart.lines>} */
  const groups = new Map();
  for (const line of input.cart.lines) {
    const m = line.merchandise;
    if (m.__typename !== "ProductVariant") continue;
    if (scope === "products" && !productIds.has(m.product.id)) continue;
    if (scope === "collections" && !m.product.inAnyCollection) continue;

    const key =
      countMode === "combined"
        ? "all"
        : countMode === "variant"
          ? m.id
          : m.product.id;
    const group = groups.get(key) ?? [];
    group.push(line);
    groups.set(key, group);
  }

  const candidates = [];
  for (const lines of groups.values()) {
    const qty = lines.reduce((sum, l) => sum + l.quantity, 0);
    const tier = bestTier(tiers, qty);
    // "none" tiers are full-price quantity bands (e.g. 1-17) above a cheaper tier.
    if (!tier || tier.type === "none") continue;

    const message = formatMessage(config.message, tier);

    if (tier.type === "percentage" && !tier.rounding) {
      candidates.push({
        message,
        targets: lines.map((l) => ({ cartLine: { id: l.id } })),
        value: { percentage: { value: Math.min(tier.value, 100) } },
      });
      continue;
    }

    // Amount-based and rounded tiers are worked out per line because variants
    // in one group can have different prices. Prices are in the cart's
    // currency, so rounding to .99 happens in the shopper's currency.
    for (const line of lines) {
      const unitPrice = Number(line.cost.amountPerQuantity.amount);
      const amount = tier.value * rate;
      let price =
        tier.type === "percentage"
          ? unitPrice * (1 - Math.min(tier.value, 100) / 100)
          : tier.type === "fixedPrice"
            ? Math.min(unitPrice, amount)
            : unitPrice - amount;
      price = Math.max(0, price);
      price = applyPriceEnding(Math.round(price * 100), tier.rounding) / 100;
      const off = unitPrice - price;
      if (!(off > 0.004)) continue;
      candidates.push({
        message,
        targets: [{ cartLine: { id: line.id } }],
        value: {
          fixedAmount: { amount: round2(off), appliesToEachItem: true },
        },
      });
    }
  }

  if (!candidates.length) return EMPTY;

  return {
    operations: [
      {
        productDiscountsAdd: {
          candidates,
          // Candidates never target the same line twice, so apply all of them.
          selectionStrategy: SELECTION_ALL,
        },
      },
    ],
  };
}

/** @param {unknown} tiers @returns {Tier[]} */
function normaliseTiers(tiers) {
  if (!Array.isArray(tiers)) return [];
  return tiers
    .map((t) => ({
      minQty: Math.floor(Number(t?.minQty)),
      type: t?.type,
      value: Number(t?.value),
      rounding: typeof t?.rounding === "string" ? t.rounding : undefined,
      label: typeof t?.label === "string" ? t.label : undefined,
    }))
    .filter(
      (t) =>
        t.minQty >= 1 &&
        (t.type === "none" ||
          (["percentage", "amountOff", "fixedPrice"].includes(t.type) &&
            Number.isFinite(t.value) &&
            (t.type === "fixedPrice" ? t.value >= 0 : t.value > 0))),
    )
    .sort((a, b) => b.minQty - a.minQty);
}

/** Highest tier whose minimum quantity is met. Tiers are sorted descending. */
function bestTier(tiers, qty) {
  return tiers.find((t) => qty >= t.minQty);
}

function formatMessage(template, tier) {
  if (tier.label) return tier.label;
  const fallback = template || "Volume discount";
  return fallback.replace(/\{qty\}/g, String(tier.minQty));
}

/**
 * Rounds a price in minor units down to an ending such as ".99". Keeps the
 * exact price if rounding would make it free. Same as applyPriceEnding in
 * app/lib/offers.ts.
 */
function applyPriceEnding(cents, ending) {
  if (!ending) return cents;
  const end = Math.round(Number(ending) * 100);
  if (!Number.isFinite(end) || end < 0 || end > 99) return cents;
  const rounded = Math.floor((cents - end) / 100) * 100 + end;
  return rounded > 0 && rounded <= cents ? rounded : cents;
}

function round2(n) {
  return (Math.round(n * 100) / 100).toFixed(2);
}
