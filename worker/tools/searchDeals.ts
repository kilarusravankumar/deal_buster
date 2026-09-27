// The `search_deals` tool: the model's only route to CheapShark.
//
// This module owns the tool contract — what the model is allowed to ask for and
// how a result is phrased back to it. The HTTP call and the semantic → CheapShark
// parameter mapping stay in ../../src/api/cheapshark, which the TUI shares.

import { tool } from "ai";
import { z } from "zod";
import { searchDeals } from "../../src/api/cheapshark";
import { SORT_OPTIONS } from "../../src/types/sort";
import type { RecordShownDeals } from "../state";

export interface SearchDealsToolDeps {
  /** `prefs.maxPrice` from agent state: the ceiling to apply when none is named. */
  defaultMaxPrice: number | null;
  /**
   * Snapshots the result into agent state so a later turn can resolve "watch the
   * second one" — chat history, tool results included, is pruned between turns.
   */
  recordShownDeals: RecordShownDeals;
}

/**
 * Descriptions carry an example trigger phrase each, because this schema is read
 * by Llama 3.3 — a small model picks filters far more reliably from "'under $20'
 * → 20" than from a bare type.
 */
export function searchDealsTool({
  defaultMaxPrice,
  recordShownDeals
}: SearchDealsToolDeps) {
  return tool({
    description:
      "Search current Steam deals on CheapShark. Use for 'what's on sale', for a named game's current price, or when the user gives a budget.",
    inputSchema: z.object({
      title: z
        .string()
        .optional()
        .describe("Game title or partial title. Omit to browse all deals."),
      exact: z
        .boolean()
        .optional()
        .describe(
          "Match the title exactly instead of partially, e.g. 'the game called Hades, not Hades II'. Needs a title."
        ),
      minPrice: z.coerce
        .number()
        .optional()
        .describe("Lowest sale price in USD, e.g. 'between $10 and $20' → 10."),
      maxPrice: z.coerce
        .number()
        .optional()
        .describe("Highest sale price in USD, e.g. 'under $20' → 20."),
      minMetacritic: z.coerce
        .number()
        .optional()
        .describe(
          "Metacritic score floor, 0-100, e.g. 'well-reviewed' or 'critically acclaimed' → 80."
        ),
      minSteamRating: z.coerce
        .number()
        .optional()
        .describe(
          "Steam positive-review percentage floor, 0-100, e.g. 'highly rated by players' → 85."
        ),
      minReviewCount: z.coerce
        .number()
        .int()
        .optional()
        .describe(
          "Steam review-count floor, e.g. 'popular' or 'not an obscure game' → 1000."
        ),
      newWithinHours: z.coerce
        .number()
        .int()
        .optional()
        .describe(
          "Only deals whose price changed within this many hours, e.g. 'new deals today' → 24."
        ),
      onSale: z
        .boolean()
        .optional()
        .describe(
          "Restrict to games discounted right now. Defaults to true; pass false to include full-price games."
        ),
      aaaOnly: z
        .boolean()
        .optional()
        .describe(
          "Only big-budget games (retail over $29), e.g. 'AAA games' or 'big titles' → true."
        ),
      steamAppID: z
        .string()
        .optional()
        .describe(
          "Look up one specific game by its Steam appID. Only works for the appID CheapShark itself lists; if it returns nothing, search by title instead."
        ),
      // Same orderings the TUI's sort bar offers.
      sortBy: z
        .enum(SORT_OPTIONS)
        .optional()
        .describe(
          `Result ordering: Price for 'cheapest', Savings for 'biggest discount', Recent for 'newest deals', Metacritic or Reviews for quality. Defaults to DealRating. Well reviewed game then pass .
              DealRating, Title, Savings, Price, Metacritic, Reviews, ReviewCount, Release, Store, Recent`

        ),
      sortDescending: z
        .boolean()
        .optional()
        .describe(
          "Reverse the ordering to highest-first, e.g. 'most expensive' or 'best rated first' → true. or parctically steals then sort by savings or highest savings then sortBy savings"
        ),
      limit: z.coerce
        .number()
        .int()
        .optional()
        .describe("How many deals to return (1-20, default 8).")
    }),
    execute: async (filters) => {
      // Fall back to the stored ceiling when the user did not name one.
      const ceiling = filters.maxPrice ?? defaultMaxPrice ?? undefined;
      try {
        const deals = await searchDeals({ ...filters, maxPrice: ceiling });
        // `/deals?steamAppID=` matches CheapShark's own steamAppID, which is
        // sometimes stale — for The Witcher 3 it is 124923 while the real Steam
        // app is 292030, the id search_deals and get_game_details both report.
        // Feeding the real one back finds nothing, so say why rather than
        // implying the game has no deal.
        if (deals.length === 0 && filters.steamAppID) {
          return {
            count: 0,
            deals,
            note: `no deal indexed under steamAppID ${filters.steamAppID} — CheapShark indexes its own appID, which can differ from Steam's. Search by title instead.`
          };
        }
        // Only a non-empty result replaces the snapshot. A follow-up search that
        // finds nothing must not erase the list the user is actually looking at,
        // or "watch the second one" would break right after a fruitless query.
        if (deals.length > 0) {
          recordShownDeals(
            deals.map((deal) => ({
              gameID: deal.gameID,
              title: deal.title,
              salePrice: deal.salePrice,
              ...(deal.steamAppID ? { steamAppID: deal.steamAppID } : {})
            }))
          );
        }
        return { count: deals.length, deals };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : "CheapShark request failed"
        };
      }
    }
  });
}
