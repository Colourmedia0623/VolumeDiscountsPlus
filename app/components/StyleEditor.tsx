import { useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import {
  PALETTES,
  PART_COLOR_RESET,
  type WidgetSettings,
} from "../lib/offers";

type ColorKey = {
  [K in keyof WidgetSettings]: WidgetSettings[K] extends string ? K : never;
}[keyof WidgetSettings];

type PartId =
  | "heading"
  | "card"
  | "selected"
  | "title"
  | "tag"
  | "subtitle"
  | "price"
  | "compare"
  | "badge"
  | "text";

interface PartField {
  key: ColorKey;
  label: string;
  /** Empty means "same as the main text colour" (or a faint grey outline). */
  optional?: boolean;
}

const PARTS: { id: PartId; label: string; fields: PartField[] }[] = [
  { id: "heading", label: "Heading", fields: [{ key: "headingColor", label: "Text", optional: true }] },
  {
    id: "card",
    label: "Card",
    fields: [
      { key: "backgroundColor", label: "Background" },
      { key: "borderColor", label: "Outline", optional: true },
    ],
  },
  {
    id: "selected",
    label: "Selected card",
    fields: [
      { key: "selectedBackgroundColor", label: "Background" },
      { key: "accentColor", label: "Border and radio button" },
    ],
  },
  { id: "title", label: "Title", fields: [{ key: "titleColor", label: "Text", optional: true }] },
  {
    id: "tag",
    label: "Discount tag",
    fields: [
      { key: "tagColor", label: "Background" },
      { key: "tagTextColor", label: "Text" },
    ],
  },
  { id: "subtitle", label: "Subtitle", fields: [{ key: "subtitleColor", label: "Text", optional: true }] },
  { id: "price", label: "Price", fields: [{ key: "priceColor", label: "Text", optional: true }] },
  { id: "compare", label: "Was price", fields: [{ key: "compareColor", label: "Text", optional: true }] },
  {
    id: "badge",
    label: "Ribbon",
    fields: [
      { key: "badgeColor", label: "Background" },
      { key: "badgeTextColor", label: "Text" },
    ],
  },
  { id: "text", label: "Other text", fields: [{ key: "textColor", label: "Main text colour" }] },
];

const FAINT_OUTLINE = "#e1e1e1";
const INK = "#303030";
const HILITE = "#2c6ecb";

/** The colour a part actually shows, following the same fallbacks as the widget. */
function shown(s: WidgetSettings, key: ColorKey) {
  const v = s[key];
  if (v) return v;
  return key === "borderColor" ? FAINT_OUTLINE : s.textColor;
}

function samePalette(s: WidgetSettings, colors: Partial<WidgetSettings>) {
  return (Object.keys(colors) as ColorKey[]).every(
    (k) => String(s[k]).toLowerCase() === String(colors[k]).toLowerCase(),
  );
}

/**
 * Look-and-feel controls shared by the offer editor and the Settings page:
 * layout tiles, shape sliders, colour schemes with undo, and a clickable sample
 * for picking the colour of each part of the widget.
 */
export function StyleEditor({
  value: s,
  onChange,
  money = (n) => `£${n.toFixed(2)}`,
}: {
  value: WidgetSettings;
  onChange: (patch: Partial<WidgetSettings>) => void;
  /** Formats the sample prices in the shop's currency. */
  money?: (n: number) => string;
}) {
  const [part, setPart] = useState<PartId>("selected");
  const [history, setHistory] = useState<WidgetSettings[]>([]);

  const applyScheme = (colors: Partial<WidgetSettings>) => {
    setHistory((h) => [...h.slice(-19), s]);
    onChange({ ...PART_COLOR_RESET, ...colors });
  };
  const undo = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    onChange(prev);
  };

  const active = PARTS.find((p) => p.id === part) ?? PARTS[0];

  return (
    <s-stack gap="large-100">
      <Group title="Layout">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <LayoutTile
            label="Stacked list"
            hint="One row per tier"
            selected={s.layout === "stack"}
            onClick={() => onChange({ layout: "stack" })}
          >
            <div style={{ display: "grid", gap: 4 }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={miniCard(i === 1)}>
                  <span style={miniDot(i === 1)} />
                  <span style={miniLine(28)} />
                  <span style={{ ...miniLine(14), marginLeft: "auto" }} />
                </div>
              ))}
            </div>
          </LayoutTile>
          <LayoutTile
            label="Side by side"
            hint="Boxes in a row"
            selected={s.layout === "grid"}
            onClick={() => onChange({ layout: "grid" })}
          >
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4 }}>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{ ...miniCard(i === 1), flexDirection: "column", height: 52, justifyContent: "center" }}
                >
                  <span style={miniLine(18)} />
                  <span style={miniLine(12)} />
                </div>
              ))}
            </div>
          </LayoutTile>
        </div>
      </Group>

      <Group title="Shape">
        <Slider
          label="Corner roundness"
          min={0}
          max={40}
          value={s.borderRadius}
          onChange={(v) => onChange({ borderRadius: v })}
        />
        <Slider
          label="Spacing"
          min={4}
          max={24}
          value={s.spacing}
          onChange={(v) => onChange({ spacing: v })}
        />
        <Slider
          label="Selected border"
          min={1}
          max={4}
          value={s.borderWidth}
          onChange={(v) => onChange({ borderWidth: v })}
        />
      </Group>

      <Group
        title="Colour scheme"
        action={
          <s-button variant="tertiary" icon="undo" disabled={!history.length || undefined} onClick={undo}>
            Undo
          </s-button>
        }
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {PALETTES.map((p) => {
            const current = samePalette(s, p.colors);
            return (
              <button
                key={p.name}
                type="button"
                title={p.name}
                aria-label={`Use the ${p.name} colour scheme`}
                aria-pressed={current}
                onClick={() => applyScheme(p.colors)}
                style={{
                  width: 34,
                  height: 34,
                  padding: 3,
                  borderRadius: "50%",
                  border: `2px solid ${current ? INK : "transparent"}`,
                  background: "#fff",
                  cursor: "pointer",
                }}
              >
                <span
                  style={{
                    display: "block",
                    width: "100%",
                    height: "100%",
                    borderRadius: "50%",
                    boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.12)",
                    background: `conic-gradient(${p.colors.accentColor} 0 50%, ${p.colors.selectedBackgroundColor} 50% 80%, ${p.colors.badgeColor} 80% 100%)`,
                  }}
                />
              </button>
            );
          })}
        </div>
      </Group>

      <Group title="Colours">
        <s-text color="subdued">Click any part of the sample to change its colour.</s-text>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
            gap: 16,
            alignItems: "start",
          }}
        >
          <Sample s={s} part={part} onPick={setPart} money={money} />
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {PARTS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={p.id === part}
                  onClick={() => setPart(p.id)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "3px 9px 3px 4px",
                    borderRadius: 999,
                    border: `1px solid ${p.id === part ? INK : "#d4d4d4"}`,
                    background: p.id === part ? "#f1f1f1" : "#fff",
                    font: "inherit",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  <span style={{ display: "flex" }}>
                    {p.fields.map((f) => (
                      <span
                        key={f.key}
                        style={{
                          width: 14,
                          height: 14,
                          marginRight: -3,
                          borderRadius: "50%",
                          background: shown(s, f.key),
                          boxShadow: "0 0 0 1px #fff, 0 0 0 2px rgba(0,0,0,0.12)",
                        }}
                      />
                    ))}
                  </span>
                  <span style={{ marginLeft: 3 }}>{p.label}</span>
                </button>
              ))}
            </div>
            <div
              style={{
                display: "grid",
                gap: 10,
                padding: 12,
                borderRadius: 10,
                background: "#f7f7f7",
              }}
            >
              <s-text type="strong">{active.label}</s-text>
              {active.fields.map((f) => (
                <s-stack key={f.key} gap="small-100">
                  <s-color-field
                    label={f.label}
                    value={shown(s, f.key)}
                    details={
                      f.optional && !s[f.key]
                        ? f.key === "borderColor"
                          ? "Using a faint grey."
                          : "Using the main text colour."
                        : undefined
                    }
                    onChange={(e) => onChange({ [f.key]: e.currentTarget.value } as Partial<WidgetSettings>)}
                  />
                  {f.optional && s[f.key] && (
                    <s-button
                      variant="tertiary"
                      onClick={() => onChange({ [f.key]: "" } as Partial<WidgetSettings>)}
                    >
                      {f.key === "borderColor" ? "Use faint grey" : "Use main text colour"}
                    </s-button>
                  )}
                </s-stack>
              ))}
            </div>
          </div>
        </div>
      </Group>
    </s-stack>
  );
}

