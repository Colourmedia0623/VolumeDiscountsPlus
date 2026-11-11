import { useEffect } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData, useNavigate } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { describeTier, parseConfig } from "../lib/offers";
import {
  ShopifyUserError,
  deleteOffer,
  setOfferStatus,
} from "../lib/offers.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const offers = await prisma.offer.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
  });

  const shopHandle = session.shop.replace(".myshopify.com", "");
  const apiKey = process.env.SHOPIFY_API_KEY || "";
  return {
    offers: offers.map((o) => {
      const config = parseConfig(o.config);
      return {
        id: o.id,
        title: o.title,
        status: o.status,
        tiers: config.tiers.map((t) => describeTier(t)),
        appliesTo:
          config.scope === "all"
            ? "All products"
            : config.scope === "products"
              ? `${config.products.length} product${config.products.length === 1 ? "" : "s"}`
              : `${config.collections.length} collection${config.collections.length === 1 ? "" : "s"}`,
      };
    }),
    // Opens the theme editor on a product page with our block ready to drop in.
    themeEditorUrl: `https://admin.shopify.com/store/${shopHandle}/themes/current/editor?template=product&addAppBlockId=${apiKey}/volume-tiers&target=mainSection`,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const form = await request.formData();
  const id = Number(form.get("id"));
  const intent = form.get("intent");

  try {
    if (intent === "delete") {
      await deleteOffer(admin, session.shop, id);
      return { ok: true, message: "Offer deleted" };
    }
    if (intent === "activate" || intent === "deactivate") {
      await setOfferStatus(
        admin,
        session.shop,
        id,
        intent === "activate" ? "ACTIVE" : "DRAFT",
      );
      return {
        ok: true,
        message: intent === "activate" ? "Offer activated" : "Offer paused",
      };
    }
  } catch (e) {
    const message =
      e instanceof ShopifyUserError ? e.message : "Something went wrong";
    return { ok: false, message };
  }
  return { ok: false, message: "Unknown action" };
};

export default function Offers() {
  const { offers, themeEditorUrl } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const navigate = useNavigate();
  const shopify = useAppBridge();

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      shopify.toast.show(fetcher.data.message, { isError: !fetcher.data.ok });
    }
  }, [fetcher.state, fetcher.data, shopify]);

  const submit = (intent: string, id: number) =>
    fetcher.submit({ intent, id }, { method: "POST" });

  return (
    <s-page heading="Volume discount offers">
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={() => navigate("/app/offers/new")}
      >
        Create offer
      </s-button>

      {offers.length === 0 ? (
        <s-section>
          <s-stack gap="base" alignItems="center" padding="large">
            <s-heading>Reward customers for buying more</s-heading>
            <s-paragraph>
              Create quantity-break tiers like “Buy 2, save 10%” and “Buy 3,
              save 15%”. Customers pick a tier right on the product page and
              the discount is applied automatically at checkout.
            </s-paragraph>
            <s-button
              variant="primary"
              onClick={() => navigate("/app/offers/new")}
            >
              Create your first offer
            </s-button>
          </s-stack>
        </s-section>
      ) : (
        <s-section padding="none">
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Offer</s-table-header>
              <s-table-header>Tiers</s-table-header>
              <s-table-header>Applies to</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header>Actions</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {offers.map((offer) => (
                <s-table-row key={offer.id}>
                  <s-table-cell>
                    <s-link href={`/app/offers/${offer.id}`}>
                      {offer.title}
                    </s-link>
                  </s-table-cell>
                  <s-table-cell>
                    <s-stack gap="small-500">
                      {offer.tiers.map((t) => (
                        <s-text key={t}>{t}</s-text>
                      ))}
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>{offer.appliesTo}</s-table-cell>
                  <s-table-cell>
                    {offer.status === "ACTIVE" ? (
                      <s-badge tone="success">Active</s-badge>
                    ) : (
                      <s-badge>Paused</s-badge>
                    )}
                  </s-table-cell>
                  <s-table-cell>
                    <s-button-group>
                      <s-button
                        slot="secondary-actions"
                        onClick={() =>
                          submit(
                            offer.status === "ACTIVE" ? "deactivate" : "activate",
                            offer.id,
                          )
                        }
                      >
                        {offer.status === "ACTIVE" ? "Pause" : "Activate"}
                      </s-button>
                      <s-button
                        slot="secondary-actions"
                        tone="critical"
                        onClick={() => {
                          if (confirm(`Delete “${offer.title}”?`)) {
                            submit("delete", offer.id);
                          }
                        }}
                      >
                        Delete
                      </s-button>
                    </s-button-group>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        </s-section>
      )}

      <s-section slot="aside" heading="Show tiers on your store">
        <s-paragraph>
          Add the <s-text type="strong">Volume discount tiers</s-text> block to
          your product page so shoppers can pick a quantity break.
        </s-paragraph>
        <s-button href={themeEditorUrl} target="_blank">
          Add block in theme editor
        </s-button>
      </s-section>
      <s-section slot="aside" heading="How it works">
        <s-unordered-list>
          <s-list-item>Each offer creates an automatic discount.</s-list-item>
          <s-list-item>
            The best tier the cart qualifies for is applied at checkout.
          </s-list-item>
          <s-list-item>
            If two offers cover the same product, Shopify applies the bigger
            discount unless you allow them to combine.
          </s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
