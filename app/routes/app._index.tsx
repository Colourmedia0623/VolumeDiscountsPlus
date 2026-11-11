import { useEffect, useRef, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  useFetcher,
  useLoaderData,
  useNavigate,
  useSearchParams,
} from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  STATUS_TABS,
  buildOfferList,
  parseListParams,
  relativeTime,
  type DisplayStatus,
} from "../lib/offerList";
import {
  ShopifyUserError,
  deleteOffer,
  duplicateOffer,
  getSettings,
  setOfferStatus,
} from "../lib/offers.server";
import { formatDate } from "../lib/formats";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const params = parseListParams(new URL(request.url).searchParams);
  const [offers, settings] = await Promise.all([
    prisma.offer.findMany({ where: { shop: session.shop } }),
    getSettings(session.shop),
  ]);
  const { dateFormat } = settings;
  const list = buildOfferList(offers, params);

  const shopHandle = session.shop.replace(".myshopify.com", "");
  const apiKey = process.env.SHOPIFY_API_KEY || "";
  const now = new Date();
  return {
    params,
    counts: list.counts,
    total: list.total,
    page: list.page,
    pages: list.pages,
    from: list.from,
    to: list.to,
    hasAnyOffers: offers.length > 0,
    offers: list.rows.map((o) => ({
      id: o.id,
      title: o.title,
      active: o.status === "ACTIVE",
      display: o.display,
      lastEdited: relativeTime(o.updatedAt, now, dateFormat),
      // Shown under the status, e.g. "Starts 1 Dec 2026".
      schedule:
        o.display === "scheduled" && o.config.startsAt
          ? `Starts ${formatDate(o.config.startsAt, dateFormat)}`
          : o.display === "expired" && o.config.endsAt
            ? `Ended ${formatDate(o.config.endsAt, dateFormat)}`
            : o.display === "active" && o.config.endsAt
              ? `Ends ${formatDate(o.config.endsAt, dateFormat)}`
              : "",
      tierCount: o.config.tiers.length,
      discountId: o.discountId ? o.discountId.split("/").pop() : null,
    })),
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
    switch (intent) {
      case "delete":
        await deleteOffer(admin, session.shop, id);
        return { ok: true, message: "Offer deleted" };
      case "duplicate":
        await duplicateOffer(admin, session.shop, id);
        return { ok: true, message: "Offer duplicated (paused)" };
      case "activate":
      case "deactivate":
        await setOfferStatus(
          admin,
          session.shop,
          id,
          intent === "activate" ? "ACTIVE" : "DRAFT",
        );
        return {
          ok: true,
          message: intent === "activate" ? "Offer switched on" : "Offer paused",
        };
    }
  } catch (e) {
    const message =
      e instanceof ShopifyUserError ? e.message : "Something went wrong";
    return { ok: false, message };
  }
  return { ok: false, message: "Unknown action" };
};

const STATUS_BADGE: Record<
  DisplayStatus,
  { label: string; tone: "success" | "info" | "neutral" | "warning" }
> = {
  active: { label: "Active", tone: "success" },
  scheduled: { label: "Scheduled", tone: "info" },
  paused: { label: "Paused", tone: "neutral" },
  expired: { label: "Expired", tone: "warning" },
};

const SORTS = [
  { value: "updated:desc", label: "Last edited (newest)" },
  { value: "updated:asc", label: "Last edited (oldest)" },
  { value: "name:asc", label: "Name A–Z" },
  { value: "name:desc", label: "Name Z–A" },
  { value: "status:asc", label: "Status" },
];

