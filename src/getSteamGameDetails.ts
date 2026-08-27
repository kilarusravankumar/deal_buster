import type { GameDetails, SteamAppDetailsResponse } from "./types/steamGame";
import axios from "axios";
import mapToGameDetails from "./mapGameDetails.ts";

export default async function getGameDetails(appId: string): Promise<GameDetails | null> {
  let appID: Number = Number(appId)
  const { data } = await axios.get<SteamAppDetailsResponse>(
    `https://store.steampowered.com/api/appdetails?appids=${appID}`
  );
  return mapToGameDetails(data, appID.valueOf());
} 