function Group({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <s-stack gap="small-300">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 28 }}>
        <s-text type="strong">{title}</s-text>
        {action}
      </div>
      {children}
    </s-stack>
  );
}

function LayoutTile({
  label,
  hint,
  selected,
  onClick,
  children,
}: {
  label: string;
  hint: string;
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      style={{
        display: "grid",
        gap: 10,
        padding: 12,
        textAlign: "left",
        borderRadius: 12,
        border: `2px solid ${selected ? INK : "#e3e3e3"}`,
        background: selected ? "#fafafa" : "#fff",
        cursor: "pointer",
        font: "inherit",
      }}
    >
      <div style={{ padding: 10, borderRadius: 8, background: "#f1f1f1" }}>{children}</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
        <span>
          <span style={{ display: "block", fontWeight: 600, fontSize: 13 }}>{label}</span>
          <span style={{ display: "block", fontSize: 12, color: "#616161" }}>{hint}</span>
        </span>
        <span
          aria-hidden
          style={{
            width: 18,
            height: 18,
            flex: "none",
            borderRadius: "50%",
            border: `2px solid ${selected ? INK : "#c4c4c4"}`,
            background: selected ? INK : "transparent",
            boxShadow: selected ? "inset 0 0 0 3px #fff" : undefined,
          }}
        />
      </div>
    </button>
  );
}

