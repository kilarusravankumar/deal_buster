// The `add_watch` tool: put one game on the watchlist, with the price that
// should trigger an alert.
//
// Deliberately one game per call. Llama 3.3 on Workers AI rejects a turn that
// emits two tool calls at once, so "watch the first two" has to become two
// sequential calls across steps — an array input would just move that failure
// into a place the model cannot recover from.

import { tool } from "ai";
import { z } from "zod";
import { searchDeals } from "../../src/api/cheapshark";
import type { ShownDeal, Watch, WatchStore } from "../state";
import { isEmptyRef, resolveShownDeal, type GameRef } from "./gameRefs";

export interface AddWatchToolDeps {
  store: WatchStore;
}

/**
 * A game the reference names, looked up live when it is not in the last shown
 * list. CheapShark has no "get by gameID" endpoint we use, so a gameID alone
 * that is not in `lastShownDeals` cannot be resolved — the model is told to
 * search first rather than being handed a guess.
 */
async function lookupDeal(ref: GameRef): Promise<ShownDeal | null> {
  const query = ref.steamAppID?.trim()
    ? { steamAppID: ref.steamAppID.trim(), limit: 1 }
    : ref.title?.trim()
      ? { title: ref.title.trim(), limit: 1 }
      : null;
  if (query == null) return null;

  const [deal] = await searchDeals(query);
  if (deal == null) return null;
  return {
    gameID: deal.gameID,
    title: deal.title,
    salePrice: deal.salePrice,
    ...(deal.steamAppID ? { steamAppID: deal.steamAppID } : {})
  };
}

export function addWatchTool({ store }: AddWatchToolDeps) {
  return tool({
    description:
      "Watch ONE game and alert when its price drops. Identify the game by position (from the deals you last showed), title, steamAppID or gameID — whichever the user actually gave you. To watch several games, call this once per game, one call per step.",
    inputSchema: z.object({
      position: z.coerce
        .number()
        .int()
        .optional()
        .describe(
          "1-based position in the deals you last showed, e.g. 'watch the second one' → 2. Use this for 'that one', 'the first', 'the last one'."
        ),
      title: z.string().optional().describe("The game's title, if the user named it."),
      steamAppID: z
        .string()
        .optional()
        .describe("steamAppID from a search_deals result, if you have one."),
      gameID: z
        .string()
        .optional()
        .describe("gameID from a search_deals result, if you have one."),
      targetPrice: z.coerce
        .number()
        .optional()
        .describe(
          "Alert when the price falls to this or below, in USD, e.g. 'tell me when it hits $10' → 10. OMIT it unless the user named a price: it then defaults to the current sale price, which means 'alert me on any further drop'."
        )
    }),
    execute: async (ref) => {
      if (isEmptyRef(ref)) {
        return {
          added: false,
          reason:
            "no game given — pass a position from the deals you last showed, or a title"
        };
      }

      const shown = store.lastShownDeals();
      let deal = resolveShownDeal(shown, ref);

      if (deal == null && ref.position != null) {
        // A position can only ever mean the shown list, so falling back to a
        // live search here would silently watch some unrelated game.
        return {
          added: false,
          reason:
            shown.length === 0
              ? "nothing has been shown yet, so there is no position to count — call search_deals first"
              : `position ${ref.position} is outside the ${shown.length} deals last shown`
        };
      }

      if (deal == null) {
        try {
          deal = (await lookupDeal(ref)) ?? undefined;
        } catch (error) {
          return {
            added: false,
            reason: error instanceof Error ? error.message : "CheapShark request failed"
          };
        }
      }

      if (deal == null) {
        return {
          added: false,
          reason:
            "could not identify that game — call search_deals for it first, then watch it by position"
        };
      }

      // A bare "watch this" means "tell me if it drops any further", so the
      // ceiling is the price it is on sale at right now.
      const targetPrice = ref.targetPrice ?? deal.salePrice;
      const watch: Watch = {
        gameID: deal.gameID,
        title: deal.title,
        targetPrice,
        addedAt: new Date().toISOString(),
        ...(deal.steamAppID ? { steamAppID: deal.steamAppID } : {})
      };

      // gameID is the dedupe key: watching the same game twice updates the
      // target price in place rather than growing the list. The model does
      // sometimes repeat a call within one turn, so this is load-bearing.
      const watches = store.watches();
      const existing = watches.findIndex((entry) => entry.gameID === watch.gameID);
      const updated = existing >= 0;

      // Whatever ends up in state is also what gets reported, so the model is
      // never told about a watch that differs from the one stored.
      let stored = watch;
      let next: Watch[];
      if (updated) {
        // `addedAt` is when the user first asked for this game, so it is kept.
        // `lastNotifiedPrice` is dropped: it described the old target price.
        stored = { ...watch, addedAt: watches[existing]!.addedAt };
        next = watches.map((entry, index) => (index === existing ? stored : entry));
      } else {
        next = [...watches, watch];
      }
      store.saveWatches(next);

      return {
        added: true,
        updated,
        watch: stored,
        defaultedTargetPrice: ref.targetPrice == null,
        totalWatches: next.length
      };
    }
  });
}
