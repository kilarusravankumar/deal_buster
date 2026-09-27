import { test, expect } from "bun:test";
import { steamAppIDCandidates, steamAppIDFromThumb } from "../src/api/cheapshark";

// The bug: CheapShark's own steamAppID for this deal is 124923, which Steam has
// no app for, while the same row's thumb points at the real app, 292030.
const WITCHER_3_THUMB =
  "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/292030/e4364da910766631c924b6a639ea84681791160a/capsule_231x87_alt_assets_4.jpg?t=1788333513";

test("a stale steamAppID loses to the appID in the thumb URL", () => {
  expect(
    steamAppIDCandidates({ steamAppID: "124923", thumb: WITCHER_3_THUMB })
  ).toEqual(["292030", "124923"]);
  expect(steamAppIDFromThumb(WITCHER_3_THUMB)).toBe("292030");
});

test("the thumb alone is enough when the field is missing", () => {
  expect(steamAppIDCandidates({ steamAppID: null, thumb: WITCHER_3_THUMB })).toEqual([
    "292030"
  ]);
  // Most thumbs have no hash segment between the appID and the file name.
  expect(
    steamAppIDCandidates({
      steamAppID: null,
      thumb:
        "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/20920/capsule_231x87.jpg?t=1761657279"
    })
  ).toEqual(["20920"]);
});

test("the field alone is used when no appID can be read from the thumb", () => {
  // /games rows sometimes carry a non-Steam thumb.
  expect(
    steamAppIDCandidates({
      steamAppID: "1651600",
      thumb:
        "https://cdn.humblebundle.com/misc/files/hashed/8d5f890f3135448a594155fa943e4be9bc69ef0d.jpg"
    })
  ).toEqual(["1651600"]);
  // A `subs` path carries a Steam package id, not an appID, so it must not match
  // — the field, wrong as it may be, is all there is.
  expect(
    steamAppIDCandidates({
      steamAppID: "96994",
      thumb:
        "https://shared.fastly.steamstatic.com/store_item_assets/steam/subs/96994/capsule_231x87.jpg?t=1495572651"
    })
  ).toEqual(["96994"]);
});

test("no candidate at all when neither source is usable", () => {
  expect(steamAppIDCandidates({ steamAppID: null, thumb: null })).toEqual([]);
  expect(steamAppIDCandidates({})).toEqual([]);
  // The model sometimes passes a title or "none" as the appID.
  expect(
    steamAppIDCandidates({
      steamAppID: "none",
      thumb: "https://cdn.humblebundle.com/misc/files/hashed/8d5f.jpg"
    })
  ).toEqual([]);
});

test("the same appID from both sources is offered once", () => {
  expect(
    steamAppIDCandidates({
      steamAppID: "292030",
      thumb: WITCHER_3_THUMB
    })
  ).toEqual(["292030"]);
});
