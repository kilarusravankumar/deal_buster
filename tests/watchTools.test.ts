import { test, expect } from "bun:test";
import { addWatchTool } from "../worker/tools/addWatch";
import { listWatchesTool } from "../worker/tools/listWatches";
import { removeWatchTool } from "../worker/tools/removeWatch";
import {
  findByTitle,
  positionIndex,
  resolveShownDeal,
  resolveWatch
} from "../worker/tools/gameRefs";
import { migrateDealScoutState, type ShownDeal, type Watch, type WatchStore } from "../worker/state";

const CALL_CONTEXT = { toolCallId: "test", messages: [] } as never;
const run = async (t: { execute?: unknown }, input: unknown) =>
  // biome-ignore lint: the SDK's execute type is generic over the input schema.
  (await (t.execute as (i: unknown, c: never) => Promise<unknown>)(input, CALL_CONTEXT)) as Record<
    string,
    unknown
  >;

const SHOWN: ShownDeal[] = [
  { gameID: "1", steamAppID: "101", title: "Hades", salePrice: 6.24 },
  { gameID: "2", steamAppID: "102", title: "Hades II", salePrice: 20.99 },
  { gameID: "3", title: "Metro Exodus", salePrice: 2.99 }
];

/** An in-memory stand-in for the agent's setState-backed store. */
function makeStore(shown: ShownDeal[] = SHOWN, initial: Watch[] = []) {
  let watches = initial;
  const store: WatchStore = {
    watches: () => watches,
    saveWatches: (next) => {
      watches = next;
    },
    lastShownDeals: () => shown
  };
  return { store, current: () => watches };
}

// ── reference resolution ──────────────────────────────────────────────

test("positions are 1-based and out-of-range is refused, not clamped", () => {
  expect(positionIndex(1, 3)).toBe(0);
  expect(positionIndex(3, 3)).toBe(2);
  expect(positionIndex(0, 3)).toBeNull();
  expect(positionIndex(4, 3)).toBeNull();
  expect(positionIndex(1.5, 3)).toBeNull();
});

test("an exact title beats a substring match on the same list", () => {
  // "Hades" must not resolve to "Hades II" just because it appears first.
  expect(findByTitle(SHOWN, "Hades")?.gameID).toBe("1");
  expect(findByTitle(SHOWN, "hades ii")?.gameID).toBe("2");
  expect(findByTitle(SHOWN, "metro")?.gameID).toBe("3");
  expect(findByTitle(SHOWN, "Portal")).toBeUndefined();
});

test("a shown deal resolves by position, gameID, steamAppID or title", () => {
  expect(resolveShownDeal(SHOWN, { position: 2 })?.title).toBe("Hades II");
  expect(resolveShownDeal(SHOWN, { gameID: "3" })?.title).toBe("Metro Exodus");
  expect(resolveShownDeal(SHOWN, { steamAppID: "101" })?.title).toBe("Hades");
  expect(resolveShownDeal(SHOWN, { title: "Metro Exodus" })?.gameID).toBe("3");
  expect(resolveShownDeal(SHOWN, { position: 9 })).toBeUndefined();
});

test("remove_watch positions count the watchlist, not the deals list", () => {
  const watches: Watch[] = [
    { gameID: "9", title: "Portal 2", targetPrice: 1.99, addedAt: "2026-01-01T00:00:00.000Z" }
  ];
  // Position 1 in the shown list is Hades; in the watchlist it is Portal 2.
  expect(resolveWatch(watches, { position: 1 })?.title).toBe("Portal 2");
  expect(resolveWatch(watches, { position: 2 })).toBeUndefined();
});

// ── add_watch ─────────────────────────────────────────────────────────

test("add_watch by position stores the game and defaults the target price", async () => {
  const { store, current } = makeStore();
  const result = await run(addWatchTool({ store }), { position: 2 });

  expect(result.added).toBe(true);
  expect(result.defaultedTargetPrice).toBe(true);
  // "watch this" means "alert on any further drop", so the ceiling is today's price.
  expect(result.watch).toMatchObject({
    gameID: "2",
    steamAppID: "102",
    title: "Hades II",
    targetPrice: 20.99
  });
  expect(current()).toHaveLength(1);
  // Reserved for PriceCheckWorkflow; a new watch must never carry one.
  expect(current()[0]).not.toHaveProperty("lastNotifiedPrice");
});

test("add_watch honours an explicit target price", async () => {
  const { store, current } = makeStore();
  const result = await run(addWatchTool({ store }), { position: 1, targetPrice: 3 });
  expect(result.defaultedTargetPrice).toBe(false);
  expect(current()[0]!.targetPrice).toBe(3);
});

