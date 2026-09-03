import { useKeyboard } from "@opentui/react"
import { useState } from "react"

interface searchBarProps {
  searchString: string,
  onSearchString: (search: string) => void
  showToggle: (show: boolean) => void
}

export default function SearchBar({ searchString, onSearchString, showToggle }: searchBarProps) {
  const [search, setSearch] = useState(searchString)

  const handleSubmit = () => {
    console.log("submitting -->", search)
    onSearchString(search)
  }

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
