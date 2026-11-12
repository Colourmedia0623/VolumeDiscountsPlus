/* eslint-disable @typescript-eslint/no-explicit-any -- untyped Admin API responses */
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import {
  functionConfiguration,
  rangeTitle,
  functionInput,
  parseConfig,
  parseSettings,
  sortTiers,
  type OfferConfig,
  type WidgetSettings,
} from "./offers";

type Admin = AdminApiContext;

export const FUNCTION_HANDLE = "volume-discount-function";
const DISCOUNT_NAMESPACE = "$app:volume-discount";
// App-data metafield on the app installation. The theme extension reads it
// in Liquid as `app.metafields.volume_discounts.offers`.
const WIDGET_NAMESPACE = "volume_discounts";
const WIDGET_KEY = "offers";

export class ShopifyUserError extends Error {
  constructor(public messages: string[]) {
    super(messages.join(" "));
  }
}

async function gql<T = any>(
  admin: Admin,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await admin.graphql(query, { variables });
  const json: any = await res.json();
  if (json.errors?.length) {
    throw new Error(json.errors.map((e: any) => e.message).join("; "));
  }
  return json.data as T;
}

function throwUserErrors(errors: { message: string }[] | undefined) {
  if (errors?.length) throw new ShopifyUserError(errors.map((e) => e.message));
}

type Status = "ACTIVE" | "DRAFT";

// Pausing is done through the schedule (an end date of "now") rather than
// discountAutomaticDeactivate/Activate, because activating resets the start
// date and would break offers scheduled for the future.
function discountInput(title: string, config: OfferConfig, status: Status) {
  const now = Date.now();
  const schedule =
    status === "DRAFT"
      ? {
          startsAt: new Date(now - 60_000).toISOString(),
          endsAt: new Date(now).toISOString(),
        }
      : {
          startsAt: config.startsAt || new Date(now).toISOString(),
          endsAt: config.endsAt || null,
        };
  return {
    title,
    discountClasses: ["PRODUCT"],
    combinesWith: config.combinesWith,
    ...schedule,
  };
}

async function setDiscountMetafields(
  admin: Admin,
  discountId: string,
  config: OfferConfig,
) {
  const data = await gql(
    admin,
    `#graphql
    mutation VdpSetDiscountMetafields($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message }
      }
    }`,
    {
      metafields: [
        {
          ownerId: discountId,
          namespace: DISCOUNT_NAMESPACE,
          key: "function-configuration",
          type: "json",
          value: JSON.stringify(functionConfiguration(config)),
        },
        {
          ownerId: discountId,
          namespace: DISCOUNT_NAMESPACE,
          key: "function-input",
          type: "json",
          value: JSON.stringify(functionInput(config)),
        },
      ],
    },
  );
  throwUserErrors(data.metafieldsSet.userErrors);
}

async function createDiscount(
  admin: Admin,
  title: string,
  config: OfferConfig,
  status: Status,
) {
  const data = await gql(
    admin,
    `#graphql
    mutation VdpCreateDiscount($discount: DiscountAutomaticAppInput!) {
      discountAutomaticAppCreate(automaticAppDiscount: $discount) {
        automaticAppDiscount { discountId }
        userErrors { field message }
      }
    }`,
    {
      discount: {
        ...discountInput(title, config, status),
        functionHandle: FUNCTION_HANDLE,
      },
    },
  );
  throwUserErrors(data.discountAutomaticAppCreate.userErrors);
  return data.discountAutomaticAppCreate.automaticAppDiscount
    .discountId as string;
}

async function updateDiscount(
  admin: Admin,
  id: string,
  title: string,
  config: OfferConfig,
  status: Status,
) {
  const data = await gql(
    admin,
    `#graphql
    mutation VdpUpdateDiscount($id: ID!, $discount: DiscountAutomaticAppInput!) {
      discountAutomaticAppUpdate(id: $id, automaticAppDiscount: $discount) {
        automaticAppDiscount { discountId }
        userErrors { field message }
      }
    }`,
    { id, discount: discountInput(title, config, status) },
  );
  throwUserErrors(data.discountAutomaticAppUpdate.userErrors);
}

