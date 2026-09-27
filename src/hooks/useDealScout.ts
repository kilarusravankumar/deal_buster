import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AgentClient } from "agents/client"
import type { Deal } from "../api/cheapshark"
import type { ChatMessage, ConnectionStatus, DealSet } from "../types/chat"

// The same host, agent and instance name tests/chat.ts connects to: one shared
// agent, no per-user identity. `AGENT_HOST` is how a deployed URL gets baked in.
const AGENT_HOST = process.env.AGENT_HOST ?? "localhost:8787"
const AGENT = "deal-scout"

// Frame types from the agents chat protocol. Only these two matter to us.
const CHAT_REQUEST = "cf_agent_use_chat_request"
const CHAT_RESPONSE = "cf_agent_use_chat_response"
const CHAT_CLEAR = "cf_agent_chat_clear"

// A turn the agent never terminates would leave the input locked ("still waiting
// on the last reply…") for the rest of the session, so one is given up on. The
// worker always writes a terminal frame, even for a failed turn — this is for the
// cases where the frame never arrives at all, e.g. the agent restarting mid-turn.
const TURN_TIMEOUT_MS = 120_000

const EMPTY_REPLY =
  "The agent replied with nothing at all. Try rephrasing — some wordings make the model produce no answer and no search."

const GREETING =
  "Hello! I am DealScout, I can help you find Steam Game Deals."

function localMessage(text: string, id: string = crypto.randomUUID()): ChatMessage {
  return {
    id,
    role: "agent",
    text,
    dealSets: [],
    toolLines: [],
    pending: false,
    failed: false,
    local: true
  }
}

/** A `search_deals` output, if that is what this really is. */
function extractDeals(output: unknown): Deal[] {
  if (output == null || typeof output !== "object") return []
  const deals = (output as { deals?: unknown }).deals
  if (!Array.isArray(deals)) return []
  // The tool result arrives as untyped JSON, so each row is checked rather than
  // asserted — a malformed one must not take the render down.
  return deals.filter(
    (deal): deal is Deal =>
      deal != null &&
      typeof deal === "object" &&
      typeof (deal as Deal).title === "string" &&
      typeof (deal as Deal).salePrice === "number"
  )
}

/** A one-line "searching…" trace for a tool the agent just invoked. */
function describeToolCall(toolName: string, input: unknown): string {
  const args =
    input != null && typeof input === "object"
      ? Object.entries(input as Record<string, unknown>)
        .filter(([, value]) => value != null && value !== "")
        .map(([key, value]) => `${key}: ${value}`)
        .join(", ")
      : ""
  return `${toolName}(${args})`
}

export interface DealScoutChat {
  messages: ChatMessage[]
  status: ConnectionStatus
  /** Human-readable detail for a non-connected status, e.g. a close reason. */
  statusDetail: string | null
  /** A turn is in flight. */
  busy: boolean
  send: (text: string) => void
  retry: () => void
}

/**
 * Chat state for the single `deal-scout` agent, over the WebSocket protocol
 * tests/chat.ts drives. Messages are plain React state on purpose — useAgentChat
 * needs a DOM-ish environment and hides the tool frames the card rendering is
 * built on.
 *
 * The transcript starts fresh each launch, and the agent's own persisted history
 * is cleared on connect to match. That is not just tidiness: the agent replaces
 * its stored history with whatever `messages` a request carries, so a transcript
 * that disagreed with it would be a lie about what the model can see — and a
 * history left over from an earlier session can degrade the model into empty
 * replies, which clearing reliably fixes.
 */
