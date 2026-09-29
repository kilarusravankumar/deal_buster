import type { Deal } from "../api/cheapshark";
import type { Game } from "../types/game";

/**
 * The agent's `search_deals` returns the trimmed {@link Deal} shape, while
 * GameCard renders a full CheapShark {@link Game} row. This widens one into the
 * other so chat results reuse the grid's card verbatim.
 *
 * Nothing is invented: fields the tool does not send are left empty or zero, and
 * the card is responsible for rendering those as "unknown" rather than as a
 * plausible-looking wrong value. Fields carried on Deal (like releaseDate) are
 * preserved, falling back to 0 if absent (which ConvertToDate renders as a dash).
 */
export function dealToGame(deal: Deal): Game {
  return {
    internalName: "",
    title: deal.title,
    metacriticLink: "",
    dealID: deal.dealID,
    storeID: "1",
    gameID: deal.gameID,
    salePrice: String(deal.salePrice),
    normalPrice: String(deal.normalPrice),
    isOnSale: "1",
    savings: String(deal.savingsPercent),
    metacriticScore: deal.metacriticScore == null ? "" : String(deal.metacriticScore),
    // `search_deals` sends the percentage but not Steam's wording for it, so the
    // card falls back to showing the bare percentage.
    steamRatingText: "",
    steamRatingPercent:
      deal.steamRatingPercent == null ? "" : String(deal.steamRatingPercent),
    steamRatingCount: "",
    // Already resolved to an id Steam will answer for — see steamAppIDCandidates.
    steamAppID: deal.steamAppID ?? "",
    releaseDate: Number(deal.releaseDate) || 0,
    lastChange: 0,
    dealRating: "",
    thumb: deal.thumb
  };
}
