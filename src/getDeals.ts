import axios from "axios";
import type { Game } from "./types/game";
import type { QueryParams } from "./types/params";

export interface DealsResponse {
  data: Game[]
  totalPageCount: number
}

const DEALS_URL = "https://www.cheapshark.com/api/1.0/deals"

async function getDeals(params: QueryParams): Promise<DealsResponse> {
  const query = {
    storeID: 1,
    onSale: 1,
    sortBy: params.sortBy,
    pageNumber: params.pageNumber,
    pageSize: params.pageSize,
    ...(params.onlyAAA ? { AAA: 1 } : {}),
  }

  try {
    const { data, headers } = await axios.get<Game[]>(DEALS_URL, {
      params: query,
      headers: {
        "User-Agent": "deal_busters/0.1",
      }
    })
    // axios lowercases response header names.
    const total = Number(headers["x-total-page-count"])
    return { data, totalPageCount: Number.isFinite(total) && total > 0 ? total : 1 }
  } catch (err) {
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

export default getDeals;
