import { useState } from "react";
import {
  discountedUnitPrice,
  sortTiers,
  type OfferConfig,
  type Tier,
  type WidgetSettings,
} from "../lib/offers";

const money = (n: number) => `$${n.toFixed(2)}`;

interface Row {
  key: string;
  qty: number;
  tier: Tier | null;
  title: string;
  subtitle: string;
  badge: string;
}

/**
 * Admin-side version of the storefront block, so merchants see their tiers and
 * colours while editing. Mirrors extensions/volume-tiers/assets/volume-tiers.js.
 */
export function TierPreview({
  config,
  settings,
  unitPrice,
}: {
  config: OfferConfig;
  settings: WidgetSettings;
  unitPrice: number;
}) {
  const [selected, setSelected] = useState<number | null>(null);

  const rows: Row[] = [];
  if (config.showSingleTier) {
    rows.push({ key: "single", qty: 1, tier: null, title: "Buy 1", subtitle: "Standard price", badge: "" });
  }
  sortTiers(config.tiers).forEach((t) =>
    rows.push({
      key: `${t.minQty}-${config.tiers.indexOf(t)}`,
      qty: t.minQty,
      tier: t,
      title: t.title || `Buy ${t.minQty}`,
      subtitle: t.subtitle,
      badge: t.badge,
    }),
  );

  const pre = config.tiers[config.preselectTier];
  const initial = pre ? rows.findIndex((r) => r.tier === pre) : 0;
  const active = selected ?? Math.max(initial, 0);
  const s = settings;

  return (
    <div style={{ color: s.textColor }}>
      {config.heading && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0 10px", fontWeight: 600 }}>
          <span style={{ flex: 1, height: 1, background: "#d4d4d4" }} />
          <span>{config.heading}</span>
          <span style={{ flex: 1, height: 1, background: "#d4d4d4" }} />
        </div>
      )}
      <div
        style={{
          display: "grid",
          gap: 10,
          gridTemplateColumns: s.layout === "grid" ? "repeat(auto-fit, minmax(120px, 1fr))" : "1fr",
        }}
      >
        {rows.map((r, i) => {
          const each = discountedUnitPrice(unitPrice, r.tier);
          const total = each * r.qty;
          const full = unitPrice * r.qty;
          const saving = full - total;
          const isActive = i === active;
          return (
            <button
              type="button"
              key={r.key}
              onClick={() => setSelected(i)}
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                gap: 10,
                textAlign: "left",
                padding: "12px 14px",
                marginTop: r.badge ? 8 : 0,
                borderRadius: s.borderRadius,
                border: `2px solid ${isActive ? s.accentColor : "#dcdcdc"}`,
                background: isActive ? s.selectedBackgroundColor : s.backgroundColor,
                color: s.textColor,
                cursor: "pointer",
                font: "inherit",
              }}
            >
              {r.badge && (
                <span
                  style={{
                    position: "absolute",
                    top: -10,
                    right: 12,
                    background: s.badgeColor,
                    color: s.badgeTextColor,
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: 999,
                  }}
                >
                  {r.badge}
                </span>
              )}
              <span
                style={{
                  width: 16,
                  height: 16,
                  flex: "none",
                  borderRadius: "50%",
                  border: `2px solid ${isActive ? s.accentColor : "#9a9a9a"}`,
                  boxShadow: isActive ? `inset 0 0 0 3px ${s.backgroundColor}` : undefined,
                  background: isActive ? s.accentColor : "transparent",
                }}
              />
              <span style={{ flex: 1 }}>
                <span style={{ display: "block", fontWeight: 600 }}>
                  {r.title}
                  {s.showSavings && saving > 0.004 && (
                    <span
                      style={{
                        marginLeft: 6,
                        fontSize: 11,
                        fontWeight: 700,
                        color: s.accentColor,
                        border: `1px solid ${s.accentColor}`,
                        borderRadius: 4,
                        padding: "0 4px",
                      }}
                    >
                      Save {money(saving)}
                    </span>
                  )}
                </span>
                {r.subtitle && <span style={{ display: "block", fontSize: 12, opacity: 0.75 }}>{r.subtitle}</span>}
              </span>
              <span style={{ textAlign: "right" }}>
                <span style={{ display: "block", fontWeight: 700 }}>{money(total)}</span>
                {saving > 0.004 && (
                  <span style={{ display: "block", fontSize: 12, textDecoration: "line-through", opacity: 0.6 }}>
                    {money(full)}
                  </span>
                )}
                {s.showPerItemPrice && r.qty > 1 && (
                  <span style={{ display: "block", fontSize: 11, opacity: 0.75 }}>{money(each)} each</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
