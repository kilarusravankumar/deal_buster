import { test, expect } from "bun:test";
import { dealToGame } from "../src/util/dealToGame";
import ConvertToDate from "../src/util/dateConv";
import type { Deal } from "../src/api/cheapshark";

const baseDeal: Deal = {
  gameID: "330831",
  dealID: "test-deal-id",
  title: "SPRAWL zero",
  salePrice: 24.73,
  normalPrice: 44.98,
  savingsPercent: 45,
  releaseDate: 1788825600,
  steamAppID: "3748520",
  steamRatingPercent: 95,
  metacriticScore: 76,
  thumb: "https://example.com/thumb.jpg",
};

test("dealToGame preserves releaseDate from Deal", () => {
  const game = dealToGame(baseDeal);
  expect(game.releaseDate).toBe(1788825600);
  expect(ConvertToDate(game.releaseDate)).not.toBe("—");
});

test("dealToGame falls back to 0 when releaseDate is missing or 0", () => {
  const game = dealToGame({ ...baseDeal, releaseDate: 0 });
  expect(game.releaseDate).toBe(0);
  expect(ConvertToDate(game.releaseDate)).toBe("—");
});
