import { useKeyboard } from "@opentui/react";
import { SORT_OPTIONS, type SortType } from "../types/sort";

interface sortBarProps {
  current: SortType,
  onChange: (sort: SortType) => void,
  page: number,
  totalPages: number,
}

export function SortBar({ current, onChange, page, totalPages }: sortBarProps) {
  useKeyboard((key) => {
    if (key.name === "tab") {
      const currentIndex = SORT_OPTIONS.indexOf(current)
      if (key.shift) {
        const prev = SORT_OPTIONS[(currentIndex - 1 + SORT_OPTIONS.length) % SORT_OPTIONS.length]
        if (prev) onChange(prev)
      } else {
        const next = SORT_OPTIONS[(currentIndex + 1) % SORT_OPTIONS.length]
        if (next) onChange(next)
      }
    }
  })
  return (
    <box
      border
      title="Sort by"
      style={{
        width: "100%",
        height: 3,
        flexDirection: "row",
        paddingLeft: 1,
        paddingRight: 1,
        gap: 2,
      }}
    >
      {SORT_OPTIONS.map((val) => (
        <text key={val} >
          {val === current
            ? <span fg="#FACC15">{`[${val}]`}</span>
            : <span>{val}</span>
          }
        </text>
      ))}

      <text>
        <span fg="#6B7280">{`‹tab› ‹⇧tab›`}</span>
      </text>

      {/* Pushes the page counter to the right edge of the bar. */}
      <box style={{ flexGrow: 1 }} />
      <text>
        {/* Pages are 0-indexed internally, 1-indexed for humans. */}
        <span fg="#4682A1">{`Page ${page + 1}/${totalPages}`}</span>
      </text>
    </box>
  )
}
