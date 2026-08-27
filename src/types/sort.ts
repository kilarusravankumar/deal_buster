
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
