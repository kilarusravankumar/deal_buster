
// Shared by the TUI's sort bar (Tab cycles this list) and the agent's
// search_deals tool, so the two can never drift apart.
//
// This is CheapShark's full set of orderings minus `Store`: Deal Buster only
// ever queries storeID=1, so sorting by store would be a no-op that still had
// to appear in the TUI's Tab cycle.
export const SORT_OPTIONS = [
  "DealRating",
  "Title",
  "Savings",
  "Price",
  "Metacritic",
  "Reviews",
  "ReviewCount",
  "Release",
  "Recent",
] as const;

export type SortType = (typeof SORT_OPTIONS)[number];
