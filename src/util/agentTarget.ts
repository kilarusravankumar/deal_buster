// Where the TUI looks for the Deal Scout agent.
//
// The default is the deployed Worker, so a binary someone downloads from
// Releases connects with no configuration at all — the URL below is a literal,
// so `bun build --compile` bakes it into the executable.
//
// Local development overrides it, in precedence order:
//   deal-buster --agent-url ws://host:port/...   explicit, wins over everything
//   deal-buster --local                          shorthand for localhost:8787
//   DEAL_BUSTER_AGENT_URL=ws://localhost:8787/…  env var
//   AGENT_HOST=localhost:8787                    legacy, bare host, still honoured
//
// Pure and dependency-free on purpose: it takes argv and env as arguments so the
// precedence rules can be unit-tested without a process or a socket.

/** The single shared agent instance. Both path segments use this name. */
export const AGENT = "deal-scout"

/** The deployed agent. Baked into compiled binaries. */
export const PROD_AGENT_URL =
  "wss://deal-buster-agent.kilarusravankumar.workers.dev/agents/deal-scout/deal-scout"

/** What `--local` means: `wrangler dev`'s default port. */
export const LOCAL_AGENT_URL = "ws://localhost:8787/agents/deal-scout/deal-scout"

/** Which setting won, so the TUI can say so instead of leaving the user guessing. */
export type AgentTargetSource =
  | "--agent-url"
  | "--local"
  | "DEAL_BUSTER_AGENT_URL"
  | "AGENT_HOST"
  | "default"

export interface AgentTarget {
  /** `host[:port]`, no scheme — the shape AgentClient wants. */
  host: string
  /**
   * Passed explicitly rather than left to PartySocket, which infers ws-vs-wss
   * from whether the host looks private. That guess is right for localhost and
   * for the deployed Worker, but wrong for e.g. a `wrangler dev --ip` box on the
   * LAN reached over plain ws, and wrong for a tunnel on a public hostname.
   */
  protocol: "ws" | "wss"
  /** The full URL, for the status line and the debug log. */
  url: string
  source: AgentTargetSource
}

const SCHEME = /^(wss?|https?):\/\//i

/** Hosts that should default to plain ws when no scheme was given. */
function looksLocal(hostname: string): boolean {
  const host = hostname.toLowerCase()
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true
  if (host === "127.0.0.1" || host === "0.0.0.0" || host === "::1" || host === "[::1]") return true
  if (host.startsWith("10.") || host.startsWith("192.168.")) return true
  // 172.16.0.0 – 172.31.255.255
  const parts = host.split(".")
  if (parts[0] === "172" && parts[1] != null) {
    const second = Number(parts[1])
    if (Number.isInteger(second) && second >= 16 && second <= 31) return true
  }
  return false
}

/**
 * A target is either a full URL (`ws://localhost:8787/agents/…`) or a bare host
 * (`localhost:8787`, the legacy AGENT_HOST shape). The path of a URL is ignored:
 * AgentClient builds it from `agent` and `name`, and every target serves the same
 * single instance.
 */
function parseTarget(raw: string, source: AgentTargetSource): AgentTarget {
  const value = raw.trim()
  if (value.length === 0) throw new Error(`${source} is empty`)

  if (SCHEME.test(value)) {
    let url: URL
    try {
      url = new URL(value)
    } catch {
      throw new Error(`${source} is not a valid URL: ${value}`)
    }
    if (url.host.length === 0) throw new Error(`${source} has no host: ${value}`)
    const secure = url.protocol === "wss:" || url.protocol === "https:"
    const protocol = secure ? "wss" : "ws"
    return { host: url.host, protocol, url: `${protocol}://${url.host}/agents/${AGENT}/${AGENT}`, source }
  }

  // A bare host. Reject anything that is clearly a path or a mangled URL rather
  // than silently connecting somewhere unintended.
  if (value.includes("/")) {
    throw new Error(`${source} must be a full ws:// URL or a bare host: ${value}`)
  }
  const hostname = value.replace(/:\d+$/, "")
  const protocol = looksLocal(hostname) ? "ws" : "wss"
  return { host: value, protocol, url: `${protocol}://${value}/agents/${AGENT}/${AGENT}`, source }
}

/** Read `--agent-url <url>` or `--agent-url=<url>` out of argv. */
function agentUrlFlag(argv: string[]): string | null {
  const index = argv.findIndex((arg) => arg === "--agent-url" || arg.startsWith("--agent-url="))
  if (index === -1) return null
  const arg = argv[index]!
  if (arg.startsWith("--agent-url=")) return arg.slice("--agent-url=".length)
  const next = argv[index + 1]
  if (next == null || next.startsWith("-")) throw new Error("--agent-url needs a URL")
  return next
}

/**
 * Resolve the agent endpoint. Throws on a malformed override rather than quietly
 * falling back to production — someone who passed `--agent-url` wants to know it
 * was wrong, not to reach prod by accident.
 */
export function resolveAgentTarget(
  argv: string[] = [],
  env: Record<string, string | undefined> = {}
): AgentTarget {
  const flagUrl = agentUrlFlag(argv)
  if (flagUrl != null) return parseTarget(flagUrl, "--agent-url")
  if (argv.includes("--local")) return parseTarget(LOCAL_AGENT_URL, "--local")
  if (env.DEAL_BUSTER_AGENT_URL) {
    return parseTarget(env.DEAL_BUSTER_AGENT_URL, "DEAL_BUSTER_AGENT_URL")
  }
  if (env.AGENT_HOST) return parseTarget(env.AGENT_HOST, "AGENT_HOST")
  return parseTarget(PROD_AGENT_URL, "default")
}

/**
 * A short tag for the status line: "local" for anything on this machine or LAN,
 * otherwise the bare hostname. Kept short because an over-long box title is
 * dropped by the renderer rather than truncated, which loses the status with it.
 */
export function shortTargetLabel(target: AgentTarget): string {
  const hostname = target.host.replace(/:\d+$/, "").replace(/^\[|\]$/g, "")
  if (looksLocal(hostname)) return "local"
  return hostname.length > 20 ? `${hostname.slice(0, 19)}…` : hostname
}