test("add_watch dedupes by gameID, updating the target price in place", async () => {
  const { store, current } = makeStore();
  await run(addWatchTool({ store }), { position: 1 });
  const first = current()[0]!;

  const result = await run(addWatchTool({ store }), { title: "Hades", targetPrice: 4 });
  expect(result.updated).toBe(true);
  expect(result.totalWatches).toBe(1);
  expect(current()).toHaveLength(1);
  expect(current()[0]!.targetPrice).toBe(4);
  // The user asked for this game when they first asked, not on the update.
  expect(current()[0]!.addedAt).toBe(first.addedAt);
  // The reported watch has to be the stored one, or the model would quote an
  // addedAt that is nowhere in state.
  expect(result.watch).toEqual(current()[0] as never);
});

test("add_watch refuses a position outside the shown list instead of guessing", async () => {
  const { store, current } = makeStore();
  const result = await run(addWatchTool({ store }), { position: 7 });
  expect(result.added).toBe(false);
  expect(String(result.reason)).toContain("outside the 3 deals");
  expect(current()).toHaveLength(0);
});

test("add_watch says to search first when nothing has been shown", async () => {
  const { store } = makeStore([]);
  const result = await run(addWatchTool({ store }), { position: 1 });
  expect(result.added).toBe(false);
  expect(String(result.reason)).toContain("search_deals");
});

test("add_watch refuses an empty reference", async () => {
  const { store } = makeStore();
  const result = await run(addWatchTool({ store }), {});
  expect(result.added).toBe(false);
});

// ── list_watches / remove_watch ───────────────────────────────────────

test("list_watches numbers the watches it returns", async () => {
  const { store } = makeStore();
  await run(addWatchTool({ store }), { position: 1 });
  await run(addWatchTool({ store }), { position: 3 });

  const result = await run(listWatchesTool({ store }), {});
  expect(result.count).toBe(2);
  expect(result.watches).toMatchObject([
    { position: 1, title: "Hades" },
    { position: 2, title: "Metro Exodus" }
  ]);
});

test("remove_watch removes by watchlist position and reports what went", async () => {
  const { store, current } = makeStore();
  await run(addWatchTool({ store }), { position: 1 });
  await run(addWatchTool({ store }), { position: 3 });

  const result = await run(removeWatchTool({ store }), { position: 2 });
  expect(result.removed).toBe(true);
  expect((result.watch as Watch).title).toBe("Metro Exodus");
  expect(current().map((w) => w.title)).toEqual(["Hades"]);
});

test("remove_watch refuses an unknown game rather than removing the wrong one", async () => {
  const { store, current } = makeStore();
  await run(addWatchTool({ store }), { position: 1 });

  const result = await run(removeWatchTool({ store }), { title: "Portal 2" });
  expect(result.removed).toBe(false);
  expect(current()).toHaveLength(1);
});

// ── state migration ───────────────────────────────────────────────────

test("v1 state migrates threshold to targetPrice and gains lastShownDeals", () => {
  // Typed loosely on purpose: this is the v1 shape, which no current type describes.
  const legacy: Record<string, unknown> = {
    watches: [
      { gameID: "1", title: "Hades", threshold: 5, steamAppID: "101", addedAt: "x" },
      { gameID: "2", title: "No Steam Entry", threshold: 9, steamAppID: null, addedAt: "y" }
    ],
    preferences: [],
    gameTags: { "101": { title: "Hades", genres: [], categories: [], cachedAt: "z", version: 2 } },
    prefs: { maxPrice: 20, alertsEnabled: true },
    lastPriceCheckAt: null
  };

  const migrated = migrateDealScoutState(legacy as never)!;
  expect(migrated.version).toBe(2);
  expect(migrated.lastShownDeals).toEqual([]);
  expect(migrated.watches[0]).toMatchObject({ targetPrice: 5, steamAppID: "101" });
  expect(migrated.watches[0]).not.toHaveProperty("threshold");
  // v1 wrote null for "no Steam entry"; the field is optional now, so it is dropped.
  expect(migrated.watches[1]).not.toHaveProperty("steamAppID");
  // Untouched by the migration.
  expect(migrated.gameTags).toBe(legacy.gameTags as never);
  expect(migrated.prefs.maxPrice).toBe(20);
});

test("migrating current state is a no-op, so onStart does not write every boot", () => {
  const current = migrateDealScoutState({
    version: 2,
    watches: [],
    preferences: [],
    lastShownDeals: [],
    gameTags: {},
    prefs: { maxPrice: null, alertsEnabled: true },
    lastPriceCheckAt: null
  });
  expect(current).toBeNull();
});
