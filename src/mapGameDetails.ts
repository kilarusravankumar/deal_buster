import type { SteamAppDetailsResponse, GameDetails } from "./types/steamGame";

export default function mapToGameDetails(response: SteamAppDetailsResponse, appId: number): GameDetails | null {
  // The store echoes back its own appid key, which can differ from the one we
  // asked for, so take whatever single key came back.
  const responseID = Object.keys(response)[0]
  const entry = responseID ? response[responseID] : undefined

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
    screenshots: (data.screenshots ?? []).map((shot) => shot.path_full),
    genres: (data.genres ?? []).map((genre) => genre.description),
    categories: (data.categories ?? []).map((category) => category.description),
    totalRecommendations: data.recommendations?.total ?? 0,
  };
}
