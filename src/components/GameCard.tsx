import type { Game } from "../types/game"
import ConvertToDate from "../util/dateConv"
import Thumbnail from "./thumb"
import { CARD_HEIGHT, CARD_WIDTH, GAP_X, GAP_Y } from "./gridMetrics"

interface GameCardProps {
  game: Game,
  onGameClickHandler: Function,
  selected?: boolean,
  onSelect?: () => void,
}

export default function GameCard({ game, onGameClickHandler, selected, onSelect }: GameCardProps) {
  const savings = Math.round(Number(game.savings))

  return (
    <box
      title={game.title.length < 23 ? game.title : game.title?.slice(0, 23)}
      border
      borderStyle={selected ? "heavy" : "double"}
      borderColor={selected ? "#FACC15" : "#7CF2E4"}
      style={{
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        marginBottom: GAP_Y,
        marginRight: GAP_X,
        paddingLeft: 1,
      }}
      onMouseDown={() => {
        onSelect?.()
        onGameClickHandler(game.steamAppID)
      }}
    >
      <box>
        <Thumbnail thumbnail={game.thumb} />
      </box>
      <box>
        <text>
          <span fg="#4ADE80">Sale price: ${game.salePrice}</span>
        </text>
        <text>
          <span fg="#888888">Original price: ${game.normalPrice}</span>
        </text>
        <text>
          <span fg="#FACC15">Savings: {savings}%</span>
        </text>
        <text>
          <span fg="#888888">Released on: {ConvertToDate(game.releaseDate)}</span>
        </text>
        <text>
          <span fg="#888888">steamAppID : {game.steamAppID} , appID: {game.gameID}</span>
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
