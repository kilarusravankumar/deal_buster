import { useEffect, useRef, useState } from "react"
import { useKeyboard, useOnResize, useTerminalDimensions } from "@opentui/react"
import type { ScrollBoxRenderable } from "@opentui/core"
import type { Game } from "../types/game"
import GameCard from "./GameCard"
import { CARD_HEIGHT, ROW_STRIDE, columnsFor } from "./gridMetrics"

interface GameGridProps {
  games: Game[],
  onGameClickHandler: Function,
  selectedIndex: number,
  onSelectedIndexChange: (index: number) => void,
  loading?: boolean,
  hasMore?: boolean,
  onLoadMore?: () => void,
  // Changes when the result set is replaced rather than appended to, which is
  // the only time the existing scroll offset stops making sense.
  resetKey?: string,
}

// border (2) + a column for the vertical scrollbar
const CHROME_WIDTH = 3

export default function GameGrid({
  games,
  onGameClickHandler,
  selectedIndex,
  onSelectedIndexChange,
  loading = false,
  hasMore = false,
  onLoadMore,
  resetKey,
}: GameGridProps) {
  const boxRef = useRef<ScrollBoxRenderable | null>(null)
  const { width: termWidth } = useTerminalDimensions()
  const [measuredWidth, setMeasuredWidth] = useState<number>(0)

  const measure = () => {
    const vp = boxRef.current?.viewport
    if (vp && vp.width > 0) setMeasuredWidth((prev) => (prev === vp.width ? prev : vp.width))
  }
  useEffect(measure)
  useOnResize(measure)

  const viewportWidth = measuredWidth > 0 ? measuredWidth : Math.max(1, termWidth - CHROME_WIDTH)
  const cols = columnsFor(viewportWidth)
  const last = games.length - 1

  const selected = Math.min(Math.max(selectedIndex, 0), Math.max(last, 0))
  useEffect(() => {
    if (selected !== selectedIndex) onSelectedIndexChange(selected)
  }, [selected, selectedIndex])

  // Only on a genuine replacement — appending a page must keep the offset.
  useEffect(() => {
    boxRef.current?.scrollTo({ x: 0, y: 0 })
  }, [resetKey])

  const scrollIntoView = (index: number) => {
    const box = boxRef.current
    if (!box) return
    const top = Math.floor(index / cols) * ROW_STRIDE
    const viewportHeight = box.viewport.height
    if (top < box.scrollTop) {
      box.scrollTo({ x: 0, y: top })
    } else if (top + CARD_HEIGHT > box.scrollTop + viewportHeight) {
      box.scrollTo({ x: 0, y: top + CARD_HEIGHT - viewportHeight })
    }
  }

  const moveTo = (index: number) => {
    const next = Math.min(Math.max(index, 0), last)
    // Prefetch a row early so the next page is usually already appended by the
    // time the selection actually reaches the bottom.
    if (hasMore && next >= last - cols) onLoadMore?.()
    if (next === selected) return
    onSelectedIndexChange(next)
    scrollIntoView(next)
  }

  useKeyboard((key) => {
    if (games.length === 0) return
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
        onGameClickHandler(games[selected]?.steamAppID)
        break
    }
  })

  if (games.length === 0) {
    return (
      <box style={{ width: "100%", height: "100%", alignItems: "center", justifyContent: "center" }}>
        <text>Loading deals…</text>
      </box>
    )
  }

  return (
    <scrollbox
      ref={boxRef}
      title={` Deals in Steam store  (${selected + 1}/${games.length})${loading ? " — loading…" : ""} `}
      border
      viewportCulling={true}
      contentOptions={{
        flexDirection: "row",
        alignItems: 'flex-start',
        flexWrap: "wrap"
      }}
    >
      {games.map((game, index) => (
        <GameCard
          key={game.dealID}
          game={game}
          selected={index === selected}
          onSelect={() => onSelectedIndexChange(index)}
          onGameClickHandler={onGameClickHandler}
        />
      ))}
    </scrollbox>
  )
}
