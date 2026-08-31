import axios from "axios";
import type { SearchGame } from "./types/searchGame";

const GAMES_URL = "https://www.cheapshark.com/api/1.0/games"

// CheapShark caps this endpoint at 60 results.
export const MAX_SEARCH_LIMIT = 60

export interface SearchOptions {
  title: string
  limit?: number
  exact?: boolean
  signal?: AbortSignal
}

async function getGames({ title, limit = MAX_SEARCH_LIMIT, exact = false, signal }: SearchOptions): Promise<SearchGame[]> {
  try {
    const { data } = await axios.get<SearchGame[]>(GAMES_URL, {
      params: { title, limit, exact: exact ? 1 : 0 },
      headers: {
        "User-Agent": "deal_busters/0.1",
      },
      signal,
    })
    return data
  } catch (err) {
    if (axios.isCancel(err)) throw err
    if (axios.isAxiosError(err)) {
      console.error("status", err?.response?.status)
      console.error("status text", err.response?.statusText)
    } else {
      console.log('unknown err ')
      console.error(err)
    }
    throw err
  }
}

export default getGames;
