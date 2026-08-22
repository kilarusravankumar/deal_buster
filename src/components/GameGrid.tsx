import { FlexDirection } from "@opentui/core/yoga"
import type { Game } from "../types/game"
import GameCard from "./GameCard"

interface GameGridProps {
  games: Game[]
}

export default function GameGrid({ games }: GameGridProps) {
  if (games.length === 0) {
    return (
      <box style={{ width: "100%", height: "100%", alignItems: "center", justifyContent: "center" }}>
        <text>Loading deals…</text>
      </box>
    )
  }

  return (
    <scrollbox
      title=" Deals in Steam store "
      border
      focused
      contentOptions={{
        flexDirection: "row",
        alignItems: 'flex-start',
        flexWrap: "wrap"
      }}
    >
      {games.map((game) => (
        <GameCard key={game.dealID} game={game} />
      ))}
    </scrollbox>
  )
}
