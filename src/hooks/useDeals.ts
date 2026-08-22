import { useState, useEffect } from "react";
import getDeals from "../getDeals";
import type { Game } from "../types/game";

export default function useDeals() {
  const [games, setGames] = useState<Game[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [err, setErr] = useState<string | null>()

  useEffect(() => {
    let cancelled = false
    async function getGames() {
      setLoading(true)
      try {
        const _games = await getDeals()
        if (!cancelled) {
          setGames(_games)
        }
      } catch (err) {
        if (!cancelled) {
          setLoading(false)
          setErr(err instanceof Error ? err.message : "failed to load game deals.")
        }
      } finally {
        setLoading(false)
      }
    }
    getGames()
    return () => {
      cancelled = true
    }
  }, [])

  return { games, loading, err }
}
