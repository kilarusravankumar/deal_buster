// The shape of everything DealScout remembers.
//
// Separate from server.ts so the tool modules under ./tools can type their
// dependencies against it without importing the agent class they are wired into.

/** A game the user wants watched, with the price that should trigger an alert. */
export interface Watch {
  /** CheapShark's stable game id. The dedupe key: one watch per gameID. */
  gameID: string;
  steamAppID?: string;
  title: string;
  /**
   * Alert when salePrice <= this, in USD. Defaulted to the sale price at the
   * time the watch was added, so a bare "watch this" means "tell me if it drops
   * any further".
   */
  targetPrice: number;
  /** ISO timestamp. */
  addedAt: string;
  /**
   * The price the last alert for this watch quoted. Written by PriceCheckWorkflow
   * so it does not alert twice for the same drop; never set when a watch is
   * created.
   */
  lastNotifiedPrice?: number;
}

/**
 * A deal as it was last shown to the user, trimmed to what a positional
 * reference needs. History is pruned between turns, so "watch the second one"
 * can only be resolved from state — this is that state.
 */
export interface ShownDeal {
  gameID: string;
  steamAppID?: string;
  title: string;
  salePrice: number;
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
 * Shape version for the state blob as a whole, bumped whenever a field is added
 * or renamed. `initialState` is only applied to a brand-new instance, so an
 * existing agent keeps whatever shape it was last written with — this is what
 * {@link migrateDealScoutState} keys off.
 *
 * 1 → original (implicit; pre-versioning state has no `version` at all).
 * 2 → watches gained `targetPrice` (was `threshold`) and `lastNotifiedPrice`,
 *     and `lastShownDeals` was added.
 */
export const DEAL_SCOUT_STATE_VERSION = 2;

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
  /** {@link DEAL_SCOUT_STATE_VERSION} at write time; absent on pre-versioning state. */
  version?: number;
  watches: Watch[];
  preferences: Preference[];
  /**
   * The most recent non-empty `search_deals` result, in the order it was shown.
   * Positions in `add_watch` are 1-based indexes into this array.
   */
  lastShownDeals: ShownDeal[];
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
  version: DEAL_SCOUT_STATE_VERSION,
  watches: [],
  preferences: [],
  lastShownDeals: [],
  gameTags: {},
  prefs: { maxPrice: null, alertsEnabled: true },
  lastPriceCheckAt: null
};

/**
 * Bring a persisted state blob up to {@link DEAL_SCOUT_STATE_VERSION}, returning
 * null when it is already current so the caller can skip a pointless write.
 *
 * Deliberately field-by-field rather than a spread over `initialState`: an
 * instance that predates a field has it missing, not null, and a blanket spread
 * would also happily resurrect defaults over real data.
 */
export function migrateDealScoutState(
  state: DealScoutState
): DealScoutState | null {
  if (state.version === DEAL_SCOUT_STATE_VERSION) return null;

  const watches = (state.watches ?? []).map((watch) => {
    // v1 called it `threshold`. It is destructured out by name rather than left
    // to the rest spread, or the dead field would be copied forward forever —
    // the type no longer mentions it, so nothing else would ever notice.
    // `threshold` and `steamAppID` are destructured out by name rather than left
    // to the rest spread: the dead v1 field would otherwise be copied forward
    // forever (the type no longer mentions it, so nothing would notice), and v1
    // wrote `null` for "no Steam entry" where the field is now simply absent.
    const { threshold, steamAppID, ...rest } = watch as Watch & {
      threshold?: number;
      steamAppID?: string | null;
    };
    return {
      ...rest,
      targetPrice: rest.targetPrice ?? threshold ?? 0,
      ...(steamAppID ? { steamAppID } : {})
    };
  });

  return {
    ...state,
    version: DEAL_SCOUT_STATE_VERSION,
    watches,
    preferences: state.preferences ?? [],
    lastShownDeals: state.lastShownDeals ?? [],
    gameTags: state.gameTags ?? {}
  };
}

/**
 * A cache-first Steam tag lookup, owned by the agent because it writes state.
 * `./tools/getGameDetails` depends on this contract rather than on the agent.
 */
export type LoadGameTags = (
  candidates: string[]
) => Promise<(CachedGameTags & { cached: boolean; steamAppID: string }) | null>;

/**
 * The slice of agent state the watch tools read and write. They depend on this
 * contract rather than on the agent class, the same way `./tools/getGameDetails`
 * depends on {@link LoadGameTags}.
 */
export interface WatchStore {
  /** The watchlist, in the order `list_watches` reports it. */
  watches(): Watch[];
  saveWatches(next: Watch[]): void;
  /**
   * The most recent non-empty `search_deals` result. `add_watch` positions are
   * 1-based indexes into this.
   */
  lastShownDeals(): ShownDeal[];
}

/**
 * Written by `search_deals` after a successful, non-empty search, so the next
 * turn can still resolve "the second one" once the transcript has been pruned.
 */
export type RecordShownDeals = (deals: ShownDeal[]) => void;
