import type { Deal } from "../api/cheapshark"
import type { DealSet } from "../types/chat"
import { dealToGame } from "../util/dealToGame"
import GameCard from "./GameCard"

interface ChatDealCardsProps {
  dealSet: DealSet,
  /** Index of the card to highlight, or null when this set is not focused. */
  selectedIndex: number | null,
  onSelect: (index: number) => void,
  onGameClickHandler: Function,
}

/** The scrollbox id of one card, so the transcript can scroll it into view. */
export function chatCardId(toolCallId: string, index: number): string {
  return `chat-card-${toolCallId}-${index}`
}

/**
 * One `search_deals` result rendered inline in the transcript, using the same
 * GameCard the deal grid uses. The wrapping box exists only to carry an id
 * scrollChildIntoView can find.
 */
export default function ChatDealCards({
  dealSet,
  selectedIndex,
  onSelect,
  onGameClickHandler,
}: ChatDealCardsProps) {
  return (
    <box
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "flex-start",
      }}
    >
      {dealSet.deals.map((deal: Deal, index: number) => (
        <box key={deal.dealID} id={chatCardId(dealSet.toolCallId, index)}>
          <GameCard
            game={dealToGame(deal)}
            selected={index === selectedIndex}
            onSelect={() => onSelect(index)}
            onGameClickHandler={onGameClickHandler}
          />
        </box>
      ))}
    </box>
  )
}
