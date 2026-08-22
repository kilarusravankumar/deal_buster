import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { useEffect, useState } from "react"
import type { Game } from "./src/types/game"
import getDeals from "./src/getDeals"
import GameGrid from "./src/components/GameGrid"
import useDeals from "./src/hooks/useDeals"

function App() {
  const { games, loading, err } = useDeals()
  if (loading) {
    return <box>
      <text>
        <span fg="#4682A1">Fetching Deals.......</span>
      </text>
    </box>
  }
  if (err != null) {
    return <box >
      <text><span fg="#FF0000">{err}</span></text>
    </box>
  }
  return <GameGrid games={games} />
}

const renderer = await createCliRenderer({
  exitOnCtrlC: true,
  backgroundColor: "#1131E9",
})

createRoot(renderer).render(<App />)
