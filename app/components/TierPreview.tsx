import { useState } from "react";
import {
  discountTag,
  discountedUnitPrice,
  rangeTitle,
  sortTiers,
  tierTotal,
  type OfferConfig,
  type Tier,
  type WidgetSettings,
} from "../lib/offers";
import { formatMoney, type CurrencyFormat } from "../lib/formats";

export function moneyFormatter(
  currency: string,
  hideDecimals = false,
  format: CurrencyFormat = "store",
) {
  return (n: number) => formatMoney(n, currency, format, hideDecimals);
}

interface Row {
  key: string;
  qty: number;
  tier: Tier | null;
  title: string;
  subtitle: string;
  badge: string;
}

/** The cards shown on the product page, in order. Mirrors volume-tiers.js. */
export function previewRows(config: OfferConfig): Row[] {
  const sorted = sortTiers(config.tiers);
  const bands: (Tier | null)[] = [...sorted];
  // Optional full-price card for quantities below the first tier.
  if (config.showSingleTier && sorted.length && sorted[0].minQty > 1) bands.unshift(null);
  const asTiers = bands.map((t) => t ?? ({ minQty: 1 } as Tier));
  return bands.map((t, i) => ({
    key: t ? `t${config.tiers.indexOf(t)}` : "single",
    qty: asTiers[i].minQty,
    tier: t,
    title: t?.title || rangeTitle(asTiers, i, config.unitName),
    subtitle: t?.subtitle ?? "",
    badge: t?.badge ?? "",
  }));
}

/**
 * Admin-side version of the storefront block, so merchants see their tiers and
 * colours while editing. Mirrors extensions/volume-tiers/assets/volume-tiers.js.
 */
