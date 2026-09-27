import type { PaneFocus } from "../types/chat"

interface HelpBarProps {
  focus: PaneFocus,
}

export function HelpBar({ focus }: HelpBarProps) {
  return (
    <box
      border
      style={{
        width: "100%",
        height: 1,
        flexDirection: "row",
        paddingLeft: 1,
        paddingRight: 1,
        gap: 2,
      }}
    >
      {focus === "input" ? (
        <text>
          <span fg="#6B7280">{"⏎"}</span>
          <span fg="#9CA3AF">{" Send"}</span>
          <span fg="#6B7280">{"   tab"}</span>
          <span fg="#9CA3AF">{" Cards/grid"}</span>
          <span fg="#6B7280">{"   esc"}</span>
          <span fg="#9CA3AF">{" Grid"}</span>
          <span fg="#6B7280">{"   ctrl+r"}</span>
          <span fg="#9CA3AF">{" Reconnect"}</span>
        </text>
      ) : (
        <text>
          <span fg="#6B7280">{"←↑↓→"}</span>
          <span fg="#6B7280">{" or "}</span>
          <span fg="#6B7280">{"h/j/k/l"}</span>
          <span fg="#9CA3AF">{" Move"}</span>
          <span fg="#6B7280">{"   ⏎"}</span>
          <span fg="#9CA3AF">{" Details"}</span>
          <span fg="#6B7280">{"   tab"}</span>
          <span fg="#9CA3AF">{focus === "cards" ? " Grid" : " Sort"}</span>
          <span fg="#6B7280">{"   i"}</span>
          <span fg="#9CA3AF">{" Chat"}</span>
          <span fg="#6B7280">{"   /"}</span>
          <span fg="#9CA3AF">{" Search"}</span>
        </text>
      )}
    </box>
  )
}
