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
  recommendations?: {
    total: number;
  };
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
  totalRecommendations: number;
}
