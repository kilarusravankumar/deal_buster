// Turning a loose game reference from the model into a specific game.
//
// The chat history is pruned between turns (see the `pruneMessages` call in
// ../server.ts), so the model cannot resolve "the second one" by re-reading the
// transcript — the only durable record of what the user was shown is
// `lastShownDeals` in agent state. These helpers are what the watch tools use to
// read it, and they are kept out of the tool modules so they can be tested
// without standing up the Durable Object.

import type { ShownDeal, Watch } from "../state";

/** A reference the model may pass in place of an exact id. */
export interface GameRef {
  gameID?: string;
  steamAppID?: string;
  title?: string;
  /** 1-based, as a person counts — never 0-based. */
  position?: number;
}

function normalize(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Index for a 1-based position, or null when it falls outside `length`.
 *
 * Off-by-one here would silently watch the wrong game, so an out-of-range
 * position is refused rather than clamped.
 */
export function positionIndex(position: number, length: number): number | null {
  if (!Number.isInteger(position) || position < 1 || position > length) return null;
  return position - 1;
}

/**
 * The first entry matching a title, exact-normalized first and only then by
 * substring. Without the two passes, "Hades" in a list holding both "Hades" and
 * "Hades II" would resolve to whichever happened to come first.
 */
export function findByTitle<T extends { title: string }>(
  entries: T[],
  title: string
): T | undefined {
  const wanted = normalize(title);
  if (wanted === "") return undefined;
  return (
    entries.find((entry) => normalize(entry.title) === wanted) ??
    entries.find(
      (entry) => normalize(entry.title).includes(wanted) || wanted.includes(normalize(entry.title))
    )
  );
}

/** The deal a reference names, from the last list the user was shown. */
export function resolveShownDeal(
  deals: ShownDeal[],
  ref: GameRef
): ShownDeal | undefined {
  if (ref.position != null) {
    const index = positionIndex(ref.position, deals.length);
    return index == null ? undefined : deals[index];
  }
  if (ref.gameID) {
    const hit = deals.find((deal) => deal.gameID === ref.gameID);
    if (hit) return hit;
  }
  if (ref.steamAppID) {
    const hit = deals.find((deal) => deal.steamAppID === ref.steamAppID);
    if (hit) return hit;
  }
  if (ref.title) return findByTitle(deals, ref.title);
  return undefined;
}

/** The watch a reference names, positional against the watchlist itself. */
export function resolveWatch(watches: Watch[], ref: GameRef): Watch | undefined {
  if (ref.position != null) {
    const index = positionIndex(ref.position, watches.length);
    return index == null ? undefined : watches[index];
  }
  if (ref.gameID) {
    const hit = watches.find((watch) => watch.gameID === ref.gameID);
    if (hit) return hit;
  }
  if (ref.steamAppID) {
    const hit = watches.find((watch) => watch.steamAppID === ref.steamAppID);
    if (hit) return hit;
  }
  if (ref.title) return findByTitle(watches, ref.title);
  return undefined;
}

/** True when the model passed nothing to identify a game with. */
export function isEmptyRef(ref: GameRef): boolean {
  return (
    ref.position == null &&
    !ref.gameID?.trim() &&
    !ref.steamAppID?.trim() &&
    !ref.title?.trim()
  );
}
