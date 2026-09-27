import { useEffect, useRef, useState } from "react"
import { useKeyboard } from "@opentui/react"
import type { InputRenderable, ScrollBoxRenderable } from "@opentui/core"
import type { ChatMessage, ConnectionStatus, DealSet, PaneFocus } from "../types/chat"
import { setTextCapture } from "../util/keyCapture"
import ChatDealCards, { chatCardId } from "./ChatDealCards"

interface ChatPaneProps {
  messages: ChatMessage[],
  status: ConnectionStatus,
  statusDetail: string | null,
  busy: boolean,
  focus: PaneFocus,
  onFocus: (next: PaneFocus) => void,
  onSend: (text: string) => void,
  onRetry: () => void,
  onGameClickHandler: Function,
  /** Column count, or "100%" when the chat has the screen to itself. */
  width: number | "100%",
}

const STATUS_LABEL: Record<ConnectionStatus, { text: string, color: string }> = {
  connecting: { text: "connecting…", color: "#FACC15" },
  connected: { text: "connected", color: "#4ADE80" },
  reconnecting: { text: "reconnecting…", color: "#FACC15" },
  error: { text: "offline", color: "#FF6B6B" },
}

/** The card set the "jump to cards" key targets: the most recent one. */
function latestDealSet(messages: ChatMessage[]): DealSet | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const sets = messages[i]!.dealSets
    if (sets.length > 0) return sets[sets.length - 1]!
  }
  return null
}

export default function ChatPane({
  messages,
  status,
  statusDetail,
  busy,
  focus,
  onFocus,
  onSend,
  onRetry,
  onGameClickHandler,
  width,
}: ChatPaneProps) {
  const transcriptRef = useRef<ScrollBoxRenderable | null>(null)
  const inputRef = useRef<InputRenderable | null>(null)
  const [cardIndex, setCardIndex] = useState<number>(0)

  const cards = latestDealSet(messages)
  const lastCard = cards == null ? -1 : cards.deals.length - 1
  const selected = Math.min(Math.max(cardIndex, 0), Math.max(lastCard, 0))

  // Renderer-level bindings ("d" for the debug console) and the deal grid's
  // navigation both listen to every keypress, so they have to be told when the
  // input owns the keyboard.
  useEffect(() => {
    setTextCapture(focus === "input")
    return () => setTextCapture(false)
  }, [focus])

  // A new result set starts at its first card.
  useEffect(() => {
    setCardIndex(0)
  }, [cards?.toolCallId])

  // Follow the conversation as it grows, but not while the cards have focus —
  // that would fight whatever the user is browsing.
  const tail = messages[messages.length - 1]
  useEffect(() => {
    if (focus === "cards") return
    const box = transcriptRef.current
    if (box) box.scrollTo({ x: 0, y: box.scrollHeight })
  }, [messages.length, tail?.text.length, tail?.dealSets.length, focus])

  useEffect(() => {
    if (focus !== "cards" || cards == null) return
    transcriptRef.current?.scrollChildIntoView(chatCardId(cards.toolCallId, selected))
  }, [focus, cards?.toolCallId, selected])

  useKeyboard((key) => {
    // ctrl+r works from the input too — no text field binds it.
    if (key.ctrl && key.name === "r") {
      onRetry()
      return
    }
    if (focus === "input") {
      // Everything else printable belongs to the input itself.
      if (key.name === "tab") onFocus(cards == null ? "grid" : "cards")
      else if (key.name === "escape") onFocus("grid")
      return
    }
    if (focus !== "cards") return

    switch (key.name) {
      case "tab":
        onFocus("grid")
        return
      case "escape":
      case "i":
        onFocus("input")
        return
      case "r":
        onRetry()
        return
    }
    if (cards == null) return
    switch (key.name) {
      // One card per row at this width, so vertical and horizontal moves agree.
      case "up":
      case "k":
      case "left":
      case "h":
        setCardIndex(Math.max(selected - 1, 0))
        break
      case "down":
      case "j":
      case "right":
      case "l":
        setCardIndex(Math.min(selected + 1, lastCard))
        break
      case "home":
        setCardIndex(0)
        break
      case "end":
        setCardIndex(lastCard)
        break
      case "return":
        onGameClickHandler(cards.deals[selected]?.steamAppID ?? null)
        break
    }
  })

  // The input stays uncontrolled — a controlled value fights the cursor — so the
  // submitted text is read off the renderable and cleared there too.
  const handleSubmit = () => {
    const input = inputRef.current
    if (input == null) return
    onSend(input.value)
    input.value = ""
  }

  const label = STATUS_LABEL[status]
  const title = ` Deal Scout — ${label.text}${busy ? " · thinking…" : ""} `

  return (
    <box style={{ width, height: "100%", flexDirection: "column" }}>
      <scrollbox
        ref={transcriptRef}
        title={title}
        border
        borderColor={focus === "input" || focus === "cards" ? "#FACC15" : "#7CF2E4"}
        style={{ flexGrow: 1 }}
        contentOptions={{ flexDirection: "column" }}
      >
        {status !== "connected" && statusDetail != null && (
          <text wrapMode="word">
            <span fg={label.color}>{statusDetail} — ctrl+r to retry</span>
          </text>
        )}

        {messages.map((message) => (
          <box key={message.id} style={{ flexDirection: "column", marginBottom: 1 }}>
            <text>
              <span fg={message.role === "user" ? "#FACC15" : "#4ADE80"}>
                {message.role === "user" ? "you ›" : "deal scout ›"}
              </span>
            </text>

            {message.toolLines.map((line, index) => (
              <text key={index} wrapMode="word">
                <span fg="#6B7280">  ⟡ {line}</span>
              </text>
            ))}

            {message.text.length > 0 && (
              <text wrapMode="word">
                <span fg={message.failed ? "#FF6B6B" : message.local ? "#9CA3AF" : "#FFFFFF"}>
                  {message.text}
                </span>
              </text>
            )}

            {message.pending && message.text.length === 0 && (
              <text><span fg="#6B7280">  thinking…</span></text>
            )}

            {message.dealSets.map((dealSet) => (
              <ChatDealCards
                key={dealSet.toolCallId}
                dealSet={dealSet}
                selectedIndex={
                  focus === "cards" && dealSet.toolCallId === cards?.toolCallId ? selected : null
                }
                onSelect={(index) => {
                  setCardIndex(index)
                  onFocus("cards")
                }}
                onGameClickHandler={onGameClickHandler}
              />
            ))}
          </box>
        ))}
      </scrollbox>

      <box
        border
        borderColor={focus === "input" ? "#FACC15" : "#4B5563"}
        title={focus === "cards" ? " hjkl move · ⏎ details · i input " : " ⏎ send · tab cards "}
        style={{ height: 3 }}
      >
        <input
          ref={inputRef}
          placeholder="Ask about deals…"
          backgroundColor="#1a1a1a"
          focusedBackgroundColor="#2a2a2a"
          textColor="#FFFFFF"
          cursorColor="#00FF00"
          onSubmit={handleSubmit}
          focused={focus === "input"}
        />
      </box>
    </box>
  )
}
