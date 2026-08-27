import { useEffect, useState } from "react";
import type { GameDetails } from "../types/steamGame";
import getGameDetails from "../getSteamGameDetails";

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
        let _details = await getGameDetails(steamAppID)
        if (!cancelled) {
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
