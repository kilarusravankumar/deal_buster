/* sample response
 * -----------------
 *{
    "internalName": "WARHOUNDS",
    "title": "Warhounds",
    "metacriticLink": "/game/warhounds/",
    "dealID": "2ZZIGlBPy6LFiNHZvZHiF2n43t%2BdFr9LkWzlgg6CdCg%3D",
    "storeID": "1",
    "gameID": "328801",
    "salePrice": "28.56",
    "normalPrice": "40.48",
    "isOnSale": "1",
    "savings": "29.446640",
    "metacriticScore": "0",
    "steamRatingText": "Mostly Positive",
    "steamRatingPercent": "72",
    "steamRatingCount": "566",
    "steamAppID": "3929470",
    "releaseDate": 1786406400,
    "lastChange": 1786647152,
    "dealRating": "10.0",
    "thumb": "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3929470/b79bb46d900d0df7145ba66db76fab756931e68e/capsule_231x87_alt_assets_1.jpg?t=1787155977"
  },
 * 
 *
 */
export interface Game {
  "internalName": string;
  "title": string;
  "metacriticLink": string;
  "dealID": string;
  "storeID": string;
  "gameID": string;
  "salePrice": string;
  "normalPrice": string;
  "isOnSale": string;
  "savings": string;
  "metacriticScore": string;
  "steamRatingText": string;
  "steamRatingPercent": string;
  "steamRatingCount": string;
  "steamAppID": string;
  "releaseDate": number;
  "lastChange": number;
  "dealRating": string;
  "thumb": string;
}
