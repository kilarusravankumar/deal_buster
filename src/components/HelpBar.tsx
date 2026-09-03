export function HelpBar() {
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
      <text>
        <span fg="#6B7280">{"←↑↓→"}</span>
        <span fg="#6B7280">{" or "}</span>
        <span fg="#6B7280">{"h/j/k/l"}</span>
        <span fg="#9CA3AF">{" Move"}</span>
      </text>

      <text>
        <span fg="#6B7280">{"/"}</span>
        <span fg="#9CA3AF">{" Search"}</span>
      </text>
    </box>
  )
}
