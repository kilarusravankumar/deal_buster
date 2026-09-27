import { ConsolePosition, createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import App from "./src/App"
import { isTextCapturing } from "./src/util/keyCapture"

const renderer = await createCliRenderer({
  exitOnCtrlC: true,
  backgroundColor: "#1131E9",
  consoleOptions: {
    position: ConsolePosition.BOTTOM,
    sizePercent: 30,
  }
})

function toggleConsole() {
  if (renderer.console.visible) {
    renderer.console.hide()
  } else {
    renderer.console.show()
  }
}

renderer.keyInput.on("keypress", (key) => {
  // ctrl+d works everywhere, including from the chat input: the chat pane starts
  // with the keyboard, so a bare-letter-only toggle would be unreachable exactly
  // when the agent trace is wanted. (It does not exit — exitOnCtrlC covers that.)
  if (key.ctrl && key.name === "d") {
    toggleConsole()
    return
  }
  // A focused text field still sees every renderer-level binding, so "d" must
  // not toggle the debug console mid-sentence.
  if (isTextCapturing()) return
  if (key.name === "d") toggleConsole()
})

createRoot(renderer).render(<App />)