const miniCard = (on: boolean): CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: 5,
  height: 16,
  padding: "0 6px",
  borderRadius: 4,
  background: "#fff",
  boxShadow: on ? `inset 0 0 0 1.5px ${INK}` : "inset 0 0 0 1px #d4d4d4",
});
const miniDot = (on: boolean): CSSProperties => ({
  width: 7,
  height: 7,
  flex: "none",
  borderRadius: "50%",
  background: on ? INK : "#fff",
  boxShadow: "inset 0 0 0 1px #9a9a9a",
});
const miniLine = (w: number): CSSProperties => ({
  display: "block",
  width: w,
  height: 4,
  borderRadius: 2,
  background: "#c4c4c4",
  margin: "2px auto",
});

function Slider({
  label,
  min,
  max,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label style={{ display: "grid", gridTemplateColumns: "130px 1fr 52px", alignItems: "center", gap: 12, fontSize: 13 }}>
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
        style={{ width: "100%", accentColor: INK }}
      />
      <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: "#616161" }}>
        {value} px
      </span>
    </label>
  );
}

/** A small, fixed sample of the widget whose parts can be clicked. */
function Sample({
  s,
  part,
  onPick,
  money,
}: {
  s: WidgetSettings;
  part: PartId;
  onPick: (p: PartId) => void;
  money: (n: number) => string;
}) {
  // One handler for the whole sample; each clickable part carries data-part.
  // Keyboard users pick parts with the buttons beside the sample.
  const pick = (e: MouseEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-part]");
    if (el?.dataset.part) onPick(el.dataset.part as PartId);
  };
  const ring = (p: PartId): CSSProperties =>
    part === p ? { outline: `2px dashed ${HILITE}`, outlineOffset: 2, borderRadius: 3 } : {};
  const hit: CSSProperties = { cursor: "pointer" };
  const gap = Math.min(s.spacing, 14);

  const card = (selected: boolean, children: ReactNode, badge?: string) => (
    <div
      data-part={selected ? "selected" : "card"}
      style={{
        ...hit,
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: `${gap}px ${gap + 2}px`,
        marginTop: badge ? 8 : 0,
        borderRadius: s.borderRadius,
        background: selected ? s.selectedBackgroundColor : s.backgroundColor,
        boxShadow: selected
          ? `inset 0 0 0 ${s.borderWidth}px ${s.accentColor}`
          : `inset 0 0 0 1px ${s.borderColor || "rgba(0,0,0,0.12)"}`,
        ...(part === (selected ? "selected" : "card")
          ? { outline: `2px dashed ${HILITE}`, outlineOffset: 3 }
          : {}),
      }}
    >
      {badge && (
        <span
          data-part="badge"
          style={{
            ...hit,
            position: "absolute",
            top: -9,
            right: 10,
            padding: "1px 8px",
            borderRadius: 999,
            fontSize: 10,
            fontWeight: 700,
            background: s.badgeColor,
            color: s.badgeTextColor,
            ...ring("badge"),
          }}
        >
          {badge}
        </span>
      )}
      <span
        style={{
          width: 13,
          height: 13,
          flex: "none",
          borderRadius: "50%",
          border: `2px solid ${selected ? s.accentColor : "rgba(0,0,0,0.35)"}`,
          background: selected ? s.accentColor : "transparent",
          boxShadow: selected ? `inset 0 0 0 2px ${s.selectedBackgroundColor}` : undefined,
        }}
      />
      {children}
    </div>
  );

  const body = (title: string, tag: string, sub: string, price: string, was?: string) => (
    <>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span data-part="title" style={{ ...hit, fontWeight: 700, color: shown(s, "titleColor"), ...ring("title") }}>
          {title}
        </span>
        {tag && (
          <span
            data-part="tag"
            style={{
              ...hit,
              display: "inline-block",
              marginLeft: 5,
              padding: "0 5px",
              borderRadius: 4,
              fontSize: 10,
              fontWeight: 700,
              background: s.tagColor,
              color: s.tagTextColor,
              ...ring("tag"),
            }}
          >
            {tag}
          </span>
        )}
        <span
          data-part="subtitle"
          style={{
            ...hit,
            display: "block",
            fontSize: 11,
            fontWeight: 600,
            opacity: 0.8,
            color: shown(s, "subtitleColor"),
            ...ring("subtitle"),
          }}
        >
          {sub}
        </span>
      </span>
      <span style={{ textAlign: "right", whiteSpace: "nowrap" }}>
        <span data-part="price" style={{ ...hit, fontWeight: 700, color: shown(s, "priceColor"), ...ring("price") }}>
          {price}
        </span>
        <span data-part="text" style={{ ...hit, fontSize: 10, opacity: 0.75, color: s.textColor, ...ring("text") }}>
          {" "}each
        </span>
        {was && (
          <span
            data-part="compare"
            style={{
              ...hit,
              display: "block",
              fontSize: 11,
              textDecoration: "line-through",
              opacity: 0.55,
              color: shown(s, "compareColor"),
              ...ring("compare"),
            }}
          >
            {was}
          </span>
        )}
      </span>
    </>
  );

  return (
    <div
      role="presentation"
      onClick={pick}
      style={{
        display: "grid",
        gap,
        padding: 14,
        borderRadius: 12,
        background: "#f7f7f7",
        color: s.textColor,
        fontSize: 13,
      }}
    >
      <div
        data-part="heading"
        style={{ ...hit, textAlign: "center", fontWeight: 700, color: shown(s, "headingColor"), ...ring("heading") }}
      >
        Buy more, save more
      </div>
      {card(false, body("1 item", "", "Standard price", money(10)))}
      {card(true, body("2 – 4 items", "10% OFF", "Great for gifts", money(9), money(10)), "Most popular")}
      {card(false, body("5+ items", "20% OFF", "Best value", money(8), money(10)))}
    </div>
  );
}
