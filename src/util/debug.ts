// Tracing for the chat pane. Two sinks, because the two failure modes need
// different ones:
//
//   - `console.log` lands in OpenTUI's debug console ("d", or ctrl+d while the
//     chat input has the keyboard), which is how you watch a turn live.
//   - `DEALSCOUT_DEBUG_LOG=/path/to/file` also appends every line to that file,
//     which is how you read back what happened in a real terminal session after
//     the fact — the console pane is ephemeral and scrolls away.
//
// Off unless DEALSCOUT_DEBUG is set (any value) or a log file is named, so a
// normal run is not slowed down or spammed.

const LOG_FILE = process.env.DEALSCOUT_DEBUG_LOG ?? null
export const DEBUG = LOG_FILE != null || process.env.DEALSCOUT_DEBUG != null

let sink: ReturnType<ReturnType<typeof Bun.file>["writer"]> | null = null

function fileSink() {
  if (LOG_FILE == null) return null
  // Created on first write, not at import: an unused log file should not appear.
  if (sink == null) sink = Bun.file(LOG_FILE).writer()
  return sink
}

/** Keep a frame dump readable — the tool results are large. */
export function truncate(value: unknown, max = 600): string {
  const text = typeof value === "string" ? value : JSON.stringify(value)
  if (text == null) return String(value)
  return text.length <= max ? text : `${text.slice(0, max)}… (+${text.length - max} chars)`
}

/**
 * One trace line. `tag` is the subsystem, e.g. "ws" or "turn", so the console can
 * be read with the eye instead of grep.
 */
export function dlog(tag: string, ...args: unknown[]): void {
  if (!DEBUG) return
  const stamp = new Date().toISOString().slice(11, 23)
  const parts = args.map((arg) => (typeof arg === "string" ? arg : truncate(arg)))
  const line = `[${stamp}] [${tag}] ${parts.join(" ")}`
  console.log(line)
  const out = fileSink()
  if (out != null) {
    out.write(`${line}\n`)
    // Flushed per line on purpose: a crash or a ctrl+c must not lose the last
    // thing that happened, which is exactly the line you need.
    out.flush()
  }
}
