/* sample response from /api/1.0/games?title=batman
 * ------------------------------------------------
 *{
    "gameID": "612",
    "steamAppID": null,
    "cheapest": "15.95",
    "cheapestDealID": "0f%2B4gT2VVUn4UcmFzPxXnuqoXKAOYoJ5mpFZRWNyohc%3D",
    "external": "LEGO Batman",
    "internalName": "LEGOBATMAN",
    "thumb": "https://cdn.fanatical.com/production/product/400x225/105f34ca-7757-47ad-953e-7df7f016741e.jpeg"
  },
 *
 * Note this is a *different* shape from the deals endpoint: there is no sale
 * price, savings, rating or release date, and steamAppID is frequently null.
 */
export interface SearchGame {
  "gameID": string;
  "steamAppID": string | null;
  "cheapest": string;
  "cheapestDealID": string;
  "external": string;
  "internalName": string;
  "thumb": string;
}
