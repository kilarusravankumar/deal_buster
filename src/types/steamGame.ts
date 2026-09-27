// Raw Steam API response shape — only the fields you actually use.
// (Full response has way more; this is intentionally partial.)
export interface SteamAppDetailsResponse {
  [appId: string]: {
    success: boolean;
    data?: SteamAppData;
  };
}

export interface SteamAppData {
  name: string;
  steam_appid: number;
  detailed_description: string;
  header_image: string;
  developers: string[];
  publishers: string[];
  platforms: {
    windows: boolean;
    mac: boolean;
    linux: boolean;
  };
  screenshots?: SteamScreenshot[];
  // Genre ids come back as strings ("1"), category ids as numbers (2).
  genres?: SteamGenre[];
  categories?: SteamCategory[];
  recommendations?: {
    total: number;
  };
}

export interface SteamGenre {
  id: string;
  description: string;
}

export interface SteamCategory {
  id: number;
  description: string;
}

export interface SteamScreenshot {
  id: number;
  path_thumbnail: string;
  path_full: string;
}

export interface GameDetails {
  appId: number;
  name: string;
  description: string;
  headerImage: string;
  developers: string[];
  publishers: string[];
  platforms: {
    windows: boolean;
    mac: boolean;
    linux: boolean;
  };
  screenshots: string[]; // just the thumbnail URLs, or full URLs — your call
  // Descriptions only ("Action", "Indie", "Single-player"): these are the tags
  // the agent reasons over for similarity, so the numeric ids are dropped.
  genres: string[];
  categories: string[];
  totalRecommendations: number;
}