export default function useDealScout(): DealScoutChat {
  const initial = useMemo(() => [localMessage(GREETING, "greeting")], [])
  // Mirrored in a ref because `send` has to read the current transcript to build
  // the history payload, and every update goes through `mutate` so the two can
  // never disagree.
  const messagesRef = useRef<ChatMessage[]>(initial)
  const [messages, setMessages] = useState<ChatMessage[]>(initial)
  const [status, setStatus] = useState<ConnectionStatus>("connecting")
  const [statusDetail, setStatusDetail] = useState<string | null>(null)

  const clientRef = useRef<AgentClient | null>(null)
  // The turn frames are currently being routed to, or null between turns.
  const turnRef = useRef<{ requestId: string; messageId: string } | null>(null)
  const turnTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearedHistory = useRef(false)
  // tool-output-available carries no tool name, only the id from its call.
  const toolNames = useRef(new Map<string, string>())

  const mutate = useCallback((fn: (prev: ChatMessage[]) => ChatMessage[]) => {
    const next = fn(messagesRef.current)
    messagesRef.current = next
    setMessages(next)
  }, [])

  const patch = useCallback(
    (id: string, fn: (message: ChatMessage) => ChatMessage) => {
      mutate((prev) => prev.map((message) => (message.id === id ? fn(message) : message)))
    },
    [mutate]
  )

  /** Clear the in-flight turn, whatever its outcome. */
  const endTurn = useCallback(() => {
    if (turnTimer.current != null) clearTimeout(turnTimer.current)
    turnTimer.current = null
    const turn = turnRef.current
    turnRef.current = null
    return turn
  }, [])

  /** End the in-flight turn as failed — a dropped socket sends no `done` frame. */
  const failTurn = useCallback(
    (reason: string) => {
      const turn = endTurn()
      if (!turn) return
      patch(turn.messageId, (message) => ({
        ...message,
        pending: false,
        failed: true,
        text: message.text || reason
      }))
    },
    [endTurn, patch]
  )

  const applyPart = useCallback(
    (messageId: string, body: string) => {
      let part: Record<string, any>
      try {
        part = JSON.parse(body)
      } catch {
        return
      }
      switch (part.type) {
        case "tool-input-available":
          toolNames.current.set(part.toolCallId, part.toolName)
          patch(messageId, (message) => ({
            ...message,
            toolLines: [...message.toolLines, describeToolCall(part.toolName, part.input)]
          }))
          break
        case "tool-output-available": {
          // Only search_deals results render as cards; get_game_details and the
          // schedule tools have no card shape and stay in the agent's prose.
          if (toolNames.current.get(part.toolCallId) !== "search_deals") break
          const deals = extractDeals(part.output)
          if (deals.length === 0) break
          const dealSet: DealSet = { toolCallId: part.toolCallId, deals }
          patch(messageId, (message) => ({
            ...message,
            dealSets: [...message.dealSets, dealSet]
          }))
          break
        }
        case "text-delta":
          patch(messageId, (message) => ({
            ...message,
            text: message.text + (part.delta ?? "")
          }))
          break
      }
    },
    [patch]
  )

  const handleFrame = useCallback(
    (raw: unknown) => {
      if (typeof raw !== "string") return
      let frame: Record<string, any>
      try {
        frame = JSON.parse(raw)
      } catch {
        return
      }
      if (frame?.type !== CHAT_RESPONSE) return

      const turn = turnRef.current
      // Frames for a turn we are not tracking (another client's, or one from
      // before a reconnect) have nowhere to go.
      if (!turn || frame.id !== turn.requestId) return

      if (frame.error) {
        failTurn(typeof frame.body === "string" ? frame.body : "the agent reported an error")
        return
      }
      if (typeof frame.body === "string") applyPart(turn.messageId, frame.body)
      if (frame.done) {
        endTurn()
        patch(turn.messageId, (message) => {
          if (message.text.length > 0 || message.dealSets.length > 0) {
            return { ...message, pending: false }
          }
          // A finished turn that produced neither text nor a tool result. The
          // model does this for some phrasings — "deals on top reviewed games"
          // comes back empty while "well-reviewed deals" works — and rendering
          // it as a blank reply just looks like the TUI broke. Marked failed so
          // it is also kept out of the history the next turn sends.
          return {
            ...message,
            pending: false,
            failed: true,
            text: EMPTY_REPLY
          }
        })
      }
    },
    [applyPart, endTurn, failTurn, patch]
  )

  useEffect(() => {
    let client: AgentClient
    try {
      client = new AgentClient({ host: AGENT_HOST, agent: AGENT, name: AGENT })
    } catch (error) {
      setStatus("error")
      setStatusDetail(error instanceof Error ? error.message : String(error))
      return
    }
    clientRef.current = client

    const onOpen = () => {
      setStatus("connected")
      setStatusDetail(null)
      // Once per session, not per reconnect: a drop mid-conversation must not
      // throw away the history this transcript is still built on.
      if (!clearedHistory.current) {
        clearedHistory.current = true
        try {
          client.send(JSON.stringify({ type: CHAT_CLEAR }))
        } catch {
          // A clear that does not land is not worth failing the connection over.
        }
      }
    }
    // PartySocket reconnects on its own, so a drop is reported, not fatal — the
    // TUI keeps rendering either way.
    const onClose = (event: Event) => {
      const close = event as CloseEvent
      setStatus("reconnecting")
      setStatusDetail(close.reason || `socket closed (${close.code ?? "?"})`)
      failTurn("the connection dropped before the agent replied")
    }
    const onError = () => {
      setStatus("error")
      setStatusDetail(`cannot reach the agent at ${AGENT_HOST}`)
      failTurn("the connection failed before the agent replied")
    }
    const onMessage = (event: Event) => handleFrame((event as MessageEvent).data)

    client.addEventListener("open", onOpen)
    client.addEventListener("close", onClose)
    client.addEventListener("error", onError)
    client.addEventListener("message", onMessage)

    return () => {
      client.removeEventListener("open", onOpen)
      client.removeEventListener("close", onClose)
      client.removeEventListener("error", onError)
      client.removeEventListener("message", onMessage)
      clientRef.current = null
      client.close()
    }
  }, [failTurn, handleFrame])

  useEffect(() => () => {
    if (turnTimer.current != null) clearTimeout(turnTimer.current)
  }, [])

  const send = useCallback(
    (raw: string) => {
      const text = raw.trim()
      if (text.length === 0) return

      const client = clientRef.current
      if (client == null || client.readyState !== AgentClient.OPEN) {
        mutate((prev) => [
          ...prev,
          localMessage("Not connected to the agent yet — press ctrl+r to retry.")
        ])
        return
      }
      if (turnRef.current != null) {
        mutate((prev) => [...prev, localMessage("Still waiting on the last reply…")])
        return
      }

      const requestId = crypto.randomUUID()
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        text,
        dealSets: [],
        toolLines: [],
        pending: false,
        failed: false
      }
      const reply: ChatMessage = {
        id: crypto.randomUUID(),
        role: "agent",
        text: "",
        dealSets: [],
        toolLines: [],
        pending: true,
        failed: false
      }

      const history = [...messagesRef.current, userMessage]
      mutate(() => [...history, reply])
      turnRef.current = { requestId, messageId: reply.id }
      turnTimer.current = setTimeout(
        () => failTurn("no reply from the agent — ask again"),
        TURN_TIMEOUT_MS
      )

      // The agent persists whatever history a request carries and drops the rest,
      // so every turn resends the whole transcript. Tool parts are left out: the
      // worker prunes them from the model's history anyway, and Workers AI
      // rejects a history containing a multi-tool-call assistant turn.
      const wire = history
        .filter((message) => !message.local && !message.failed && message.text.trim().length > 0)
        .map((message) => ({
          id: message.id,
          role: message.role === "user" ? "user" : "assistant",
          parts: [{ type: "text", text: message.text }]
        }))

      try {
        client.send(
          JSON.stringify({
            type: CHAT_REQUEST,
            id: requestId,
            init: { method: "POST", body: JSON.stringify({ messages: wire }) }
          })
        )
      } catch (error) {
        failTurn(error instanceof Error ? error.message : "could not send the message")
      }
    },
    [failTurn, mutate]
  )

  const retry = useCallback(() => {
    setStatus("connecting")
    setStatusDetail(null)
    clientRef.current?.reconnect()
  }, [])

  const busy = messages.some((message) => message.pending)

  return { messages, status, statusDetail, busy, send, retry }
}
