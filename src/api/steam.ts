// Steam store client shared by the TUI and the Worker agent. `fetch`-only for
// the same reason as ../api/cheapshark.ts.

import type { GameDetails, SteamAppDetailsResponse } from "../types/steamGame";
import mapToGameDetails from "../mapGameDetails";

const APPDETAILS_URL = "https://store.steampowered.com/api/appdetails";

// Steam localizes genres and categories from the caller's IP — a Worker in Milan
// gets `["GDR"]` and "Giocatore singolo" instead of `["RPG"]` and "Single-player".
// The agent compares these strings as tags, so the locale has to be pinned rather
// than inherited from wherever the request happens to originate.
const LOCALE_PARAMS = "cc=us&l=english";

export async function getSteamGameDetails(
  appId: string | number,
  signal?: AbortSignal
): Promise<GameDetails | null> {
  const numericId = Number(appId);
  const response = await fetch(
    `${APPDETAILS_URL}?appids=${numericId}&${LOCALE_PARAMS}`,
    { signal }
  );
  if (!response.ok) {
    throw new Error(
      `Steam appdetails failed: ${response.status} ${response.statusText}`
    );
  }
  const data = (await response.json()) as SteamAppDetailsResponse;
  return mapToGameDetails(data, numericId);
}
