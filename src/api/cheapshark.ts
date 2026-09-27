// CheapShark client shared by the TUI and the Worker agent.
//
// Deliberately `fetch`-only (no axios): the same module has to compile and run
// under Bun for the TUI and under workerd for the agent tools.

import type { Game } from "../types/game";
import type { SearchGame } from "../types/searchGame";
import type { QueryParams } from "../types/params";
import type { SortType } from "../types/sort";

// Deal Buster is Steam-only. This is the single place the store is decided —
// no caller, and no LLM tool call, gets to pick a different one.
export const STEAM_STORE_ID = "1";

const BASE_URL = "https://www.cheapshark.com/api/1.0";
const USER_AGENT = "deal_busters/0.1";

// CheapShark clamps the title search at 60 results. The deals-page cap lives in
// ../types/params as MAX_PAGE_SIZE, which the TUI already uses.
export const MAX_SEARCH_LIMIT = 60;

async function request(
  path: string,
  params: Record<string, string>,
  signal?: AbortSignal
): Promise<Response> {
  const response = await fetch(`${BASE_URL}${path}?${new URLSearchParams(params)}`, {
    headers: { "User-Agent": USER_AGENT },
    signal
  });
  if (!response.ok) {
    throw new Error(
      `CheapShark ${path} failed: ${response.status} ${response.statusText}`
    );
  }
  return response;
}

export interface DealsResponse {
  data: Game[];
  totalPageCount: number;
}

/** Full deal rows for the TUI grid. Pages are 0-indexed, as CheapShark expects. */
export async function getDeals(
  params: QueryParams,
  signal?: AbortSignal
): Promise<DealsResponse> {
  const query: Record<string, string> = {
    storeID: STEAM_STORE_ID,
    onSale: "1",
    sortBy: params.sortBy,
    pageNumber: String(params.pageNumber),
    pageSize: String(params.pageSize)
  };
  if (params.onlyAAA) query.AAA = "1";

  const response = await request("/deals", query, signal);
  const data = (await response.json()) as Game[];
  const total = Number(response.headers.get("x-total-page-count"));
  return {
    data,
    totalPageCount: Number.isFinite(total) && total > 0 ? total : 1
  };
}

export interface SearchOptions {
  title: string;
  limit?: number;
  exact?: boolean;
  signal?: AbortSignal;
}

/** Title search. A different shape from /deals: no sale price, steamAppID often null. */
export async function getGames({
  title,
  limit = MAX_SEARCH_LIMIT,
  exact = false,
  signal
}: SearchOptions): Promise<SearchGame[]> {
  const response = await request(
    "/games",
    { title, limit: String(limit), exact: exact ? "1" : "0" },
    signal
  );
  return (await response.json()) as SearchGame[];
}

/** A deal trimmed to what the model needs to reason and the TUI needs to render. */
export interface Deal {
  gameID: string;
  dealID: string;
  title: string;
  salePrice: number;
  normalPrice: number;
  savingsPercent: number;
  steamAppID: string | null;
  steamRatingPercent: number | null;
  metacriticScore: number | null;
  thumb: string;
}

// Steam asset paths carry the appID of the item the asset belongs to, e.g.
// .../store_item_assets/steam/apps/292030/<hash>/capsule_231x87.jpg. The hash
// segment is optional, and older CheapShark rows use .../steam/apps/<id>/...
// on a different host, so only the `/steam/apps/<digits>/` part is required.
// `/steam/subs/<digits>/` thumbs must NOT match: that id is a Steam package,
// not an app, and Steam's appdetails knows nothing about it.
const THUMB_APP_ID = /\/steam\/apps\/(\d+)\//;

/** The Steam appID embedded in a CheapShark thumb URL, or null if there is none. */
export function steamAppIDFromThumb(thumb: string | null | undefined): string | null {
  if (!thumb) return null;
  return thumb.match(THUMB_APP_ID)?.[1] ?? null;
}

/**
 * Steam appIDs for a deal, best first.
 *
 * CheapShark's own `steamAppID` is sometimes stale: The Witcher 3: Wild Hunt -
 * Complete Edition reports 124923, which Steam has no app for, while the same
 * row's thumb points at /steam/apps/292030/ — the real app. The thumb is a path
 * into Steam's asset store for that exact item, so it wins; the field is only a
 * fallback (it is the only candidate for rows whose thumb is hosted elsewhere).
 */
export function steamAppIDCandidates(deal: {
  steamAppID?: string | null;
  thumb?: string | null;
}): string[] {
  const candidates = [steamAppIDFromThumb(deal.thumb), deal.steamAppID?.trim() || null];
  return [...new Set(candidates.filter((id): id is string => id != null && /^\d+$/.test(id)))];
}

/**
 * Semantic filters for {@link searchDeals}. These names are what the agent tool
 * exposes; CheapShark's wire names live only in {@link toDealsQuery}.
 */
