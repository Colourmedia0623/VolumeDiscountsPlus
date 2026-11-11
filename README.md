# Volume Discounts Plus

A Shopify app for tiered quantity-break discounts ("Buy 2, save 10%. Buy 3, save 15%").
Merchants create offers in the admin; shoppers pick a tier on the product page; the
discount is applied automatically at checkout by a Shopify Function.

## What's in here

| Part | Where | What it does |
| --- | --- | --- |
| Admin app | `app/` | React Router embedded app. Offers list, offer editor with live preview, widget style settings. |
| Discount Function | `extensions/volume-discount-function/` | Runs at cart/checkout. Groups eligible lines, finds the best tier the quantity reaches, applies it. |
| Theme block | `extensions/volume-tiers/` | "Volume discount tiers" app block for product pages. Renders the tier cards and sets the quantity. |

### Offer options

- **Tiers**: any number. Each is a minimum quantity plus one of: percentage off,
  amount off each item, or a fixed price per item. Each tier has a card title,
  subtitle, badge (e.g. "Most popular") and an optional checkout message.
- **Applies to**: all products, specific products, or specific collections.
- **Count quantity**: per product (variants add up), per variant, or across all
  eligible products (mix and match).
- **Widget**: heading, optional "Buy 1 at standard price" card, which tier is
  preselected.
- **Combinations** with other product/order/shipping discounts, and start/end dates.
- **Widget style** (shop-wide): colours, corner radius, stacked or grid layout,
  per-item price and "Save $X" tags.

### How data flows

1. Saving an offer stores it in the app database (Prisma, `Offer` table), then
   creates or updates an **automatic app discount** linked to the Function.
2. The tier config is written to the discount's metafields
   (`$app:volume-discount` / `function-configuration` and `function-input`),
   which the Function reads.
3. All active offers plus widget styling are written to an app-data metafield
   (`volume_discounts.offers` on the app installation), which the theme block
   reads in Liquid. No storefront calls hit the app server.

Pausing an offer sets the discount's end date to now (rather than using
deactivate/activate, which would wipe a future start date).

## Getting started

Requirements: Node 22.12+, the [Shopify CLI](https://shopify.dev/docs/apps/tools/cli),
a Shopify Partner account and a development store.

```sh
npm install
shopify app config link   # create/link the app in your Partner account; fills client_id
shopify app dev           # runs the app, Function and theme extension against your dev store
```

Then in the app: **Create offer**, save it, and use **Add block in theme editor**
on the Offers page to place the "Volume discount tiers" block on the product template.

### Tests

```sh
cd extensions/volume-discount-function
npx vitest run tests/logic.test.js   # fast: runs the Function's JS against every fixture + validates fixtures against the schema
npx vitest run                       # also builds the real Wasm and runs the fixtures through it
```

Fixtures in `tests/fixtures/` cover: no config, below first tier, best tier wins,
per-product / per-variant / combined counting, product and collection scope,
amount off, fixed price, and currency conversion.

### Deploying

`shopify app deploy` pushes the Function and theme extension. The admin app needs
hosting (any Node host; a `Dockerfile` is included). Swap SQLite for Postgres/MySQL
in `prisma/schema.prisma` for production.

## Not built yet

- Billing / subscription plans (`shopify.billing`).
- Cart drawer/page upsell ("Add 1 more to save 15%").
- Analytics on offer performance.
- Translations beyond English for the storefront block.
