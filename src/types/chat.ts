import type { Deal } from "../api/cheapshark";

/**
 * Connection lifecycle as the chat pane reports it. `reconnecting` is a dropped
 * socket that PartySocket is already retrying on its own; `error` is a socket we
 * have not managed to open at all.
 */
export type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "error";

/**
 * One `search_deals` result, kept structured rather than flattened into the
 * reply text so the transcript can render it as the existing game cards. The
 * rows are the agent tool's own `Deal` shape — see ../api/cheapshark.
 */
export interface DealSet {
  toolCallId: string;
  deals: Deal[];
}

export type ChatRole = "user" | "agent";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  /** Structured `search_deals` results produced during this turn, in order. */
  dealSets: DealSet[];
  /** One line per tool call, shown as progress while the turn is still running. */
  toolLines: string[];
  /** The turn is still streaming — no terminal frame has arrived yet. */
  pending: boolean;
  /** The turn ended in an error frame or a dropped socket. */
  failed: boolean;
  /**
   * Written by the TUI itself (the greeting, connection notices). Local messages
   * are never sent back to the model as history.
   */
  local?: true;
}

/**
 * What the keyboard currently belongs to. Every bare-letter binding in the app
 * has to agree on this, because OpenTUI delivers keypresses to all subscribers
 * regardless of which renderable holds focus.
 */
export type PaneFocus = "input" | "cards" | "grid";
