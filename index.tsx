import { ConsolePosition, createCliRenderer } from "@opentui/core"
import { createRoot, useKeyboard } from "@opentui/react"
import { useEffect, useState } from "react"
import GameGrid from "./src/components/GameGrid"
import useDeals from "./src/hooks/useDeals"
import { MAX_PAGE_SIZE, type DealFilters } from "./src/types/params"
import useSteamGameDetails from "./src/hooks/useSteamGameDetails"
import { GameDetailView } from "./src/components/GameDetails"
import { SortBar } from "./src/components/SortBar"
import type { SortType } from "./src/types/sort"
import SearchBar from "./src/components/searchBar"

type viewTypes = "grid" | "detail"
interface AppState {
  view: viewTypes,
  steamAppID: string,
  selectedIndex: number,
  params: DealFilters,
}
// lets get 50 games 
// and 
function App() {
  const [appState, setAppState] = useState<AppState>({
    view: "grid",
    steamAppID: "",
    selectedIndex: 0,
    params: {
      pageSize: MAX_PAGE_SIZE,
      onlyAAA: false,
      sortBy: "Price"
    },
  })

  const [showSearch, setShowSearch] = useState<boolean>(false)
  const [search, setSearch] = useState<string>("")
  useKeyboard((key) => {
    if (key.name === "/") {
      setShowSearch(true)
    }
  })


  const onGameClickHandler = (steamAppID: string) => {
    if (steamAppID && steamAppID.length > 1) {
      setAppState({ ...appState, steamAppID, view: "detail" })
    }
  }

  const onSelectedIndexChange = (selectedIndex: number) => {
    setAppState((prev) => ({ ...prev, selectedIndex }))
  }

  const onBackHandler = () => {
    setAppState({ ...appState, steamAppID: "", view: "grid" })
  }

  const onChangeSortParam = (sortField: SortType) => {
    // The ordering changes underneath us, so the old index is meaningless.
    setAppState((prev) => ({
      ...prev,
      selectedIndex: 0,
      params: { ...prev.params, sortBy: sortField },
    }))
  }

  const { games, loading: dealsLoading, err, page, totalPages, hasMore, loadMore } = useDeals(appState.params)
  const { gameDetails, loading: detailsLoading } = useSteamGameDetails(appState.steamAppID)

  if (appState.view === "detail") {
    if (detailsLoading || gameDetails == null) {
      return <box>
        <text>
          <span fg="#4682A1">Fetching Details.......</span>
        </text>
      </box>
    }
    return (
      <GameDetailView gameDetails={gameDetails} onBack={onBackHandler} />
    )
  }

  if (dealsLoading && games.length === 0) {
    return <box>
      <text>
        <span fg="#4682A1">Fetching Deals.......</span>
      </text>
    </box>
  }
  if (err != null) {
    return <box >
      <text><span fg="#FF0000">{err}</span></text>
    </box>
  }

  const onSearchStringChange = (searchInput: string) => {
    setSearch(searchInput)
  }

  if (showSearch) {
    return (<box>
      <SearchBar searchString="" onSearchString={onSearchStringChange} showToggle={setShowSearch} />
    </box>)
  }
  return (
    <box>
      <GameGrid
        games={games}
        onGameClickHandler={onGameClickHandler}
        selectedIndex={appState.selectedIndex}
        onSelectedIndexChange={onSelectedIndexChange}
        loading={dealsLoading}
        hasMore={hasMore}
        onLoadMore={loadMore}
        resetKey={appState.params.sortBy}
      />
      <SortBar
        current={appState.params.sortBy}
        onChange={onChangeSortParam}
        page={page}
        totalPages={totalPages}
      />
    </box>

  )
}

const renderer = await createCliRenderer({
  exitOnCtrlC: true,
  backgroundColor: "#1131E9",
  consoleOptions: {
    position: ConsolePosition.BOTTOM,
    sizePercent: 30,
  }
})

renderer.keyInput.on("keypress", (key) => {
  if (key.name === "d") {
    if (renderer.console.visible) {
      renderer.console.hide()
    } else {
      renderer.console.show()
    }
  }

})



createRoot(renderer).render(<App />)