export interface SearchDealsInput {
  title?: string;
  /** Lowest acceptable sale price, USD. */
  minPrice?: number;
  /** Highest acceptable sale price, USD. */
  maxPrice?: number;
  /** Metacritic floor, 0-100. */
  minMetacritic?: number;
  /** Steam positive-review percentage floor, 0-100. */
  minSteamRating?: number;
  /** Steam review-count floor. */
  minReviewCount?: number;
  /** Only deals whose price last changed within this many hours. */
  newWithinHours?: number;
  /** Restrict to games currently discounted. Defaults to true. */
  onSale?: boolean;
  /** Only games whose retail price is over $29. */
  aaaOnly?: boolean;
  /** Exact title match instead of partial. Ignored without a title. */
  exact?: boolean;
  /** CheapShark's steamAppID — see the caveat in {@link toDealsQuery}. */
  steamAppID?: string;
  sortBy?: SortType;
  /** Reverse the ordering (highest first). */
  sortDescending?: boolean;
  limit?: number;
}

/** Agent results stay small — every row costs the model tokens. */
const MAX_AGENT_RESULTS = 20;

// CheapShark treats upperPrice=50 as "no maximum" rather than "at most $50":
// `upperPrice=50` returns the same $63.99 top result as sending no ceiling at
// all, while 49.99 caps at $48.99 and 60 behaves normally. Only 50 is special,
// so a real "under $50" is sent as 49.99 — every store price ends in .99 or .49,
// so nothing is actually excluded.
const UNLIMITED_UPPER_PRICE = 50;
const JUST_UNDER_UNLIMITED = "49.99";

function clamp(value: number, low: number, high: number): number {
  if (!Number.isFinite(value)) return low;
  return Math.min(Math.max(value, low), high);
}

function clampInt(value: number, low: number, high: number): string {
  return String(Math.round(clamp(value, low, high)));
}

/**
 * Semantic filters → CheapShark's `/deals` query parameters.
 *
 * The one place wire names appear, so the agent tool's schema (and the TUI) never
 * has to know them. Out-of-range values are clamped to the nearest valid bound
 * rather than rejected: this runs on LLM-supplied input, and a clamped search is
 * more useful than an error the model has to recover from.
 */
export function toDealsQuery(input: SearchDealsInput): Record<string, string> {
  const {
    title,
    minPrice,
    maxPrice,
    minMetacritic,
    minSteamRating,
    minReviewCount,
    newWithinHours,
    onSale = true,
    aaaOnly,
    exact,
    steamAppID,
    sortBy = "DealRating",
    sortDescending,
    limit = 8
  } = input;

  const query: Record<string, string> = {
    storeID: STEAM_STORE_ID,
    onSale: onSale ? "1" : "0",
    sortBy,
    pageSize: clampInt(limit, 1, MAX_AGENT_RESULTS)
  };

  const trimmedTitle = title?.trim();
  if (trimmedTitle) {
    query.title = trimmedTitle;
    // `exact` only means anything alongside a title, so it is dropped otherwise.
    if (exact) query.exact = "1";
  }

  // Clamped before minPrice so the floor can be compared against the real ceiling.
  let ceiling: number | null = null;
  if (maxPrice != null) {
    ceiling = Math.max(clamp(maxPrice, 0, Number.MAX_SAFE_INTEGER), 0);
    query.upperPrice =
      ceiling === UNLIMITED_UPPER_PRICE ? JUST_UNDER_UNLIMITED : String(ceiling);
  }
  if (minPrice != null) {
    // A floor above the ceiling would return nothing, so it is pulled down to it.
    const floor = clamp(minPrice, 0, ceiling ?? Number.MAX_SAFE_INTEGER);
    query.lowerPrice = String(floor);
  }

  if (minMetacritic != null) query.metacritic = clampInt(minMetacritic, 0, 100);
  if (minSteamRating != null) query.steamRating = clampInt(minSteamRating, 0, 100);
  if (minReviewCount != null) {
    query.minimumReviewCount = clampInt(minReviewCount, 0, Number.MAX_SAFE_INTEGER);
  }
  // CheapShark's maxAge is in hours; 2500 (~104 days) is its documented ceiling.
  if (newWithinHours != null) query.maxAge = clampInt(newWithinHours, 1, 2500);
  if (aaaOnly) query.AAA = "1";
  if (sortDescending) query.desc = "1";
  if (steamAppID?.trim()) query.steamAppID = steamAppID.trim();

  return query;
}

// CheapShark reports "0" for an unknown score or rating.
function positiveNumber(value: string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Agent-facing deal search. Same endpoint as {@link getDeals}, but title- and
 * price-filtered and trimmed — every row returned costs the model tokens.
 */
export async function searchDeals(input: SearchDealsInput): Promise<Deal[]> {
  const query = toDealsQuery(input);
  const pageSize = Number(query.pageSize);

  const response = await request("/deals", query);
  const raw = (await response.json()) as Game[];

  return raw.slice(0, pageSize).map((deal) => ({
    gameID: deal.gameID,
    dealID: deal.dealID,
    title: deal.title,
    salePrice: Number(deal.salePrice),
    normalPrice: Number(deal.normalPrice),
    savingsPercent: Math.round(Number(deal.savings)),
    // Resolved here rather than at each caller, so both the TUI and the model
    // are handed an appID Steam will actually answer for.
    steamAppID: steamAppIDCandidates(deal)[0] ?? null,
    steamRatingPercent: positiveNumber(deal.steamRatingPercent),
    metacriticScore: positiveNumber(deal.metacriticScore),
    thumb: deal.thumb
  }));
}
