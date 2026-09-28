# Deal Buster

Hunt Steam deals from your terminal.

Deal Buster is a fast, keyboard-driven terminal app for browsing Steam sales — no bloated storefront, no mouse, no noise. Games on sale show up as a grid of cards you can sort and dig into. And it's more than a browser now: built in is **Deal Scout**, an AI agent you can just talk to. Ask what's on sale, tell it to watch a game, and it'll email you when the price drops.

## Install

Deal Buster runs on [Bun](https://bun.com). Install Bun, then:

```sh
bun install
bun start                    # or: bun run index.tsx
```

That's it — the app ships pointed at the hosted Deal Scout agent, so the chat works out of the box with no configuration or API keys.

Use a graphics-capable terminal for the full experience. Deal Buster renders real game cover art in the deal cards and detail views, which needs a terminal that supports the Kitty graphics protocol — Ghostty (recommended), Kitty, or WezTerm. It still runs fine in other terminals; you just won't see the artwork.

Prefer a standalone binary? The agent URL is baked in, so a compiled build just runs:

```sh
bun run build:tui
./deal-buster
```

**Don't want to install anything?** Deal Scout is also hosted as a web chat — same agent, same watchlist, nothing to set up:

> **[▶ Open Deal Scout in your browser](https://deal-buster-agent.kilarusravankumar.workers.dev/)**

Use the terminal app for the full deal-browsing experience; use the link when you just want to ask the agent something quickly.

## What it does

**Browse deals in the terminal.** A scrollable grid of game cards — title, sale price, original price, savings, rating, release date. Sort by price, savings, deal rating, Metacritic, reviews, and more from a bottom bar; sorting happens server-side so it stays fast. Enter opens a detail view with the header image, description, developer, and platform info from Steam.

**Or just ask.** "Best deals under $10." "Any deals on Hades?" "Well-reviewed RPGs under $20." Deal Scout turns plain language into the right search and shows you real, current deals — as cards in the terminal, inline in the web chat.

**Straight answers about genre.** Steam's deal feed doesn't carry genre, so most tools guess. Deal Scout doesn't — it pulls the real genres from Steam and only calls a game a roguelike if Steam agrees. If it hasn't checked, it says so instead of making it up.

**Watch games and get alerted.** "Watch The Witcher 3 and tell me when it's under $30." Deal Scout remembers your watchlist, checks prices on a schedule, and emails you when something drops — with a short note on *why* it's a good deal. The alert lands in your chat too if you're connected.

## How it works

Deal Scout runs entirely on Cloudflare's edge — no servers to manage, and it keeps working whether or not anyone's connected. The terminal app and the web chat both talk to the same agent over a WebSocket, so your watchlist and history are the same wherever you reach it from.

```
┌─────────────┐        ┌─────────────┐
│  Terminal   │        │  Web chat   │
│  (Bun/TUI)  │        │  (browser)  │
└──────┬──────┘        └──────┬──────┘
       │      WebSocket       │
       └──────────┬───────────┘
                  ▼
        ┌───────────────────┐
        │    Deal Scout     │   Durable Object — durable per-session
        │                   │   identity, state, and scheduling
        │  ├ Llama 3.3      │   Workers AI (tool-calling)
        │  ├ tools ─────────┼─► CheapShark (deals) · Steam (genres)
        │  ├ memory         │   watchlist · preferences · genre cache
        │  └ daily check ───┼─► Price-Check Workflow
        └───────────────────┘         ├ fetch current prices
                                       ├ compare to your targets
                                       ├ Llama writes the alert
                                       └ email + in-chat ping
```

- **Workers AI (Llama 3.3, `@cf/meta/llama-3.3-70b-instruct-fp8-fast`)** — understands requests and calls tools. It never touches an API or database directly; it asks, the agent executes.
- **Durable Object** — the agent itself: one durable object holding the conversation, watchlist, preferences, and a cache of game genres, surviving restarts.
- **Cloudflare Workflow** — the price checker. Each step (fetch, compare, write, notify) retries on its own, so a flaky upstream never loses an alert.
- **Scheduling** — a daily alarm kicks off the workflow; a dev endpoint triggers it on demand.
- **Static assets** — the web chat, served from the same Worker.

Deals come from [CheapShark](https://apidocs.cheapshark.com/), genre and detail data from the Steam store API. Prices are Steam-store only, on purpose.

## Pointing the terminal app elsewhere

The TUI ships aimed at the hosted agent. To point it at a local agent instead:

```sh
bun run index.tsx --local    # ws://localhost:8787
DEAL_BUSTER_AGENT_URL=ws://host:port/agents/deal-scout/deal-scout bun start
```

## Run the agent yourself

The agent is a Cloudflare Worker. With [Wrangler](https://developers.cloudflare.com/workers/wrangler/) installed and `wrangler login` done:

```sh
bun install
bun run agent:dev            # local, on http://localhost:8787
bun run agent:deploy         # to your own *.workers.dev
```

Price-drop emails go through [Resend](https://resend.com). Set the secrets (and a `.dev.vars` file with the same keys for local runs):

```sh
wrangler secret put RESEND_API_KEY     # your Resend key
wrangler secret put NOTIFY_EMAIL       # where alerts go
wrangler secret put DEV_TRIGGER_TOKEN  # guards the manual price-check route
```

No API keys are needed for the deal data itself — CheapShark and the Steam store are public. The agent's secrets live on the Worker, never in the clients.

## Under the hood

- **Frontend:** OpenTUI + React on [Bun](https://bun.com) (terminal), a lightweight web chat (browser)
- **Agent:** Cloudflare Workers, Durable Objects, Workflows, Workers AI, Wrangler
- **Data:** CheapShark (deals), Steam store API (genres, details)
- **Email:** Resend

State is stored as JSON on the Durable Object — watchlist, preferences, and a genre cache — so there's no separate database to run.

## Known limits

- **Genres are as precise as Steam's are.** Steam's genre field is coarse (Action, RPG, Indie…). Community tags like *roguelike* or *soulslike* aren't in it, so Deal Scout can confirm "Action/RPG" but not "roguelike" from Steam alone.
- **Alerts favor never-duplicate over never-lose.** If an email fails after the price has been marked as notified, that one alert is dropped rather than risk sending it twice.
- **A watched game re-alerts only on a new low**, not every time it sits under your target — so you're not pinged daily about the same price.

## Roadmap

- Similar-game recommendations that learn from what you like
- Per-user accounts (each person's own watchlist and alerts)
- Richer terminal detail views fed from the agent

---

Built largely through AI-assisted development; the full prompt history lives in [PROMPTS.md](./PROMPTS.md).

MIT licensed.
