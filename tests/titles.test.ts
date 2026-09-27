import { test, expect } from "bun:test";
import { titlesLookAlike } from "../worker/titles";

test("same game matches across editions and punctuation", () => {
  expect(titlesLookAlike("Hades", "Hades")).toBe(true);
  expect(titlesLookAlike("Hades", "Hades II")).toBe(true);
  expect(titlesLookAlike("The Witcher: Enhanced Edition", "The Witcher")).toBe(true);
  expect(titlesLookAlike("UBERMOSH", "UBERMOSH:BLACK")).toBe(true);
});

test("an unrelated game does not match", () => {
  // The case that caused a wrong answer: the model supplied appID 280180 for
  // UBERMOSH, which is actually "Hover", and then reported Hover's genres.
  expect(titlesLookAlike("UBERMOSH", "Hover")).toBe(false);
  expect(titlesLookAlike("Hades", "Borderlands 2")).toBe(false);
});

test("an empty side matches, since nothing is known", () => {
  expect(titlesLookAlike("", "Hades")).toBe(true);
  expect(titlesLookAlike("Hades", "")).toBe(true);
});
