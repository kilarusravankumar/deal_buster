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

renderer.keyInput.on("keypress", (key) => {
  // A focused text field still sees every renderer-level binding, so "d" must
  // not toggle the debug console mid-sentence.
  if (isTextCapturing()) return
  if (key.name === "d") {
    if (renderer.console.visible) {
      renderer.console.hide()
    } else {
      renderer.console.show()
    }
  }
})

createRoot(renderer).render(<App />)
