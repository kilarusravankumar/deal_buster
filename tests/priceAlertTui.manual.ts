// Does a price-alert broadcast render in the real TUI transcript?
import { testRender } from "@opentui/react/test-utils"
import React from "react"
import { AgentClient } from "agents/client"
import App from "../src/App"
import { getCurrentPrice, searchDeals } from "../src/api/cheapshark"

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const { flush, captureCharFrame } = await testRender(React.createElement(App), { width: 120, height: 46 })
const chat = (f: string) => f.split("\n").map((l) => l.slice(0, 42)).join("\n")

async function until(label: string, pred: (f: string) => boolean, ms = 90_000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    await flush()
    if (pred(captureCharFrame())) { console.log(`OK — ${label}`); return }
    await sleep(250)
  }
  console.log(`TIMEOUT — ${label}`)
  console.log(chat(captureCharFrame()))
  process.exit(1)
}

await until("TUI connected", (f) => f.includes("Deal Scout — connected"))

// Seed a fresh, never-alerted watch over a second connection.
const seeder = new AgentClient({ host: "localhost:8787", agent: "deal-scout", name: "deal-scout" })
await seeder.ready
const [deal] = await searchDeals({ maxPrice: 15, limit: 1 })
const live = await getCurrentPrice(deal!.gameID)
await sleep(500)
seeder.setState({
  ...(seeder.state as Record<string, unknown>),
  watches: [{ gameID: live!.gameID, title: live!.title, targetPrice: live!.salePrice + 5, addedAt: new Date().toISOString() }],
  prefs: { maxPrice: null, alertsEnabled: true }
} as never)
await sleep(1500)

const res = await fetch("http://localhost:8787/dev/price-check", {
  method: "POST", headers: { "x-dev-token": process.env.DEV_TRIGGER_TOKEN ?? "" }
})
console.log(`trigger → ${res.status} ${(await res.text()).replace(/\s+/g, " ")}`)

await until("price alert rendered in the TUI transcript", (f) => chat(f).includes("💰"))
// Show the alert as the user sees it, wherever it landed in the transcript.
const lines = chat(captureCharFrame()).split("\n")
const at = lines.findIndex((l) => l.includes("💰"))
console.log("\n" + lines.slice(Math.max(at - 2, 0), at + 6).join("\n"))
process.exit(0)
