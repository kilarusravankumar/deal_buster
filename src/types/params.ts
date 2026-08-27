import type { SortType } from "./sort";

export interface SortByOptions {
  DealRating: boolean;
  Title: boolean;
  Savings: boolean;
  Price: boolean;
  Metacritic: boolean;
  Reviews: boolean;
  ReviewCount: boolean;
  Release: boolean;
  Recent: boolean;
}

// CheapShark clamps pageSize to 60; asking for more silently returns 60.
export const MAX_PAGE_SIZE = 60;

// What the user controls. Changing any of these restarts paging from page 0.
export interface DealFilters {
  pageSize: number;
  onlyAAA: boolean;
  sortBy: SortType;
}

// What a single request needs. Pages are 0-indexed.
export interface QueryParams extends DealFilters {
  pageNumber: number;
}
