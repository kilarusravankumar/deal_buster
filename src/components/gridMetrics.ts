// Card geometry lives here so GameCard's style and GameGrid's navigation math
// can never drift apart. Every card occupies a stride of CARD_WIDTH + GAP_X
// columns, which is what lets us derive the wrap point Yoga picks.
export const CARD_WIDTH = 30
export const CARD_HEIGHT = 15
export const GAP_X = 1
export const GAP_Y = 1

export const COL_STRIDE = CARD_WIDTH + GAP_X
export const ROW_STRIDE = CARD_HEIGHT + GAP_Y

export function columnsFor(viewportWidth: number): number {
  return Math.max(1, Math.floor(viewportWidth / COL_STRIDE))
}
