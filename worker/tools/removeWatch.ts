// The `remove_watch` tool: take one game off the watchlist.

import { tool } from "ai";
import { z } from "zod";
import type { WatchStore } from "../state";
import { isEmptyRef, resolveWatch } from "./gameRefs";

export interface RemoveWatchToolDeps {
  store: WatchStore;
}

export function removeWatchTool({ store }: RemoveWatchToolDeps) {
  return tool({
    description:
      "Stop watching ONE game. Identify it by title, gameID, or position in the WATCHLIST as list_watches numbers it — not the position in a deals search. If you are unsure which watch the user means, call list_watches first.",
    inputSchema: z.object({
      position: z.coerce
        .number()
        .int()
        .optional()
        .describe(
          "1-based position in the watchlist from list_watches, e.g. 'remove the second one' → 2. This counts watches, not search results."
        ),
      title: z.string().optional().describe("The watched game's title."),
      gameID: z.string().optional().describe("The watch's gameID, if you have it.")
    }),
    execute: async (ref) => {
      if (isEmptyRef(ref)) {
        return { removed: false, reason: "no game given — pass a title or a position" };
      }

      const watches = store.watches();
      if (watches.length === 0) {
        return { removed: false, reason: "nothing is being watched" };
      }

      const watch = resolveWatch(watches, ref);
      if (watch == null) {
        return {
          removed: false,
          reason:
            ref.position != null
              ? `position ${ref.position} is outside the ${watches.length} watched games`
              : "no watched game matches that — call list_watches to see what is there",
          totalWatches: watches.length
        };
      }

      const remaining = watches.filter((entry) => entry.gameID !== watch.gameID);
      store.saveWatches(remaining);
      return { removed: true, watch, totalWatches: remaining.length };
    }
  });
}
