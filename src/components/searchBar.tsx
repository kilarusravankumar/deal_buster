import { useKeyboard } from "@opentui/react"
import { useEffect, useState } from "react"
import { setTextCapture } from "../util/keyCapture"

interface searchBarProps {
  searchString: string,
  onSearchString: (search: string) => void
  showToggle: (show: boolean) => void
}

export default function SearchBar({ searchString, onSearchString, showToggle }: searchBarProps) {
  const [search, setSearch] = useState(searchString)

  const handleSubmit = () => {
    onSearchString(search)
  }

  // Bare-letter bindings elsewhere (the debug console's "d") see every keypress
  // regardless of focus, so the bar has to claim the keyboard while it is open.
  useEffect(() => {
    setTextCapture(true)
    return () => setTextCapture(false)
  }, [])

  // "q" would be swallowed out of any title being typed, so escape is the
  // only way out of the bar.
  useKeyboard(key => {
    if (key.name === "escape") showToggle(false)
  })


  return (
    <box border >
      <input id="search-input"
        width={30}
        placeholder="Search by Game name ..."
        backgroundColor="#1a1a1a"
        focusedBackgroundColor="#2a2a2a"
        textColor={"#FFFFFF"}
        cursorColor="#00FF00"
        onInput={setSearch}
        onSubmit={handleSubmit}
        focused
      >
      </input>
    </box>
  )
}
