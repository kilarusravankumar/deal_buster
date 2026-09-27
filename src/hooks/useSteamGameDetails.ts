import { useEffect, useState } from "react";
import type { GameDetails } from "../types/steamGame";
import { getSteamGameDetails } from "../api/steam";

export default function useSteamGameDetails(steamAppID: string) {
  const [gameDetails, setGameDetails] = useState<GameDetails | null>(null)
  const [loading, setLoading] = useState<boolean>(false)

  useEffect(() => {
    if (!steamAppID) {
      setGameDetails(null)
      setLoading(false)
      return
    }

    let cancelled = false;
    setLoading(true)

    async function getDetails(steamAppID: string) {
      try {
        let _details = await getSteamGameDetails(steamAppID)
        if (!cancelled) {
          console.log(_details)
          setGameDetails(_details)
        }
      } catch (err) {
        console.error(err)
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    getDetails(steamAppID)

    return () => {
      cancelled = true
    }
  }, [steamAppID])

  return { gameDetails, loading }
}
