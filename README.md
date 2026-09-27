# Deal Buster

A terminal-based Steam deals browser. Find discounted games, sort by what matters to you, and dig into game details — all without leaving your terminal.

## Why

Steam sales are great, but browsing deals means opening a browser, loading a bloated storefront, and scrolling through pages of noise. Deal Buster puts that workflow where it belongs for terminal-native people: right in the terminal, keyboard-driven, fast, and distraction-free.

## What it does

**Browse deals at a glance.** Games on sale are displayed in a grid of cards showing the title, sale price, original price, savings percentage, release date, and community rating — everything you need to decide if a deal is worth a closer look.

**Sort the way you want.** A bottom bar (htop/btop-style) lets you cycle through sort options with a keypress: by price, savings, deal rating, Metacritic score, title, reviews, release date, and more. The sort happens server-side so results are fast regardless of how many deals are out there.

**Dive into details.** Select any game card to open a detail view with the header image, full description, developer and publisher info, platform support, and total recommendations — pulled directly from the Steam store API.

**Paginated, not overwhelming.** Deals load a page at a time. Scroll through what's there, load more when you want it. No waiting for thousands of results to arrive before you can start browsing.

## What it looks like

The main screen is a scrollable grid of game cards with cover art, pricing, and ratings. The bottom bar shows the current sort and available controls. Selecting a card opens a side-by-side detail view: game image on the left, full info on the right with the description rendered as formatted text.

All keyboard-driven. Arrow keys navigate the grid, Enter opens details, Escape goes back, Tab cycles sort options.

## Getting started

Deal Buster runs on [Bun](https://bun.com). Install it first, then clone the repo and install dependencies:

```sh
bun install
```

### Run

```sh
bun run index.tsx
```

Or via the package script:

```sh
bun start
```

The chat pane talks to the deployed Deal Scout agent, so this needs no
configuration. To point it somewhere else — a local `wrangler dev`, say:

```sh
bun run index.tsx --local                  # ws://localhost:8787
bun run index.tsx --agent-url ws://host:port/agents/deal-scout/deal-scout
DEAL_BUSTER_AGENT_URL=ws://localhost:8787/agents/deal-scout/deal-scout bun start
```

The chat pane's title names the endpoint whenever it is not the deployed one, so
a local session is never mistaken for a production one. Press `d` (or `ctrl+d`
while typing) for the debug console, and set `DEALSCOUT_DEBUG_LOG=/tmp/ds.log` to
trace the agent connection to a file.

### Develop

Hot reload on file changes:

```sh
bun dev
```

(equivalent to `bun --hot index.tsx`)

### Build

Compile to a standalone executable:

```sh
bun run build:tui       # bun build --compile index.tsx --outfile deal-buster
./deal-buster
```

The deployed agent URL is a literal in `src/util/agentTarget.ts`, so it is baked
into the executable: a downloaded binary connects with zero configuration, and
still accepts `--local` / `--agent-url` / `DEAL_BUSTER_AGENT_URL`.

No API keys are required — deals and game details come from public endpoints, and
the agent's own secrets live on the Worker, never in the client.

## Status

Under active development. Core browsing, sorting, and detail views are functional. Planned additions include filtering (by price range, rating, store), search, and wishlist tracking.
