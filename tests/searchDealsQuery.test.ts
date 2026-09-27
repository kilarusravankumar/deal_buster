import { test, expect } from "bun:test";
import { STEAM_STORE_ID, toDealsQuery } from "../src/api/cheapshark";

// Every value below was checked against the live API before being pinned here —
// notably the upperPrice=50 sentinel and minimumReviewCount's real param name.

test("the defaults reproduce the pre-filter query exactly", () => {
  // Backward compatibility: a call using only the original four inputs must send
  // what it always sent.
  expect(toDealsQuery({ title: "Hades", maxPrice: 20, sortBy: "Price", limit: 5 })).toEqual({
    storeID: STEAM_STORE_ID,
    onSale: "1",
    sortBy: "Price",
    pageSize: "5",
    title: "Hades",
    upperPrice: "20"
  });
  expect(toDealsQuery({})).toEqual({
    storeID: STEAM_STORE_ID,
    onSale: "1",
    sortBy: "DealRating",
    pageSize: "8"
  });
});

test("the store is locked to Steam whatever the input says", () => {
  // @ts-expect-error — storeID is deliberately not part of the input type.
  const query = toDealsQuery({ storeID: "25", title: "Hades" });
  expect(query.storeID).toBe(STEAM_STORE_ID);
  expect(STEAM_STORE_ID).toBe("1");
});

test("semantic names map to CheapShark's wire names", () => {
  const query = toDealsQuery({
    minPrice: 10,
    maxPrice: 20,
    minMetacritic: 80,
    minSteamRating: 85,
    minReviewCount: 1000,
    newWithinHours: 24,
    aaaOnly: true,
    sortDescending: true,
    sortBy: "Savings",
    limit: 12
  });
  expect(query).toEqual({
    storeID: "1",
    onSale: "1",
    sortBy: "Savings",
    pageSize: "12",
    lowerPrice: "10",
    upperPrice: "20",
    metacritic: "80",
    steamRating: "85",
    minimumReviewCount: "1000",
    maxAge: "24",
    AAA: "1",
    desc: "1"
  });
});

test("upperPrice=50 is CheapShark's 'no maximum', so a real $50 ceiling is sent as 49.99", () => {
  expect(toDealsQuery({ maxPrice: 50 }).upperPrice).toBe("49.99");
  // Neighbouring values are not special.
  expect(toDealsQuery({ maxPrice: 49 }).upperPrice).toBe("49");
  expect(toDealsQuery({ maxPrice: 51 }).upperPrice).toBe("51");
  expect(toDealsQuery({ maxPrice: 60 }).upperPrice).toBe("60");
});

test("out-of-range values are clamped, not rejected", () => {
  expect(toDealsQuery({ minMetacritic: 140 }).metacritic).toBe("100");
  expect(toDealsQuery({ minMetacritic: -5 }).metacritic).toBe("0");
  expect(toDealsQuery({ minSteamRating: 999 }).steamRating).toBe("100");
  expect(toDealsQuery({ minSteamRating: -1 }).steamRating).toBe("0");
  expect(toDealsQuery({ minReviewCount: -20 }).minimumReviewCount).toBe("0");
  // maxAge is in hours, 1 to 2500.
  expect(toDealsQuery({ newWithinHours: 0 }).maxAge).toBe("1");
  expect(toDealsQuery({ newWithinHours: 99999 }).maxAge).toBe("2500");
  expect(toDealsQuery({ newWithinHours: 24 }).maxAge).toBe("24");
  // Result count stays inside 1..20.
  expect(toDealsQuery({ limit: 0 }).pageSize).toBe("1");
  expect(toDealsQuery({ limit: 500 }).pageSize).toBe("20");
  // A floor above the ceiling would match nothing, so it is pulled down to it.
  expect(toDealsQuery({ minPrice: 40, maxPrice: 20 })).toMatchObject({
    lowerPrice: "20",
    upperPrice: "20"
  });
  expect(toDealsQuery({ minPrice: -3 }).lowerPrice).toBe("0");
});

test("onSale defaults to on and can be turned off", () => {
  expect(toDealsQuery({}).onSale).toBe("1");
  expect(toDealsQuery({ onSale: true }).onSale).toBe("1");
  expect(toDealsQuery({ onSale: false }).onSale).toBe("0");
});

test("exact is dropped without a title, since it has nothing to match", () => {
  expect(toDealsQuery({ exact: true, title: "Hades" }).exact).toBe("1");
  expect(toDealsQuery({ exact: true })).not.toHaveProperty("exact");
  expect(toDealsQuery({ exact: true, title: "   " })).not.toHaveProperty("exact");
  // Off by default.
  expect(toDealsQuery({ title: "Hades" })).not.toHaveProperty("exact");
});

test("steamAppID is passed through for a precise lookup", () => {
  // 124923 is CheapShark's id for The Witcher 3; /deals only matches that id
  // space, never Steam's real 292030 — the tool explains this when it finds
  // nothing, so the mapper just forwards whatever it is given.
  expect(toDealsQuery({ steamAppID: "124923" }).steamAppID).toBe("124923");
  expect(toDealsQuery({ steamAppID: " 1145360 " }).steamAppID).toBe("1145360");
  expect(toDealsQuery({ steamAppID: "" })).not.toHaveProperty("steamAppID");
});

test("absent filters send no parameter at all", () => {
  const keys = Object.keys(toDealsQuery({ title: "Hades" })).sort();
  expect(keys).toEqual(["onSale", "pageSize", "sortBy", "storeID", "title"]);
});
