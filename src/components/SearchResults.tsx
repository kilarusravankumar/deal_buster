import { useEffect, useRef, useState } from "react"
import { useKeyboard, useOnResize, useTerminalDimensions } from "@opentui/react"
import type { ScrollBoxRenderable } from "@opentui/core"
import type { SearchGame } from "../types/searchGame"
import SearchResultCard from "./SearchResultCard"
import { SEARCH_CARD_HEIGHT, SEARCH_ROW_STRIDE, columnsFor } from "./gridMetrics"

interface SearchResultsProps {
  results: SearchGame[],
  search: string,
  onGameClickHandler: Function,
  loading?: boolean,
  err?: string | null,
  onClear: () => void,
}

// border (2) + a column for the vertical scrollbar
const CHROME_WIDTH = 3

export default function SearchResults({
  results,
  search,
  onGameClickHandler,
  loading = false,
  err = null,
  onClear,
}: SearchResultsProps) {
  const boxRef = useRef<ScrollBoxRenderable | null>(null)
  const { width: termWidth } = useTerminalDimensions()
  const [measuredWidth, setMeasuredWidth] = useState<number>(0)
  // The result set is small and always replaced wholesale, so selection is
  // local state here rather than being lifted the way the deal grid's is.
  const [selected, setSelected] = useState<number>(0)

  const measure = () => {
    const vp = boxRef.current?.viewport
    if (vp && vp.width > 0) setMeasuredWidth((prev) => (prev === vp.width ? prev : vp.width))
  }
  useEffect(measure)
  useOnResize(measure)

  const viewportWidth = measuredWidth > 0 ? measuredWidth : Math.max(1, termWidth - CHROME_WIDTH)
  const cols = columnsFor(viewportWidth)
  const last = results.length - 1

  // A new query is a fresh result set: start at the top again.
  useEffect(() => {
    setSelected(0)
    boxRef.current?.scrollTo({ x: 0, y: 0 })
  }, [search])

  const scrollIntoView = (index: number) => {
    const box = boxRef.current
    if (!box) return
    const top = Math.floor(index / cols) * SEARCH_ROW_STRIDE
    const viewportHeight = box.viewport.height
    if (top < box.scrollTop) {
      box.scrollTo({ x: 0, y: top })
    } else if (top + SEARCH_CARD_HEIGHT > box.scrollTop + viewportHeight) {
      box.scrollTo({ x: 0, y: top + SEARCH_CARD_HEIGHT - viewportHeight })
    }
  }

  const moveTo = (index: number) => {
    const next = Math.min(Math.max(index, 0), last)
    if (next === selected) return
    setSelected(next)
    scrollIntoView(next)
  }

  useKeyboard((key) => {
    if (key.name === "escape") {
      onClear()
      return
    }
    if (results.length === 0) return
    switch (key.name) {
      case "left":
      case "h":
        moveTo(selected - 1)
        break
      case "right":
      case "l":
        moveTo(selected + 1)
        break
      case "up":
      case "k":
        if (selected - cols >= 0) moveTo(selected - cols)
        break
      case "down":
      case "j":
        moveTo(Math.min(selected + cols, last))
        break
      case "home":
        moveTo(0)
        break
      case "end":
        moveTo(last)
        break
      case "return":
        onGameClickHandler(results[selected]?.steamAppID)
        break
    }
  })

  if (loading) {
    return (
      <box style={{ width: "100%", height: "100%", alignItems: "center", justifyContent: "center" }}>
        <text><span fg="#4682A1">Searching for “{search}”…</span></text>
      </box>
    )
  }

  if (err != null) {
    return (
      <box style={{ width: "100%", height: "100%", alignItems: "center", justifyContent: "center" }}>
        <text><span fg="#FF0000">{err}</span></text>
        <text><span fg="#888888">esc to go back to deals</span></text>
      </box>
    )
  }

  if (results.length === 0) {
    return (
      <box style={{ width: "100%", height: "100%", alignItems: "center", justifyContent: "center" }}>
        <text><span fg="#888888">No games match “{search}”.</span></text>
        <text><span fg="#888888">esc to go back to deals</span></text>
      </box>
    )
  }

  return (
    <scrollbox
      ref={boxRef}
      title={` Search: ${search}  (${selected + 1}/${results.length}) — esc to clear `}
      border
      viewportCulling={true}
      contentOptions={{
        flexDirection: "row",
        alignItems: 'flex-start',
        flexWrap: "wrap"
      }}
    >
      {results.map((game, index) => (
        <SearchResultCard
          key={game.gameID}
          game={game}
          selected={index === selected}
          onSelect={() => setSelected(index)}
          onGameClickHandler={onGameClickHandler}
        />
      ))}
    </scrollbox>
  )
}
