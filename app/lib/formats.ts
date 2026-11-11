// Date and currency display formats chosen on the Settings page. Kept free of
// server imports. extensions/volume-tiers/assets/volume-tiers.js has a copy of
// the money formatting for the storefront.

export type DateFormat = "d MMM yyyy" | "dd/MM/yyyy" | "MM/dd/yyyy" | "yyyy-MM-dd" | "MMM d, yyyy";
export type CurrencyFormat = "store" | "symbol" | "symbol_code" | "code" | "symbol_after";

export const DATE_FORMATS: { value: DateFormat; label: string }[] = [
  { value: "d MMM yyyy", label: "11 Nov 2026" },
  { value: "dd/MM/yyyy", label: "11/11/2026 (day first)" },
  { value: "MM/dd/yyyy", label: "11/30/2026 (month first)" },
  { value: "yyyy-MM-dd", label: "2026-11-11" },
  { value: "MMM d, yyyy", label: "Nov 11, 2026" },
];

export const CURRENCY_FORMATS: { value: CurrencyFormat; label: string }[] = [
  { value: "store", label: "Same as my Shopify store" },
  { value: "symbol", label: "£1,234.56" },
  { value: "symbol_code", label: "£1,234.56 GBP" },
  { value: "code", label: "GBP 1,234.56" },
  { value: "symbol_after", label: "1.234,56 £" },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

export function formatDate(date: Date | string, format: DateFormat = "d MMM yyyy"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  const day = d.getDate();
  const month = d.getMonth();
  const year = d.getFullYear();
  switch (format) {
    case "dd/MM/yyyy":
      return `${pad(day)}/${pad(month + 1)}/${year}`;
    case "MM/dd/yyyy":
      return `${pad(month + 1)}/${pad(day)}/${year}`;
    case "yyyy-MM-dd":
      return `${year}-${pad(month + 1)}-${pad(day)}`;
    case "MMM d, yyyy":
      return `${MONTHS[month]} ${day}, ${year}`;
    default:
      return `${day} ${MONTHS[month]} ${year}`;
  }
}

/** "£" for GBP, "$" for USD, "€" for EUR; falls back to the code. */
export function currencySymbol(currency: string): string {
  try {
    const part = new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    })
      .formatToParts(0)
      .find((p) => p.type === "currency");
    return part?.value ?? currency;
  } catch {
    return currency;
  }
}

function groupDigits(amount: number, decimals: number, thousands: string, decimal: string) {
  const [whole, frac] = Math.abs(amount).toFixed(decimals).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, thousands);
  return (amount < 0 ? "-" : "") + grouped + (frac ? decimal + frac : "");
}

/** Formats an amount in major units (e.g. 12.5 = £12.50). */
export function formatMoney(
  amount: number,
  currency: string,
  format: CurrencyFormat = "store",
  hideDecimals = false,
): string {
  const decimals = hideDecimals ? 0 : 2;
  const symbol = currencySymbol(currency);
  switch (format) {
    case "symbol_code":
      return `${symbol}${groupDigits(amount, decimals, ",", ".")} ${currency}`;
    case "code":
      return `${currency} ${groupDigits(amount, decimals, ",", ".")}`;
    case "symbol_after":
      return `${groupDigits(amount, decimals, ".", ",")} ${symbol}`;
    case "symbol":
      return `${symbol}${groupDigits(amount, decimals, ",", ".")}`;
    default:
      // The store's own format isn't known in the admin; show the usual one.
      return `${symbol}${groupDigits(amount, decimals, ",", ".")}`;
  }
}
