import axios from "axios";
import type { Game } from "./types/game";



async function getDeals(): Promise<Game[]> {
  const url: string = "https://www.cheapshark.com/api/1.0/deals?storeID=1&onSale=1"

  try {
    const { data } = await axios.get<Game[]>(url, {
      headers: {
        "User-Agent": "deal_busters/0.1",
      }
    })
    return data;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      console.error("status", err?.response?.status)
      console.error("status text", err.response?.statusText)
    } else {
      console.log('unknown err ')
      console.error(err)
    }
    return []
  }

}

export default getDeals;
