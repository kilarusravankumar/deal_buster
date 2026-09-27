// The `get_game_details` tool: the model's only route to a game's real genres.
//
// This module owns the tool contract and the guards that keep the model from
// claiming an unverified genre. The Steam request lives in ../../src/api/steam,
// and the cache lives with agent state behind the injected `loadGameTags`.

import { tool } from "ai";
import { z } from "zod";
import { steamAppIDCandidates } from "../../src/api/cheapshark";
import type { LoadGameTags } from "../state";
import { titlesLookAlike } from "../titles";

export interface GetGameDetailsToolDeps {
  /** Cache-first Steam lookup, owned by the agent because it writes state. */
  loadGameTags: LoadGameTags;
}

export function getGameDetailsTool({ loadGameTags }: GetGameDetailsToolDeps) {
  return tool({
    description:
      "Look up a game's Steam genres and categories by its steamAppID (from a search_deals result). This is the ONLY way to learn a game's genre — call it before describing any game's genre, and before judging whether two games are similar.",
    inputSchema: z.object({
      steamAppID: z
        .string()
        .nullable()
        .describe(
          "The steamAppID from a search_deals result. Pass null if that deal had none."
        ),
      title: z
        .string()
        .optional()
        .describe("The game's title, used only to phrase the answer."),
      thumb: z
        .string()
        .optional()
        .describe(
          "Optional: the deal's thumb URL, copied verbatim from search_deals. Only helps if the steamAppID turns out to be wrong."
        )
    }),
    execute: async ({ steamAppID, title, thumb }) => {
      // CheapShark's steamAppID is sometimes an id Steam has no app for (see
      // steamAppIDCandidates), so the thumb URL is a second, better candidate
      // when the model passed one along.
      const candidates = steamAppIDCandidates({ steamAppID, thumb });
      // CheapShark carries plenty of deals with no Steam entry at all, and the
      // model sometimes passes "none" or a title instead.
      if (candidates.length === 0) {
        return {
          found: false,
          title: title ?? null,
          reason:
            "no usable steamAppID (missing or not numeric), so this game's genres cannot be verified — get one from a search_deals result"
        };
      }

      try {
        const tags = await loadGameTags(candidates);
        if (tags == null) {
          return {
            found: false,
            steamAppID,
            title: title ?? null,
            reason: "Steam returned no details for this appID"
          };
        }
        // The appID that actually resolved, which is not necessarily the one the
        // model passed.
        const resolvedAppID = tags.steamAppID;
        // The model sometimes supplies an appID from memory instead of from a
        // search_deals result, and Steam then answers about a different game.
        // Say so rather than letting it claim those genres.
        if (title && !titlesLookAlike(title, tags.title)) {
          return {
            found: false,
            steamAppID: resolvedAppID,
            requestedTitle: title,
            steamTitle: tags.title,
            titleMismatch: true,
            reason: `steamAppID ${resolvedAppID} is "${tags.title}", not "${title}" — do not use these genres. Call search_deals for "${title}" and use the steamAppID from that result.`
          };
        }

        return {
          found: true,
          steamAppID: resolvedAppID,
          title: tags.title,
          genres: tags.genres,
          categories: tags.categories,
          // Tells the model (and us, while debugging) that no request was made.
          fromCache: tags.cached
        };
      } catch (error) {
        return {
          found: false,
          steamAppID,
          title: title ?? null,
          reason: error instanceof Error ? error.message : "Steam request failed"
        };
      }
    }
  });
}