export function TierPreview({
  config,
  style: s,
  unitPrice,
  currency = "GBP",
  currencyFormat = "store",
}: {
  config: OfferConfig;
  style: WidgetSettings;
  unitPrice: number;
  currency?: string;
  currencyFormat?: CurrencyFormat;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const money = moneyFormatter(currency, config.hideDecimals, currencyFormat);
  const exactMoney = moneyFormatter(currency, false, currencyFormat);

  const rows = previewRows(config);
  const pre = config.tiers[config.preselectTier];
  const preKey = pre ? `t${config.tiers.indexOf(pre)}` : rows[0]?.key;
  const activeKey = rows.some((r) => r.key === selected) ? selected : preKey;
  const active = rows.find((r) => r.key === activeKey) ?? rows[0];
  const grid = s.layout === "grid";
  const gap = s.spacing ?? 12;

  return (
    <div style={{ color: s.textColor, fontSize: 14 }}>
      {config.heading && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0 12px", fontWeight: 700, fontSize: 15, color: s.headingColor || undefined }}>
          {config.headingLines && <span style={{ flex: 1, height: 1, background: "currentColor", opacity: 0.2 }} />}
          <span style={{ margin: config.headingLines ? 0 : "0 auto" }}>{config.heading}</span>
          {config.headingLines && <span style={{ flex: 1, height: 1, background: "currentColor", opacity: 0.2 }} />}
        </div>
      )}
      <div
        style={{
          display: "grid",
          gap,
          paddingTop: grid ? 8 : 0,
          gridTemplateColumns: grid ? `repeat(${Math.min(rows.length, 3)}, minmax(0, 1fr))` : "1fr",
        }}
      >
        {rows.map((r) => {
          const each = discountedUnitPrice(unitPrice, r.tier);
          const discounted = each < unitPrice - 0.004;
          const tag = config.showDiscountTag ? discountTag(config, r.tier, unitPrice, exactMoney) : "";
          const isActive = r.key === activeKey;
          // Mouseover text colour (if set) replaces the per-part colours.
          const hoverInk = !isActive && hovered === r.key ? s.hoverTextColor || undefined : undefined;
          const showEach = config.priceDisplay === "each";
          const price = showEach ? each : tierTotal(unitPrice, r.tier, r.qty);
          const compare = showEach ? unitPrice : unitPrice * r.qty;
          return (
            <button
              type="button"
              key={r.key}
              onClick={() => setSelected(r.key)}
              onMouseEnter={() => setHovered(r.key)}
              onMouseLeave={() => setHovered(null)}
              style={{
                position: "relative",
                display: "flex",
                flexDirection: grid ? "column" : "row",
                alignItems: grid ? "stretch" : "center",
                gap: 10,
                textAlign: grid ? "center" : "left",
                padding: `${gap}px ${gap + 2}px`,
                marginTop: r.badge && !grid ? 8 : 0,
                borderRadius: s.borderRadius,
                border: `${s.borderWidth ?? 2}px solid ${isActive ? s.accentColor : "transparent"}`,
                background: isActive
                  ? s.selectedBackgroundColor
                  : hovered === r.key
                    ? s.hoverBackgroundColor || s.backgroundColor
                    : s.backgroundColor,
                boxShadow: isActive
                  ? undefined
                  : `inset 0 0 0 1px ${hovered === r.key ? s.hoverBorderColor || "rgba(0,0,0,0.25)" : s.borderColor || "rgba(0,0,0,0.08)"}`,
                color: hoverInk ?? s.textColor,
                cursor: "pointer",
                font: "inherit",
              }}
            >
              {r.badge && (
                <span
                  style={{
                    position: "absolute",
                    top: -10,
                    ...(grid ? { left: "50%", transform: "translateX(-50%)" } : { right: 12 }),
                    whiteSpace: "nowrap",
                    background: s.badgeColor,
                    color: s.badgeTextColor,
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "2px 9px",
                    borderRadius: 999,
                  }}
                >
                  {r.badge}
                </span>
              )}
              {!grid && (
                <span
                  style={{
                    width: 16,
                    height: 16,
                    flex: "none",
                    borderRadius: "50%",
                    border: `2px solid ${isActive ? s.accentColor : "rgba(0,0,0,0.35)"}`,
                    boxShadow: isActive ? `inset 0 0 0 3px ${s.selectedBackgroundColor}` : undefined,
                    background: isActive ? s.accentColor : "transparent",
                  }}
                />
              )}
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 700, color: hoverInk ?? (s.titleColor || undefined) }}>{r.title}</span>
                {tag && (
                  <span
                    style={{
                      display: "inline-block",
                      marginLeft: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      background: s.tagColor,
                      color: s.tagTextColor,
                      borderRadius: 4,
                      padding: "1px 6px",
                      verticalAlign: "middle",
                    }}
                  >
                    {tag}
                  </span>
                )}
                {r.subtitle && (
                  <span style={{ display: "block", fontSize: 12, fontWeight: 600, opacity: 0.8, color: hoverInk ?? (s.subtitleColor || undefined) }}>{r.subtitle}</span>
                )}
              </span>
              <span style={{ textAlign: grid ? "center" : "right", whiteSpace: "nowrap" }}>
                <span style={{ fontWeight: 700, color: hoverInk ?? (s.priceColor || undefined) }}>{money(price)}</span>
                {showEach && config.eachPriceText && (
                  <span style={{ fontSize: 11, opacity: 0.75 }}> {config.eachPriceText}</span>
                )}
                {config.showCompareAt && discounted && (
                  <span style={{ display: "block", fontSize: 12, textDecoration: "line-through", opacity: 0.55, color: hoverInk ?? (s.compareColor || undefined) }}>
                    {money(compare)}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      {config.showTotal && active && (
        <div style={{ textAlign: "right", marginTop: 10, fontSize: 13 }}>
          {config.totalText}{" "}
          <strong>{money(tierTotal(unitPrice, active.tier, active.qty))}</strong>
        </div>
      )}
      {config.footerText && (
        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75, textAlign: "center" }}>{config.footerText}</div>
      )}
    </div>
  );
}
