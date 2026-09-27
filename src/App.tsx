import { useKeyboard, useTerminalDimensions } from "@opentui/react"
import { useState } from "react"
import GameGrid from "./components/GameGrid"
import useDeals from "./hooks/useDeals"
import { MAX_PAGE_SIZE, type DealFilters } from "./types/params"
import useSteamGameDetails from "./hooks/useSteamGameDetails"
import { GameDetailView } from "./components/GameDetails"
import { SortBar } from "./components/SortBar"
import { HelpBar } from "./components/HelpBar"
import type { SortType } from "./types/sort"
import SearchBar from "./components/searchBar"
import SearchResults from "./components/SearchResults"
import ChatPane from "./components/ChatPane"
import useDealScout from "./hooks/useDealScout"
import type { PaneFocus } from "./types/chat"
import { isTextCapturing } from "./util/keyCapture"

type viewTypes = "grid" | "detail"
interface AppState {
  view: viewTypes,
  steamAppID: string,
  selectedIndex: number,
  params: DealFilters,
}

// Wide enough for a 30-column GameCard plus the transcript's border, scrollbar
// and a little prose room.
const CHAT_PANE_WIDTH = 42
// A GameCard (30) plus its margin, the grid's border and its scrollbar.
const GRID_MIN_WIDTH = 34

export default function App() {
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
  // The landing screen hands the keyboard to the chat, so the agent's greeting
  // can be answered without pressing anything first.
  const [focus, setFocus] = useState<PaneFocus>("input")

  const { width: termWidth } = useTerminalDimensions()
  // Side by side while both panes can hold a card; stacked otherwise, so the
  // deal grid never disappears just because the terminal is narrow.
  const sideBySide = termWidth >= CHAT_PANE_WIDTH + GRID_MIN_WIDTH

  const chat = useDealScout()

  const onGameClickHandler = (steamAppID: string | null) => {
    // Search results can have no Steam entry at all, so there are no details.
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

  // Only the grid owns these; ChatPane handles the input and card bindings, and
  // both the detail view and the search views replace the screen entirely.
  const gridKeysLive = appState.view === "grid" && !showSearch && search.trim().length === 0

  useKeyboard((key) => {
    if (!gridKeysLive || isTextCapturing() || focus !== "grid") return
    switch (key.name) {
      // Not tab: the sort bar already owns that while the grid has the keyboard.
      case "i":
      case "escape":
        setFocus("input")
        break
      case "/":
        setShowSearch(true)
        break
    }
  })

  const {
    games, loading: dealsLoading, err, page, totalPages, hasMore, loadMore,
    results, searchLoading, searchErr,
  } = useDeals(appState.params, search)
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

  const onSearchStringChange = (searchInput: string) => {
    setSearch(searchInput)
    setShowSearch(false)
  }

  const onClearSearch = () => {
    setSearch("")
  }

  if (showSearch) {
    return (<box>
      <SearchBar searchString={search} onSearchString={onSearchStringChange} showToggle={setShowSearch} />
    </box>)
  }

  // A live query replaces the deal grid entirely — the games endpoint returns a
  // different shape, so it gets its own view.
  if (search.trim().length > 0) {
    return (
      <box>
        <SearchResults
          results={results}
          search={search.trim()}
          onGameClickHandler={onGameClickHandler}
          loading={searchLoading}
          err={searchErr}
          onClear={onClearSearch}
        />
      </box>
    )
  }

  // The grid's own loading and error states stay inside its half of the split,
  // so the chat pane is usable while CheapShark is still answering.
  const dealsColumn = (() => {
    if (err != null) {
      return (
        <box style={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }} border>
          <text><span fg="#FF0000">{err}</span></text>
        </box>
      )
    }
    if (dealsLoading && games.length === 0) {
      return (
        <box style={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }} border>
          <text><span fg="#4682A1">Fetching Deals.......</span></text>
        </box>
      )
    }
    return (
      <box style={{ flexGrow: 1, flexDirection: "column" }}>
        <GameGrid
          games={games}
          onGameClickHandler={onGameClickHandler}
          selectedIndex={appState.selectedIndex}
          onSelectedIndexChange={onSelectedIndexChange}
          loading={dealsLoading}
          hasMore={hasMore}
          onLoadMore={loadMore}
          resetKey={appState.params.sortBy}
          focused={focus === "grid"}
        />
        <SortBar
          current={appState.params.sortBy}
          onChange={onChangeSortParam}
          page={page}
          totalPages={totalPages}
          focused={focus === "grid"}
        />
      </box>
    )
  })()

  return (
    <box style={{ width: "100%", height: "100%", flexDirection: "column" }}>
      <box
        style={{
          flexGrow: 1,
          flexDirection: sideBySide ? "row" : "column",
        }}
      >
        <ChatPane
          messages={chat.messages}
          target={chat.target}
          status={chat.status}
          statusDetail={chat.statusDetail}
          busy={chat.busy}
          focus={focus}
          onFocus={setFocus}
          onSend={chat.send}
          onRetry={chat.retry}
          onGameClickHandler={onGameClickHandler}
          width={sideBySide ? CHAT_PANE_WIDTH : "100%"}
        />
        {dealsColumn}
      </box>
      <HelpBar focus={focus} />
    </box>
  )
}
