import { useRenderer } from "@opentui/react"
import type { SearchGame } from "../types/searchGame"
import Thumbnail from "./thumb"
import { CARD_WIDTH, GAP_X, GAP_Y, SEARCH_CARD_HEIGHT } from "./gridMetrics"

interface SearchResultCardProps {
  game: SearchGame,
  onGameClickHandler: Function,
  selected?: boolean,
  onSelect?: () => void,
}

export default function SearchResultCard({ game, onGameClickHandler, selected, onSelect }: SearchResultCardProps) {
  const renderer = useRenderer()
  const shouldDisplayImage = renderer.capabilities?.kitty_graphics

  return (
    <box
      title={game.external.length < 23 ? game.external : game.external.slice(0, 23)}
      border
      borderStyle={selected ? "heavy" : "double"}
      borderColor={selected ? "#FACC15" : "#7CF2E4"}
      style={{
        width: CARD_WIDTH,
        height: SEARCH_CARD_HEIGHT,
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
        {displayThumb(shouldDisplayImage, game)}
      </box>
      <box>
        <text>
          <span fg="#4ADE80">Cheapest: ${game.cheapest}</span>
        </text>
        <text>
          {/* The games endpoint often has no Steam entry; without it there are
              no details to open. */}
          <span fg={game.steamAppID ? "#888888" : "#6B7280"}>
            {game.steamAppID ? `steamAppID : ${game.steamAppID}` : "not on Steam"}
          </span>
        </text>
      </box>
    </box>
  )
}

function getInitials(title: string): string {
  return title
    .split(/[\s\-:]+/)
    .map((word) => word[0])
    .filter(Boolean)
    .slice(0, 3)
    .join("")
    .toUpperCase();
}

function displayThumb(shouldDisplayImage: boolean | undefined, game: SearchGame) {
  if (shouldDisplayImage && game.thumb) {
    return (
      <Thumbnail thumbnail={game.thumb} />
    )
  }
  return (
    <box>
      <ascii-font text={getInitials(game.external)} font="tiny" color={"#7aa2f7"} />
      <text><b><u><span fg="#7aa2f7">{game.external}</span></u></b></text>
    </box>
  )
}
