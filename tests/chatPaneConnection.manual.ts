// Connection-state checks for the chat pane, without needing the real agent:
//
//   bun tests/chatPaneConnection.manual.ts dead   — port never connects
//   bun tests/chatPaneConnection.manual.ts drop   — accepts, then drops mid-turn
//   bun tests/chatPaneConnection.manual.ts empty  — answers with a bare terminal
//                                                   frame (the model sometimes
//                                                   returns nothing at all)
//
// None of them may take the TUI down. Not a `bun test` file — it renders the
// whole app and still hits CheapShark for the deal grid.
import { testRender } from "@opentui/react/test-utils"
import React from "react"

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Accepts any upgrade, then behaves per `mode`. */
function stubAgent(port: number, mode: "drop" | "empty") {
  return Bun.serve({
    port,
    fetch(request, server) {
      if (server.upgrade(request)) return undefined
      return new Response("stub", { status: 404 })
    },
    websocket: {
      open(ws) {
        if (mode === "drop") setTimeout(() => ws.close(1011, "stub agent went away"), 3000)
      },
      message(ws, raw) {
        if (mode !== "empty" || typeof raw !== "string") return
        const frame = JSON.parse(raw)
        if (frame.type !== "cf_agent_use_chat_request") return
        // A finished turn carrying neither text nor a tool result.
        ws.send(JSON.stringify({ type: "cf_agent_use_chat_response", id: frame.id, done: true }))
      }
    }
  })
}

const mode = process.argv[2] ?? "dead"
let server: ReturnType<typeof stubAgent> | null = null
if (mode === "drop" || mode === "empty") {
  server = stubAgent(8799, mode)
  process.env.AGENT_HOST = "localhost:8799"
} else {
  // Port 9 (discard) refuses the upgrade outright.
  process.env.AGENT_HOST = "localhost:9"
}

// Imported after AGENT_HOST is set — the hook reads it at module load.
const { default: App } = await import("../src/App")
const { mockInput, flush, captureCharFrame } = await testRender(React.createElement(App), {
  width: 120,
  height: 22
})

const settle = async (seconds: number) => {
  for (let i = 0; i < seconds * 4; i++) {
    await flush()
    await sleep(250)
  }
}

await settle(mode === "drop" ? 6 : 4)
await mockInput.typeText("anyone there?")
await flush()
mockInput.pressEnter()
await settle(mode === "drop" ? 8 : 3)

console.log(`\n── mode: ${mode} ──`)
console.log(captureCharFrame().split("\n").slice(0, 14).join("\n"))
server?.stop(true)
process.exit(0)