export default function Offers() {
  const data = useLoaderData<typeof loader>();
  const { offers, params, counts } = data;
  const fetcher = useFetcher<typeof action>();
  const navigate = useNavigate();
  const shopify = useAppBridge();
  const [, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(params.q);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      shopify.toast.show(fetcher.data.message, { isError: !fetcher.data.ok });
    }
  }, [fetcher.state, fetcher.data, shopify]);

  const setParams = (patch: Record<string, string | null>) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v === null || v === "") next.delete(k);
          else next.set(k, v);
        }
        if (!("page" in patch)) next.delete("page");
        return next;
      },
      { replace: true },
    );

  const onSearch = (value: string) => {
    setQuery(value);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setParams({ q: value }), 300);
  };

  const submit = (intent: string, id: number) =>
    fetcher.submit({ intent, id }, { method: "POST" });

  // Which row is being changed, so its switch reflects the pending state.
  const pendingId =
    fetcher.state !== "idle" ? Number(fetcher.formData?.get("id")) : null;
  const pendingIntent = fetcher.formData?.get("intent");

  return (
    <s-page heading="Volume discount offers" inlineSize="base">
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={() => navigate("/app/offers/new")}
      >
        Create offer
      </s-button>

      {!data.hasAnyOffers ? (
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
          <s-table
            paginate={data.pages > 1}
            hasPreviousPage={data.page > 1}
            hasNextPage={data.page < data.pages}
            onPreviousPage={() => setParams({ page: String(data.page - 1) })}
            onNextPage={() => setParams({ page: String(data.page + 1) })}
          >
            <s-stack slot="filters" gap="small">
              <s-stack direction="inline" gap="small-200">
                {STATUS_TABS.map((t) => (
                  <s-button
                    key={t.value}
                    variant={params.tab === t.value ? "secondary" : "tertiary"}
                    onClick={() =>
                      setParams({ status: t.value === "all" ? null : t.value })
                    }
                  >
                    {`${t.label} (${counts[t.value]})`}
                  </s-button>
                ))}
              </s-stack>
              <s-grid gridTemplateColumns="1fr auto" gap="small" alignItems="center">
                <s-search-field
                  label="Search offers"
                  labelAccessibilityVisibility="exclusive"
                  placeholder="Search offers…"
                  value={query}
                  onInput={(e) => onSearch(e.currentTarget.value)}
                />
                <s-select
                  label="Sort by"
                  labelAccessibilityVisibility="exclusive"
                  value={`${params.sort}:${params.dir}`}
                  onChange={(e) => {
                    const [sort, dir] = e.currentTarget.value.split(":");
                    setParams({ sort, dir });
                  }}
                >
                  {SORTS.map((s) => (
                    <s-option key={s.value} value={s.value}>
                      {s.label}
                    </s-option>
                  ))}
                </s-select>
              </s-grid>
            </s-stack>

            <s-table-header-row>
              <s-table-header listSlot="primary">Offer name</s-table-header>
              <s-table-header>Last edited</s-table-header>
              <s-table-header listSlot="secondary">Status</s-table-header>
              <s-table-header>Offer type</s-table-header>
              <s-table-header>Actions</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {offers.map((offer) => {
                const badge = STATUS_BADGE[offer.display];
                const on =
                  pendingId === offer.id
                    ? pendingIntent === "activate"
                    : offer.active;
                return (
                  <s-table-row key={offer.id}>
                    <s-table-cell>
                      <s-link href={`/app/offers/${offer.id}`}>
                        {offer.title}
                      </s-link>
                    </s-table-cell>
                    <s-table-cell>{offer.lastEdited}</s-table-cell>
                    <s-table-cell>
                      <s-stack gap="small-300">
                      <s-stack direction="inline" gap="small" alignItems="center">
                        <s-badge tone={badge.tone}>{badge.label}</s-badge>
                        <s-switch
                          label={on ? `Pause ${offer.title}` : `Switch on ${offer.title}`}
                          labelAccessibilityVisibility="exclusive"
                          checked={on}
                          disabled={pendingId === offer.id || undefined}
                          onChange={() =>
                            submit(on ? "deactivate" : "activate", offer.id)
                          }
                        />
                      </s-stack>
                      {offer.schedule && (
                        <s-text tone="neutral">{offer.schedule}</s-text>
                      )}
                      </s-stack>
                    </s-table-cell>
                    <s-table-cell>
                      {`Quantity breaks · ${offer.tierCount} tier${offer.tierCount === 1 ? "" : "s"}`}
                    </s-table-cell>
                    <s-table-cell>
                      <s-stack direction="inline" gap="small-300">
                        {offer.discountId && (
                          <s-button
                            variant="tertiary"
                            icon="view"
                            accessibilityLabel={`View ${offer.title} in Shopify discounts`}
                            href={`shopify://admin/discounts/${offer.discountId}`}
                            target="_top"
                          />
                        )}
                        <s-button
                          variant="tertiary"
                          icon="edit"
                          accessibilityLabel={`Edit ${offer.title}`}
                          onClick={() => navigate(`/app/offers/${offer.id}`)}
                        />
                        <s-button
                          variant="tertiary"
                          icon="duplicate"
                          accessibilityLabel={`Duplicate ${offer.title}`}
                          onClick={() => submit("duplicate", offer.id)}
                        />
                        <s-button
                          variant="tertiary"
                          tone="critical"
                          icon="delete"
                          accessibilityLabel={`Delete ${offer.title}`}
                          onClick={() => {
                            if (confirm(`Delete “${offer.title}”? This also removes its discount.`)) {
                              submit("delete", offer.id);
                            }
                          }}
                        />
                      </s-stack>
                    </s-table-cell>
                  </s-table-row>
                );
              })}
            </s-table-body>
          </s-table>
          <s-box padding="base">
            <s-text tone="neutral">
              {data.total
                ? `Showing ${data.from}–${data.to} of ${data.total} offer${data.total === 1 ? "" : "s"}`
                : "No offers match these filters."}
            </s-text>
          </s-box>
        </s-section>
      )}

      <s-section slot="aside" heading="Show tiers on your store">
        <s-paragraph>
          Add the <s-text type="strong">Volume discount tiers</s-text> block to
          your product page so shoppers can pick a quantity break.
        </s-paragraph>
        <s-button href={data.themeEditorUrl} target="_blank">
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
