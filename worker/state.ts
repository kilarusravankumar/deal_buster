// The shape of everything DealScout remembers.
//
// Separate from server.ts so the tool modules under ./tools can type their
// dependencies against it without importing the agent class they are wired into.

/** A game the user wants watched, with the price that should trigger an alert. */
export interface Watch {
  gameID: string;
  title: string;
  /** Alert when salePrice <= this, in USD. */
  threshold: number;
  steamAppID: string | null;
  addedAt: string;
}

/** A liked/disliked game, kept with its tags so similarity needs no re-fetch. */
export interface Preference {
  gameID: string;
  title: string;
  liked: boolean;
  /** Steam genres + categories, lowercased. */
  tags: string[];
  recordedAt: string;
}

/**
 * Bump whenever the meaning of a cached entry changes, so stale entries are
 * re-fetched instead of being trusted.
 *
 * 1 → original.
 * 2 → Steam locale pinned to cc=us&l=english. Entries written before this were
 *     localized by the Worker's egress IP, so an Italian response cached
 *     `["GDR"]` / "Giocatore singolo" as if they were the tags.
 */
export const GAME_TAGS_VERSION = 2;

/**
 * Steam genres/categories for one appID, cached so repeated similarity questions
 * cost one Steam request per game instead of one per question.
 */
export interface CachedGameTags {
  title: string;
  genres: string[];
  categories: string[];
  cachedAt: string;
  /** {@link GAME_TAGS_VERSION} at write time; absent on pre-versioning entries. */
  version?: number;
}

/**
 * Everything the agent remembers, persisted with `setState()` as one JSON blob.
 * Single-owner app: there is one instance ("deal-scout") and no per-user keys.
 */
export interface DealScoutState {
  watches: Watch[];
  preferences: Preference[];
  /** Keyed by Steam appID. */
  gameTags: Record<string, CachedGameTags>;
  prefs: {
    /** Default ceiling applied when the user does not name a price, in USD. */
    maxPrice: number | null;
    alertsEnabled: boolean;
  };
  lastPriceCheckAt: string | null;
}

export const initialDealScoutState: DealScoutState = {
  watches: [],
  preferences: [],
  gameTags: {},
  prefs: { maxPrice: null, alertsEnabled: true },
  lastPriceCheckAt: null
};

/**
 * A cache-first Steam tag lookup, owned by the agent because it writes state.
 * `./tools/getGameDetails` depends on this contract rather than on the agent.
 */
export type LoadGameTags = (
  candidates: string[]
) => Promise<(CachedGameTags & { cached: boolean; steamAppID: string }) | null>;
