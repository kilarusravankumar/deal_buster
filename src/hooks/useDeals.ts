import { useState, useEffect, useCallback, useRef } from "react";
import getDeals from "../getDeals";
import getGames from "../getGames";
import type { Game } from "../types/game";
import type { SearchGame } from "../types/searchGame";
import type { DealFilters } from "../types/params";

// Typing fires this hook on every keystroke; wait for a pause before spending
// a request.
const SEARCH_DEBOUNCE_MS = 300

export default function useGames(filters: DealFilters, search: string = "") {
  const [games, setGames] = useState<Game[]>([])
  const [page, setPage] = useState<number>(0)
  const [totalPages, setTotalPages] = useState<number>(1)
  const [loading, setLoading] = useState<boolean>(true)
  const [err, setErr] = useState<string | null>(null)

  const [results, setResults] = useState<SearchGame[]>([])
  const [searchLoading, setSearchLoading] = useState<boolean>(false)
  const [searchErr, setSearchErr] = useState<string | null>(null)

  const { sortBy, pageSize, onlyAAA } = filters

  // The games endpoint is a completely separate result set from the deals
  // list, so it gets its own state and never touches `games`/`page`.
  useEffect(() => {
    const title = search.trim()
    if (title.length === 0) {
      setResults([])
      setSearchErr(null)
      setSearchLoading(false)
      return
    }

    let cancelled = false
    const controller = new AbortController()
    setSearchLoading(true)
    setSearchErr(null)

    const timer = setTimeout(async () => {
      try {
        const data = await getGames({ title, signal: controller.signal })
        if (cancelled) return
        setResults(data)
      } catch (e) {
        if (cancelled) return
        setResults([])
        setSearchErr(e instanceof Error ? e.message : `no results for "${title}".`)
      } finally {
        if (!cancelled) setSearchLoading(false)
      }
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
      controller.abort()
    }
  }, [search])

  // Changing a filter invalidates every page we have, so paging restarts at 0.
  // `games` is deliberately left in place until the new page 0 arrives, so the
  // grid never unmounts mid-change.
  useEffect(() => {
    setPage(0)
  }, [sortBy, pageSize, onlyAAA])

  // loadMore fires from render-time keyboard handling, so it can be called
  // again before `loading` has re-rendered. A ref is the only reliable latch.
  const inFlight = useRef<boolean>(false)

  useEffect(() => {
    let cancelled = false
    inFlight.current = true

    async function getGames() {
      setLoading(true)
      if (page === 0) setErr(null)
      try {
        const { data, totalPageCount } = await getDeals({
          sortBy, pageSize, onlyAAA, pageNumber: page,
        })
        if (cancelled) return
        // Page 0 replaces; every later page appends to what is on screen.
        setGames((prev) => (page === 0 ? data : [...prev, ...data]))
        setTotalPages(totalPageCount)
      } catch (e) {
        if (cancelled) return
        const message = e instanceof Error ? e.message : "failed to load game deals."
        if (page === 0) {
          setErr(message)
          setGames([])
        } else {
          // An append that failed leaves the existing list usable; step the
          // page back so the same fetch can be retried.
          setPage((prev) => Math.max(prev - 1, 0))
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
          inFlight.current = false
        }
      }
    }

    getGames()
    return () => {
      cancelled = true
      inFlight.current = false
    }
  }, [sortBy, pageSize, onlyAAA, page])

  const hasMore = page < totalPages - 1

  const loadMore = useCallback(() => {
    if (inFlight.current) return
    setPage((prev) => (prev < totalPages - 1 ? prev + 1 : prev))
  }, [totalPages])

  return {
    games, loading, err, page, totalPages, hasMore, loadMore,
    results, searchLoading, searchErr,
  }
}
