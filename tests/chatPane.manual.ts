// Drives the real TUI headlessly against a running `wrangler dev`, so the chat
// pane can be verified without a terminal. Not a `bun test` file on purpose: it
// needs the live agent and CheapShark.
//
//   bun tests/chatPane.manual.ts
import { testRender } from "@opentui/react/test-utils"
import React from "react"
import App from "../src/App"

// The TUI now defaults to the DEPLOYED agent, so this test — which drives the
// real App against a local `wrangler dev` — has to say so. Set before render,
// not at import time: useDealScout resolves the endpoint when it mounts.
process.env.DEAL_BUSTER_AGENT_URL ??= "ws://localhost:8787/agents/deal-scout/deal-scout"

const setup = await testRender(React.createElement(App), { width: 120, height: 46 })
const { mockInput, flush, captureCharFrame } = setup

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// The deals grid renders the same card text, so every chat assertion is made
// against the chat pane's own columns only.
const CHAT_COLUMNS = 42
const chatColumn = (frame: string) =>
  frame
    .split("\n")
    .map((line) => line.slice(0, CHAT_COLUMNS))
    .join("\n")

function show(label: string) {
  console.log(`\n${"═".repeat(110)}\n${label}\n${"═".repeat(110)}`)
  console.log(captureCharFrame())
}

/** Poll real frames, yielding to the event loop so live I/O can actually land. */
async function until(label: string, predicate: (frame: string) => boolean, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await flush()
    if (predicate(captureCharFrame())) {
      show(`OK — ${label}`)
      return
    }
    await sleep(250)
  }
  show(`TIMEOUT — ${label}`)
  process.exit(1)
}

await flush()
show("1. landing screen: chat pane beside the deals grid, chat input focused")

await until("2. connected to the deal-scout agent", (f) => f.includes("Deal Scout — connected"))
await until("3. deals grid populated", (f) => f.includes("Deals in Steam store"))

// A plain text reply.
await mockInput.typeText("hi, who are you? one sentence please")
await flush()
mockInput.pressEnter()
await until("4. user message echoed + turn in flight", (f) => chatColumn(f).includes("you ›"))
await until(
  "5. text reply rendered in the transcript",
  (f) => !f.includes("thinking…") && chatColumn(f).includes("Deal Scout")
)

// A structured result: cards, not prose.
await mockInput.typeText("deals under $15")
await flush()
mockInput.pressEnter()
await until(
  "6. 'deals under $15' rendered as GameCards inside the transcript",
  (f) => chatColumn(f).includes("Sale price: $") && !f.includes("thinking…")
)

// tab hands the keyboard from the input to the latest card set.
mockInput.pressTab()
await flush()
await sleep(300)
await flush()
show("7. tab moved focus to the latest card set (heavy border = selected)")

mockInput.pressArrow("down")
await flush()
await sleep(300)
await flush()
show("8. ↓ selected the next card")

mockInput.pressEnter()
await until("9. enter on a card opened the detail view", (f) =>
  f.includes("Fetching Details") || f.includes("Genres") || f.includes("Developers")
)
await until("10. detail view loaded", (f) => !f.includes("Fetching Details"))

console.log("\nall steps passed")
process.exit(0)
