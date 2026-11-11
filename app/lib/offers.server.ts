/* eslint-disable @typescript-eslint/no-explicit-any -- untyped Admin API responses */
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import {
  functionConfiguration,
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
      discount: { ...discountInput(title, config, status), functionHandle: FUNCTION_HANDLE },
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
  if (errs.length && !errs.some((e: any) => /not exist|not found/i.test(e.message))) {
    throwUserErrors(errs);
  }
}

/** Creates or updates an offer and its Shopify discount, then republishes the widget data. */
export async function saveOffer(
  admin: Admin,
  shop: string,
  input: { id?: number; title: string; status: Status; config: OfferConfig },
) {
  // Store tiers in quantity order, keeping the preselected tier pointing at
  // the same tier after sorting.
  const tiers = sortTiers(input.config.tiers);
  const preselected = input.config.tiers[input.config.preselectTier];
  const config = {
    ...input.config,
    tiers,
    preselectTier: preselected ? tiers.indexOf(preselected) : -1,
  };
  const existing = input.id
    ? await prisma.offer.findFirst({ where: { id: input.id, shop } })
    : null;

  let discountId = existing?.discountId ?? null;
  if (discountId) {
    try {
      await updateDiscount(admin, discountId, input.title, config, input.status);
    } catch (e) {
      // Discount was deleted in Shopify admin: make a new one.
      if (!(e instanceof ShopifyUserError && /not exist|not found/i.test(e.message))) throw e;
      discountId = null;
    }
  }
  if (!discountId) {
    discountId = await createDiscount(admin, input.title, config, input.status);
  }
  await setDiscountMetafields(admin, discountId, config);

  const data = {
    shop,
    title: input.title,
    status: input.status,
    discountId,
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
  return saveOffer(admin, shop, {
    title: `${offer.title} (copy)`,
    status: "DRAFT",
    config: parseConfig(offer.config),
  });
}

export async function deleteOffer(admin: Admin, shop: string, id: number) {
  const offer = await prisma.offer.findFirst({ where: { id, shop } });
  if (!offer) return;
  if (offer.discountId) await deleteDiscount(admin, offer.discountId);
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
  const [offers, settings] = await Promise.all([
    prisma.offer.findMany({
      where: { shop, status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
    }),
    getSettings(shop),
  ]);

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
          rounding: t.rounding,
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
