// A focused OpenTUI input consumes the keys it cares about, but every keypress
// still reaches renderer-level listeners and every `useKeyboard` subscriber —
// they are wired to the renderer's key input, not to the focus tree. So anything
// that binds a bare letter has to ask whether a text field is currently
// swallowing input, or typing "d" into the chat box would toggle the debug
// console and "h" would move the deal grid's selection.

let capturing = false

/** Called by a text field as it gains and loses focus. */
export function setTextCapture(active: boolean): void {
  capturing = active
}

/** True while a text field has focus and should own every printable key. */
export function isTextCapturing(): boolean {
  return capturing
}
