// The `list_watches` tool: what is currently being watched.
//
// The model must answer "what am I watching?" from here rather than from the
// transcript — tool results are pruned out of history between turns, so an
// answer read off the conversation would be describing a list it can no longer
// see.

import { tool } from "ai";
import { z } from "zod";
import type { WatchStore } from "../state";

export interface ListWatchesToolDeps {
  store: WatchStore;
}

export function listWatchesTool({ store }: ListWatchesToolDeps) {
  return tool({
    description:
      "List every game currently being watched, with its target price. Call this whenever the user asks what they are watching — never answer that from memory. The positions in this list are what remove_watch counts.",
    inputSchema: z.object({}),
    execute: async () => {
      const watches = store.watches();
      return {
        count: watches.length,
        // Numbered so the model can offer, and the user can use, "remove the
        // second one" without either side having to count.
        watches: watches.map((watch, index) => ({
          position: index + 1,
          title: watch.title,
          targetPrice: watch.targetPrice,
          addedAt: watch.addedAt,
          gameID: watch.gameID,
          ...(watch.steamAppID ? { steamAppID: watch.steamAppID } : {})
        }))
      };
    }
  });
}
