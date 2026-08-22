import type { Game } from "../types/game"
import ConvertToDate from "../util/dateConv"
import Thumbnail from "./thumb"

interface GameCardProps {
  game: Game
}

export default function GameCard({ game }: GameCardProps) {
  const savings = Math.round(Number(game.savings))

  return (
    <box
      title={game.title}
      border
      borderStyle="double"
      borderColor="#7CF2E4"
      style={{ width: 30, height: 15, marginBottom: 1, marginRight: 1, paddingLeft: 1 }}
    >
      <box>
        <Thumbnail thumbnail={game.thumb} />
      </box>
      <box>
        <text>
          <span fg="#4ADE80">${game.salePrice}</span>
          {"  "}
          <span fg="#888888">was ${game.normalPrice}</span>
          {"  "}
          <span fg="#FACC15">-{savings}%</span>
        </text>
        <text>
          <span fg="#888888"> released on: {ConvertToDate(game.releaseDate)}</span>
        </text>
        <text>
          <span fg="#9CA3AF">{game.steamRatingText || "No rating"}</span>
          {game.steamRatingPercent && game.steamRatingPercent !== "0"
            ? ` (${game.steamRatingPercent}%)`
            : ""}
        </text>

      </box>

    </box>
  )
}
