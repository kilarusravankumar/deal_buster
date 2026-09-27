// A prompt the model reliably answers with nothing must render as an explicit
// notice, not a blank reply. Needs a running `wrangler dev`.
//
//   bun tests/chatPaneEmpty.manual.ts
import { testRender } from "@opentui/react/test-utils"
import React from "react"
import App from "../src/App"

const { mockInput, flush, captureCharFrame } = await testRender(React.createElement(App), {
  width: 120,
  height: 20
})
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const settle = async (seconds: number) => {
  for (let i = 0; i < seconds * 4; i++) {
    await flush()
    await sleep(250)
  }
}

await settle(4)
await mockInput.typeText("deals on top reviewed games?")
await flush()
mockInput.pressEnter()
await settle(30)

console.log(
  captureCharFrame()
    .split("\n")
    .map((line) => line.slice(0, 42))
    .slice(0, 16)
    .join("\n")
)
process.exit(0)
