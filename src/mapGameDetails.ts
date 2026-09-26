import type { SteamAppDetailsResponse, GameDetails } from "./types/steamGame";

export default function mapToGameDetails(response: SteamAppDetailsResponse, appId: number): GameDetails | null {
  const responseID = Object.keys(response)[0]

  const entry = response[responseID]

  if (!entry?.success || !entry.data) {
    return null;
  }

  const data = entry.data;

  return {
    appId: data.steam_appid,
    name: data.name,
    description: data.detailed_description,
    headerImage: data.header_image,
    developers: data.developers ?? [],
    publishers: data.publishers ?? [],
    platforms: data.platforms,
    screenshots: (data.screenshots ?? []).map((s) => s.path_full),
    totalRecommendations: data.recommendations?.total ?? 0,
  };
}