async function deleteDiscount(admin: Admin, id: string) {
  const data = await gql(
    admin,
    `#graphql
    mutation VdpDelete($id: ID!) {
      discountAutomaticDelete(id: $id) {
        deletedAutomaticDiscountId
        userErrors { field message }
      }
    }`,
    { id },
  );
  // Already deleted in Shopify admin? That's fine.
  const errs = data.discountAutomaticDelete.userErrors ?? [];
  if (
    errs.length &&
    !errs.some((e: any) => /not exist|not found/i.test(e.message))
  ) {
    throwUserErrors(errs);
  }
}

// ---------------------------------------------------------------------------
// Built-in discounts
//
// Shopify only runs Functions from a custom-distribution app on Shopify Plus
// stores. Elsewhere each tier becomes an ordinary automatic discount with a
// minimum quantity. They don't combine with each other, so at checkout
// Shopify applies the best tier the cart qualifies for.
// ---------------------------------------------------------------------------

export type DiscountEngine = "function" | "builtin";

const PLUS_ONLY = /shopify plus/i;

export async function getDiscountEngine(
  shop: string,
): Promise<DiscountEngine | null> {
  const row = await prisma.shopSettings.findUnique({ where: { shop } });
  return (row?.discountEngine as DiscountEngine | null) ?? null;
}

async function setDiscountEngine(shop: string, engine: DiscountEngine) {
  await prisma.shopSettings.upsert({
    where: { shop },
    create: { shop, settings: "{}", discountEngine: engine },
    update: { discountEngine: engine },
  });
}

/** Tiers that become a built-in discount (skips "No discount" and 0% tiers). */
function builtinTiers(config: OfferConfig) {
  const sorted = sortTiers(config.tiers);
  return sorted
    .map((t, i) => ({
      tier: t,
      title: t.title || rangeTitle(sorted, i, config.unitName),
    }))
    .filter(({ tier }) => tier.type !== "none" && tier.value > 0);
}

function builtinItems(config: OfferConfig) {
  if (config.scope === "products") {
    return { products: { productsToAdd: config.products.map((p) => p.id) } };
  }
  if (config.scope === "collections") {
    return { collections: { add: config.collections.map((c) => c.id) } };
  }
  return { all: true };
}

async function createBuiltinDiscounts(
  admin: Admin,
  title: string,
  config: OfferConfig,
  status: Status,
): Promise<string[]> {
  const base = discountInput(title, config, status);
  const ids: string[] = [];
  for (const { tier, title: tierTitle } of builtinTiers(config)) {
    const value =
      tier.type === "percentage"
        ? { percentage: Math.min(tier.value, 100) / 100 }
        : {
            discountAmount: {
              amount: tier.value.toFixed(2),
              appliesOnEachItem: true,
            },
          };
    // Shown to shoppers in cart and checkout.
    const shopperTitle =
      tier.label ||
      config.message.replace(/\{qty\}/g, String(tier.minQty)) ||
      `${title}: ${tierTitle}`;
    // Shopify needs automatic discount titles to be unique, so a copied offer
    // (or two offers with the same tier text) gets the offer name added.
    const candidates = [
      shopperTitle,
      `${shopperTitle} (${title})`,
      `${shopperTitle} (${title}) ${Date.now().toString(36)}`,
    ];
    let data: any;
    for (const [n, candidate] of candidates.entries()) {
      data = await gql(
        admin,
        `#graphql
        mutation VdpCreateBuiltin($discount: DiscountAutomaticBasicInput!) {
          discountAutomaticBasicCreate(automaticBasicDiscount: $discount) {
            automaticDiscountNode { id }
            userErrors { field message }
          }
        }`,
        {
          discount: {
            title: candidate,
            startsAt: base.startsAt,
            endsAt: base.endsAt,
            // Tiers must never stack with each other.
            combinesWith: { ...config.combinesWith, productDiscounts: false },
            minimumRequirement: {
              quantity: { greaterThanOrEqualToQuantity: String(tier.minQty) },
            },
            customerGets: { value, items: builtinItems(config) },
          },
        },
      );
      const errs: { field?: string[] | null; message: string }[] =
        data.discountAutomaticBasicCreate.userErrors ?? [];
      const titleTaken = errs.some(
        (e) =>
          e.field?.includes("title") ||
          /title|unique|already|taken|exists/i.test(e.message),
      );
      if (!titleTaken || n === candidates.length - 1) break;
    }
    try {
      throwUserErrors(data.discountAutomaticBasicCreate.userErrors);
    } catch (e) {
      // Don't leave half an offer behind.
      await deleteBuiltinDiscounts(admin, ids);
      throw e;
    }
    ids.push(data.discountAutomaticBasicCreate.automaticDiscountNode.id);
  }
  return ids;
}

