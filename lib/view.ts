// The view state module: a blog view's URL plus the viewer's timezone in, the view out, and a view
// back to its URL. Pure, so the same URL always means the same view.
import { parseUsername } from "./username";

export type Filter = { mode: "in" | "before" | "after"; year: number; month?: number };
export type Sort = "newest" | "oldest";
// The half-open interval [from, to) of Unix seconds a filter selects. Either end may be open.
export type Window = { from?: number; to?: number };
export type View = { username: string; filter?: Filter; sort: Sort; window: Window };

const MODES = ["in", "before", "after"] as const;

// `url` is a path and query, like "/someblog?in=2012-03&sort=oldest". Null if the username is invalid.
export function parseView(url: string, timeZone: string): View | null {
  const { pathname, searchParams } = new URL(url, "http://localhost");
  const username = parseUsername(pathname.split("/")[1]);
  if (!username) return null;
  const filter = parseFilter(searchParams);
  return {
    username,
    filter,
    sort: searchParams.get("sort") === "oldest" ? "oldest" : "newest",
    window: filter ? filterWindow(filter, timeZone) : {},
  };
}

// More than one filter parameter, or a malformed value, means no filter.
function parseFilter(searchParams: URLSearchParams): Filter | undefined {
  const params = [...searchParams].filter(([key]) => (MODES as readonly string[]).includes(key));
  const match = params.length === 1 && /^(\d{4})(?:-(0[1-9]|1[0-2]))?$/.exec(params[0][1]);
  if (!match) return undefined;
  const filter: Filter = { mode: params[0][0] as Filter["mode"], year: Number(match[1]) };
  if (match[2]) filter.month = Number(match[2]);
  return filter;
}

// "Before" and "after" exclude the named period: before March 2012 ends where March starts, and
// after March 2012 starts where March ends.
function filterWindow({ mode, year, month }: Filter, timeZone: string): Window {
  const start = localMidnight(year, month ?? 1, timeZone);
  const end = month ? localMidnight(year, month + 1, timeZone) : localMidnight(year + 1, 1, timeZone);
  if (mode === "in") return { from: start, to: end };
  return mode === "before" ? { to: start } : { from: end };
}

// Unix seconds at local midnight starting the 1st of `month` (1-based; 13 is next January).
function localMidnight(year: number, month: number, timeZone: string) {
  const asUtc = Date.UTC(year, month - 1, 1);
  // The zone's offset at a guess, then at the answer that guess gives, in case they straddle a
  // daylight-saving change.
  const guess = asUtc - utcOffset(asUtc, timeZone);
  return (asUtc - utcOffset(guess, timeZone)) / 1000;
}

// How far `timeZone`'s wall clock is ahead of UTC at instant `ms`, in milliseconds.
function utcOffset(ms: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(ms);
  const part = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second")) - ms;
}

// The default sort, newest first, is left out of the URL.
export function viewUrl({ username, filter, sort }: Omit<View, "window">) {
  const params = new URLSearchParams();
  if (filter) {
    params.set(filter.mode, filter.month ? `${filter.year}-${String(filter.month).padStart(2, "0")}` : `${filter.year}`);
  }
  if (sort === "oldest") params.set("sort", sort);
  return params.size ? `/${username}?${params}` : `/${username}`;
}
