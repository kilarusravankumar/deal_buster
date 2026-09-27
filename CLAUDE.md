
Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Frontend

Use HTML imports with `Bun.serve()`. Don't use `vite`. HTML imports fully support React, CSS, Tailwind.

Server:

```ts#index.ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // optional websocket support
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // handle close
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

HTML files can import .tsx, .jsx or .js files directly and Bun's bundler will transpile & bundle automatically. `<link>` tags can point to stylesheets and Bun's CSS bundler will bundle.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

With the following `frontend.tsx`:

```tsx#frontend.tsx
import React from "react";
import { createRoot } from "react-dom/client";

// import .css files directly and it works
import './index.css';

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

Then, run index.ts

```sh
bun --hot ./index.ts
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.mdx`.

## Agentic capabilities

Goal: extend my existing TUI app **Deal Buster** (current project you are in) into an agentic app running on Cloudflare.

### current plan and agentic requirements

1. **LLM** — Llama 3.3 on Workers AI (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`), with tool calling
2. **Workflow / coordination** — Durable Objects (Agents SDK) + Cloudflare Workflows
3. **User input via chat or voice** — TUI chat (primary) + minimal web chat (fallback)
4. **Memory / state** — single shared agent, JSON state via `this.setState()`

## Architecture

```
TUI (Bun, OpenTUI)  ─┐
                     ├─ WebSocket (AgentClient from agents/client) ─► Worker
Web chat (fallback) ─┘                                                  │
                                                                        ▼
                                         DealAgent (Durable Object, single instance "default")
                                           ├─ setState JSON: watchlist, thresholds, liked/rejected games + tags, prefs
                                           ├─ Workers AI: Llama 3.3 + tools
                                           └─ schedule("every 24h") ─► PriceCheckWorkflow
                                                                        ├─ step: load watches
                                                                        ├─ step: fetch CheapShark prices
                                                                        ├─ step: compare to thresholds
                                                                        ├─ step: LLM writes alert text
                                                                        ├─ step: notify agent → push alert over WebSocket
                                                                        └─ step: send email to env.NOTIFY_EMAIL
```

### Cloudflare pieces

- **Workers** — entry point, routes to the single `deal-scout` agent
- **Agents SDK / Durable Objects** — `DealScout`: chat loop, tools, state, scheduling
- **Workers AI** — Llama 3.3 (chat + tools); Whisper only if voice stretch goal happens
- **Workflows** — `PriceCheckWorkflow`, durable per-step retries
- **Static assets on Workers** — minimal web chat from the agents-starter template
- **Wrangler** — `wrangler dev` / `wrangler deploy`, config in `wrangler.jsonc`
- **Email** — `send_email` binding (needs domain on Cloudflare + Email Routing, verified destination) OR Resend via fetch. TBD.
- **Secrets** — `NOTIFY_EMAIL` (and `RESEND_API_KEY` if used) via `wrangler secret put`; never stored in agent state
- Skip: SQL (no `this.sql`), D1, Vectorize, KV (unless caching CheapShark), Realtime

### CheapShark

Deal Buster is Steam-only: every CheapShark deals request must pass `storeID=1`
(Steam). The TUI already does this in `src/getDeals.ts`, and the agent tools must
do the same — no other store IDs.

### Tools (agent)

- `search_deals` (query, max price, sort) — CheapShark, `storeID=1`
- `get_game_details` — Steam appdetails (genres/categories used for similarity)
- `add_watch` / `list_watches` / `remove_watch` (game, price threshold)
- `record_preference` (liked / disliked game → stores its tags)
- `recommend_similar` — agent reasons over stored liked tags + current deals
Recommendations return **structured results** (not just text) so the TUI renders them as its existing game cards; Enter still opens the detail view.

## TUI changes

- Landing screen: chat pane above/beside the deals grid. Agent greets : "What type of games do you like genre or I can help you identify the genre"
- No per-user identity: TUI always connects to the agent named `deal-scout` (single-owner app)
- Deployed agent URL baked into the build; GitHub Action builds `bun build --compile` binaries for Linux/macOS into Releases
- Stretch (Sunday, only if ahead): push-to-talk voice — `v` records via sox/ffmpeg → audio over WS → Whisper on Workers AI. No TTS.

## store prompt history in PROMPTS.MD