async function deleteBuiltinDiscounts(admin: Admin, ids: string[]) {
  for (const id of ids) await deleteDiscount(admin, id);
}

function parseIds(json: string | null | undefined): string[] {
  try {
    const ids = JSON.parse(json ?? "[]");
    return Array.isArray(ids) ? ids.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Problems that only apply when the store uses built-in discounts. */
export function builtinProblems(config: OfferConfig): string[] {
  const errors: string[] = [];
  if (config.tiers.some((t) => t.type === "fixedPrice")) {
    errors.push(
      "“Set price” tiers need Shopify Plus on this store. Use % off or Amount off instead.",
    );
  }
  return errors;
}

/** Creates or updates an offer and its Shopify discount, then republishes the widget data. */
export async function saveOffer(
  admin: Admin,
  shop: string,
  input: { id?: number; title: string; status: Status; config: OfferConfig },
) {
  // Store tiers in quantity order, keeping the preselected tier pointing at
  // the same tier after sorting.
  // A 0% or £0 tier is the same as "No discount".
  const tiers = sortTiers(
    input.config.tiers.map((t) =>
      t.type !== "none" && t.type !== "fixedPrice" && !(t.value > 0)
        ? { ...t, type: "none" as const }
        : t,
    ),
  );
  const preselectedIndex = input.config.preselectTier;
  const order = input.config.tiers
    .map((t, i) => ({ t, i }))
    .sort((a, b) => a.t.minQty - b.t.minQty);
  const config = {
    ...input.config,
    tiers,
    preselectTier: order.findIndex((o) => o.i === preselectedIndex),
  };
  const existing = input.id
    ? await prisma.offer.findFirst({ where: { id: input.id, shop } })
    : null;

  let engine = await getDiscountEngine(shop);
  let discountId = existing?.discountId ?? null;
  let builtinIds = parseIds(existing?.builtinDiscountIds);

  if (engine !== "builtin") {
    try {
      if (discountId) {
        try {
          await updateDiscount(
            admin,
            discountId,
            input.title,
            config,
            input.status,
          );
        } catch (e) {
          // Discount was deleted in Shopify admin: make a new one.
          if (!(
            e instanceof ShopifyUserError &&
            /not exist|not found/i.test(e.message)
          ))
            throw e;
          discountId = null;
        }
      }
      if (!discountId) {
        discountId = await createDiscount(
          admin,
          input.title,
          config,
          input.status,
        );
      }
      await setDiscountMetafields(admin, discountId, config);
      if (engine !== "function") await setDiscountEngine(shop, "function");
      engine = "function";
    } catch (e) {
      if (!(e instanceof ShopifyUserError && PLUS_ONLY.test(e.message)))
        throw e;
      // Not on Shopify Plus: switch this store to built-in discounts.
      if (discountId) await deleteDiscount(admin, discountId);
      discountId = null;
      await setDiscountEngine(shop, "builtin");
      engine = "builtin";
    }
  }

  if (engine === "builtin") {
    const problems = builtinProblems(config);
    if (problems.length) throw new ShopifyUserError(problems);
    // Simplest to replace them all; tiers may have been added or removed.
    await deleteBuiltinDiscounts(admin, builtinIds);
    builtinIds = await createBuiltinDiscounts(
      admin,
      input.title,
      config,
      input.status,
    );
  }

  const data = {
    shop,
    title: input.title,
    status: input.status,
    discountId,
    builtinDiscountIds:
      engine === "builtin" ? JSON.stringify(builtinIds) : null,
    config: JSON.stringify(config),
  };
  const offer = existing
    ? await prisma.offer.update({ where: { id: existing.id }, data })
    : await prisma.offer.create({ data });

  await publishWidgetData(admin, shop);
  return offer;
}

export async function setOfferStatus(
  admin: Admin,
  shop: string,
  id: number,
  status: Status,
) {
  const offer = await prisma.offer.findFirst({ where: { id, shop } });
  if (!offer) return;
  // saveOffer also recreates the discount if it was lost (e.g. after a reinstall).
  await saveOffer(admin, shop, {
    id,
    title: offer.title,
    status,
    config: parseConfig(offer.config),
  });
}

/** Copies an offer (and creates its own discount), paused so it can be edited first. */
export async function duplicateOffer(admin: Admin, shop: string, id: number) {
  const offer = await prisma.offer.findFirst({ where: { id, shop } });
  if (!offer) return null;
  const config = parseConfig(offer.config);
  return saveOffer(admin, shop, {
    title: `${offer.title} copy`,
    status: "DRAFT",
    // Keep the exact look, even if the offer was following the store default.
    config: { ...config, style: config.style ?? (await getSettings(shop)) },
  });
}

export async function deleteOffer(admin: Admin, shop: string, id: number) {
  const offer = await prisma.offer.findFirst({ where: { id, shop } });
  if (!offer) return;
  if (offer.discountId) await deleteDiscount(admin, offer.discountId);
  await deleteBuiltinDiscounts(admin, parseIds(offer.builtinDiscountIds));
  await prisma.offer.delete({ where: { id } });
  await publishWidgetData(admin, shop);
}

export async function getSettings(shop: string): Promise<WidgetSettings> {
  const row = await prisma.shopSettings.findUnique({ where: { shop } });
  return parseSettings(row?.settings);
}

export async function saveSettings(
  admin: Admin,
  shop: string,
  settings: WidgetSettings,
) {
  const json = JSON.stringify(settings);
  await prisma.shopSettings.upsert({
    where: { shop },
    create: { shop, settings: json },
    update: { settings: json },
  });
  await publishWidgetData(admin, shop);
}

/**
 * Writes every active offer (plus widget styling) to an app-data metafield so
 * the theme block can render without calling our server.
 */
export async function publishWidgetData(admin: Admin, shop: string) {
  const [offers, settings, engine] = await Promise.all([
    prisma.offer.findMany({
      where: { shop, status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
    }),
    getSettings(shop),
    getDiscountEngine(shop),
  ]);
  // Built-in discounts can't round prices, so the widget mustn't either.
  const canRound = engine !== "builtin";

  const now = new Date().toISOString();
  const payload = {
    settings,
    offers: offers
      .map((o) => ({ id: o.id, config: parseConfig(o.config) }))
      // Drop offers that have already ended; future ones stay so the widget
      // can switch on by itself when they start.
      .filter(({ config }) => !config.endsAt || config.endsAt > now)
      .map(({ id, config }) => ({
        id,
        scope: config.scope,
        productIds: config.products.map((p) => numericId(p.id)),
        collectionIds: config.collections.map((c) => numericId(c.id)),
        countMode: config.countMode,
        heading: config.heading,
        headingLines: config.headingLines,
        showSingleTier: config.showSingleTier,
        preselectTier: config.preselectTier,
        startsAt: config.startsAt,
        endsAt: config.endsAt,
        display: {
          unitName: config.unitName,
          showDiscountTag: config.showDiscountTag,
          discountTagText: config.discountTagText,
          priceDisplay: config.priceDisplay,
          eachPriceText: config.eachPriceText,
          showCompareAt: config.showCompareAt,
          showTotal: config.showTotal,
          totalText: config.totalText,
          hideDecimals: config.hideDecimals,
          footerText: config.footerText,
        },
        // Each offer carries its own style; offers without one use the store default.
        style: config.style ?? settings,
        tiers: config.tiers.map((t) => ({
          minQty: t.minQty,
          type: t.type,
          value: t.value,
          rounding: canRound ? t.rounding : "",
          title: t.title,
          subtitle: t.subtitle,
          badge: t.badge,
        })),
      })),
  };

  const install = await gql(
    admin,
    `#graphql
    query VdpAppInstallation { currentAppInstallation { id } }`,
  );
  const data = await gql(
    admin,
    `#graphql
    mutation VdpPublishWidget($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message }
      }
    }`,
    {
      metafields: [
        {
          ownerId: install.currentAppInstallation.id,
          namespace: WIDGET_NAMESPACE,
          key: WIDGET_KEY,
          type: "json",
          value: JSON.stringify(payload),
        },
      ],
    },
  );
  throwUserErrors(data.metafieldsSet.userErrors);
}

/** Liquid exposes plain numeric ids (`product.id`), so store those for the widget. */
function numericId(gid: string): number {
  return Number(gid.split("/").pop());
}
