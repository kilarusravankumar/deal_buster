import { test, expect } from "bun:test";
import { searchDealsTool } from "../worker/tools/searchDeals";
import { getGameDetailsTool } from "../worker/tools/getGameDetails";
import type { LoadGameTags } from "../worker/state";

// Exercises the tool contracts without the model in the loop, so the wiring is
// covered even when Workers AI is unavailable. `execute` is invoked directly;
// the second argument is the AI SDK's call context, which neither tool reads.
const CALL_CONTEXT = { toolCallId: "test", messages: [] } as never;

const run = async (t: { execute?: unknown }, input: unknown) =>
  // biome-ignore lint: the SDK's execute type is generic over the input schema.
  (await (t.execute as (i: unknown, c: never) => Promise<unknown>)(input, CALL_CONTEXT)) as Record<
    string,
    unknown
  >;

function tagsFor(title: string): LoadGameTags {
  return async (candidates) => ({
    title,
    genres: ["Action", "RPG"],
    categories: ["Single-player"],
    cachedAt: new Date().toISOString(),
    version: 2,
    cached: true,
    steamAppID: candidates[0]!
  });
}

test("get_game_details refuses an unusable appID instead of throwing", async () => {
  const tool = getGameDetailsTool({
    loadGameTags: async () => {
      throw new Error("must not be called");
    }
  });
  const result = await run(tool, { steamAppID: null, title: "Hades" });
  expect(result.found).toBe(false);
  expect(String(result.reason)).toContain("no usable steamAppID");
});

test("get_game_details reports a title mismatch rather than the wrong genres", async () => {
  // The real failure this guards: appID 280180 is "Hover", not UBERMOSH.
  const tool = getGameDetailsTool({ loadGameTags: tagsFor("Hover") });
  const result = await run(tool, { steamAppID: "280180", title: "UBERMOSH" });
  expect(result.found).toBe(false);
  expect(result.titleMismatch).toBe(true);
  expect(result.steamTitle).toBe("Hover");
  expect(result).not.toHaveProperty("genres");
});

test("get_game_details returns the verified genres on a match", async () => {
  const tool = getGameDetailsTool({ loadGameTags: tagsFor("Hades") });
  const result = await run(tool, { steamAppID: "1145360", title: "Hades" });
  expect(result).toMatchObject({
    found: true,
    steamAppID: "1145360",
    title: "Hades",
    genres: ["Action", "RPG"],
    fromCache: true
  });
});

test("search_deals falls back to the stored price ceiling", async () => {
  const tool = searchDealsTool({ recordShownDeals: () => {}, defaultMaxPrice: 10 });
  const result = await run(tool, { limit: 5 });
  expect(result.error).toBeUndefined();
  const deals = result.deals as { salePrice: number }[];
  expect(deals.length).toBeGreaterThan(0);
  for (const deal of deals) expect(deal.salePrice).toBeLessThanOrEqual(10);
});

test("search_deals explains an unindexed steamAppID instead of implying no deal", async () => {
  // 292030 is Steam's real appID for The Witcher 3; CheapShark indexes the deal
  // under its own 124923, so /deals?steamAppID=292030 legitimately returns none.
  const tool = searchDealsTool({ recordShownDeals: () => {}, defaultMaxPrice: null });
  const result = await run(tool, { steamAppID: "292030" });
  expect(result.count).toBe(0);
  expect(String(result.note)).toContain("CheapShark indexes its own appID");
});
