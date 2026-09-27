// Title comparison used by get_game_details to catch a steamAppID that belongs
// to a different game than the one being asked about. Kept in its own module so
// it can be tested without standing up the Durable Object.

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * True when two titles plausibly name the same game. Editions and sequels are
 * treated as a match ("Hades" vs "Hades II"); an unrelated game is not
 * ("UBERMOSH" vs "Hover"). An empty side matches, since we know nothing then.
 */
export function titlesLookAlike(a: string, b: string): boolean {
  const left = normalizeTitle(a);
  const right = normalizeTitle(b);
  if (left === "" || right === "") return true;
  return left === right || left.includes(right) || right.includes(left);
}
