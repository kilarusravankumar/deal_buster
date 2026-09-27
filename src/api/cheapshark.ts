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

export interface SearchDealsInput {
  title?: string;
  maxPrice?: number;
  sortBy?: SortType;
  limit?: number;
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
export async function searchDeals({
  title,
  maxPrice,
  sortBy = "DealRating",
  limit = 8
}: SearchDealsInput): Promise<Deal[]> {
  const pageSize = Math.min(Math.max(limit, 1), 20);

  const query: Record<string, string> = {
    storeID: STEAM_STORE_ID,
    onSale: "1",
    sortBy,
    pageSize: String(pageSize)
  };
  if (title?.trim()) query.title = title.trim();
  if (maxPrice != null) query.upperPrice = String(maxPrice);

  const response = await request("/deals", query);
  const raw = (await response.json()) as Game[];

  return raw.slice(0, pageSize).map((deal) => ({
    gameID: deal.gameID,
    dealID: deal.dealID,
    title: deal.title,
    salePrice: Number(deal.salePrice),
    normalPrice: Number(deal.normalPrice),
    savingsPercent: Math.round(Number(deal.savings)),
    steamAppID: deal.steamAppID || null,
    steamRatingPercent: positiveNumber(deal.steamRatingPercent),
    metacriticScore: positiveNumber(deal.metacriticScore),
    thumb: deal.thumb
  }));
}
