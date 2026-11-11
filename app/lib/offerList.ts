// Filtering, sorting and paging for the Offers list. Kept free of server
// imports so it can be unit-tested.
import { parseConfig } from "./offers";
import { formatDate, type DateFormat } from "./formats";

export type DisplayStatus = "active" | "scheduled" | "expired" | "paused";
export type StatusTab = "all" | DisplayStatus;
export type SortKey = "updated" | "name" | "status";
export type SortDir = "asc" | "desc";

export const PAGE_SIZE = 10;

export const STATUS_TABS: { value: StatusTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "scheduled", label: "Scheduled" },
  { value: "paused", label: "Paused" },
  { value: "expired", label: "Expired" },
];

export interface OfferRow {
  id: number;
  title: string;
  status: string; // ACTIVE | DRAFT, as stored
  config: string;
  updatedAt: Date;
  discountId?: string | null;
}

/** What the merchant sees: paused, or active/scheduled/expired from the dates. */
export function displayStatus(
  status: string,
  startsAt: string | null,
  endsAt: string | null,
  now = new Date(),
): DisplayStatus {
  if (status !== "ACTIVE") return "paused";
  const iso = now.toISOString();
  if (endsAt && endsAt <= iso) return "expired";
  if (startsAt && startsAt > iso) return "scheduled";
  return "active";
}

const STATUS_ORDER: Record<DisplayStatus, number> = {
  active: 0,
  scheduled: 1,
  paused: 2,
  expired: 3,
};

export function parseListParams(search: URLSearchParams) {
  const tab = STATUS_TABS.some((t) => t.value === search.get("status"))
    ? (search.get("status") as StatusTab)
    : "all";
  const sort: SortKey = (["updated", "name", "status"] as const).includes(
    search.get("sort") as SortKey,
  )
    ? (search.get("sort") as SortKey)
    : "updated";
  const dir: SortDir =
    search.get("dir") === "asc" || search.get("dir") === "desc"
      ? (search.get("dir") as SortDir)
      : sort === "name"
        ? "asc"
        : "desc";
  const q = (search.get("q") ?? "").trim();
  const page = Math.max(1, Math.floor(Number(search.get("page")) || 1));
  return { tab, sort, dir, q, page };
}

export function buildOfferList(
  offers: OfferRow[],
  params: ReturnType<typeof parseListParams>,
  now = new Date(),
) {
  const rows = offers.map((o) => {
    const config = parseConfig(o.config);
    return {
      ...o,
      config,
      display: displayStatus(o.status, config.startsAt, config.endsAt, now),
    };
  });

  const counts = Object.fromEntries(
    STATUS_TABS.map((t) => [
      t.value,
      t.value === "all" ? rows.length : rows.filter((r) => r.display === t.value).length,
    ]),
  ) as Record<StatusTab, number>;

  const needle = params.q.toLowerCase();
  const filtered = rows.filter(
    (r) =>
      (params.tab === "all" || r.display === params.tab) &&
      (!needle || r.title.toLowerCase().includes(needle)),
  );

  const mult = params.dir === "asc" ? 1 : -1;
  filtered.sort((a, b) => {
    let cmp = 0;
    if (params.sort === "name") cmp = a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
    else if (params.sort === "status") cmp = STATUS_ORDER[a.display] - STATUS_ORDER[b.display];
    if (cmp === 0) cmp = a.updatedAt.getTime() - b.updatedAt.getTime();
    return cmp * mult;
  });

  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(params.page, pages);
  const start = (page - 1) * PAGE_SIZE;
  return {
    rows: filtered.slice(start, start + PAGE_SIZE),
    counts,
    total,
    page,
    pages,
    from: total ? start + 1 : 0,
    to: Math.min(start + PAGE_SIZE, total),
  };
}

/** "13 min ago", "3 h ago", "Yesterday", or a date in the chosen format. */
export function relativeTime(
  date: Date,
  now = new Date(),
  dateFormat: DateFormat = "d MMM yyyy",
): string {
  const s = Math.round((now.getTime() - date.getTime()) / 1000);
  if (s < 60) return "Just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  if (h < 48) return "Yesterday";
  return formatDate(date, dateFormat);
}
