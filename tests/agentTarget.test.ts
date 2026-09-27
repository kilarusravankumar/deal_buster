// Precedence and parsing for the TUI's agent endpoint. Pure — argv and env are
// arguments, so none of this needs a process or a socket.
import { describe, expect, test } from "bun:test"
import {
  LOCAL_AGENT_URL,
  PROD_AGENT_URL,
  resolveAgentTarget,
  shortTargetLabel
} from "../src/util/agentTarget"

const resolve = (argv: string[] = [], env: Record<string, string | undefined> = {}) =>
  resolveAgentTarget(argv, env)

describe("defaults", () => {
  test("with no flags and no env, the deployed agent wins over wss", () => {
    const target = resolve()
    expect(target.source).toBe("default")
    expect(target.url).toBe(PROD_AGENT_URL)
    expect(target.protocol).toBe("wss")
    expect(target.host).toBe("deal-buster-agent.kilarusravankumar.workers.dev")
  })

  test("the default carries no scheme in `host` — AgentClient wants host[:port]", () => {
    expect(resolve().host).not.toContain("://")
  })
})

describe("overrides, in precedence order", () => {
  test("--local points at wrangler dev over plain ws", () => {
    const target = resolve(["--local"])
    expect(target.source).toBe("--local")
    expect(target.url).toBe(LOCAL_AGENT_URL)
    expect(target.protocol).toBe("ws")
    expect(target.host).toBe("localhost:8787")
  })

  test("--agent-url beats --local", () => {
    const target = resolve(["--local", "--agent-url", "ws://127.0.0.1:9999/agents/x/y"])
    expect(target.source).toBe("--agent-url")
    expect(target.host).toBe("127.0.0.1:9999")
  })

  test("--agent-url=<url> is accepted too", () => {
    expect(resolve(["--agent-url=ws://localhost:1234"]).host).toBe("localhost:1234")
  })

  test("a flag beats the env var", () => {
    const target = resolve(["--local"], {
      DEAL_BUSTER_AGENT_URL: "wss://staging.example.com/agents/a/b"
    })
    expect(target.source).toBe("--local")
  })

  test("DEAL_BUSTER_AGENT_URL beats the default", () => {
    const target = resolve([], {
      DEAL_BUSTER_AGENT_URL: "ws://localhost:8787/agents/deal-scout/deal-scout"
    })
    expect(target.source).toBe("DEAL_BUSTER_AGENT_URL")
    expect(target.protocol).toBe("ws")
  })

  test("DEAL_BUSTER_AGENT_URL beats the legacy AGENT_HOST", () => {
    const target = resolve([], {
      DEAL_BUSTER_AGENT_URL: "ws://localhost:1111",
      AGENT_HOST: "localhost:2222"
    })
    expect(target.host).toBe("localhost:1111")
  })

  test("the legacy bare-host AGENT_HOST still works", () => {
    const target = resolve([], { AGENT_HOST: "localhost:8787" })
    expect(target.source).toBe("AGENT_HOST")
    expect(target.host).toBe("localhost:8787")
    expect(target.protocol).toBe("ws")
  })

  test("an empty env var is ignored rather than treated as a target", () => {
    expect(resolve([], { DEAL_BUSTER_AGENT_URL: "", AGENT_HOST: "" }).source).toBe("default")
  })

  test("unrelated argv is ignored", () => {
    expect(resolve(["--help", "-v", "deals"]).source).toBe("default")
  })
})

describe("protocol inference", () => {
  test("an explicit scheme is always honoured, even on a public host", () => {
    // A tunnel on a public hostname served over plain ws: guessing wss would fail.
    expect(resolve([], { DEAL_BUSTER_AGENT_URL: "ws://tunnel.example.com" }).protocol).toBe("ws")
    expect(resolve([], { DEAL_BUSTER_AGENT_URL: "wss://localhost:8787" }).protocol).toBe("wss")
  })

  test("http/https map onto ws/wss", () => {
    expect(resolve([], { DEAL_BUSTER_AGENT_URL: "https://example.com" }).protocol).toBe("wss")
    expect(resolve([], { DEAL_BUSTER_AGENT_URL: "http://example.com" }).protocol).toBe("ws")
  })

  test("a bare host defaults to ws only when it looks local", () => {
    expect(resolve([], { AGENT_HOST: "127.0.0.1:8787" }).protocol).toBe("ws")
    expect(resolve([], { AGENT_HOST: "10.0.0.5:8787" }).protocol).toBe("ws")
    expect(resolve([], { AGENT_HOST: "192.168.1.9:8787" }).protocol).toBe("ws")
    expect(resolve([], { AGENT_HOST: "172.20.0.4:8787" }).protocol).toBe("ws")
    expect(resolve([], { AGENT_HOST: "dev.local:8787" }).protocol).toBe("ws")
    // Outside the private ranges — 172.32 is public.
    expect(resolve([], { AGENT_HOST: "172.32.0.4:8787" }).protocol).toBe("wss")
    expect(resolve([], { AGENT_HOST: "example.com" }).protocol).toBe("wss")
  })
})

describe("malformed overrides fail loudly", () => {
  // Falling back to production would be a confusing way to appear to work.
  test("--agent-url with no value throws", () => {
    expect(() => resolve(["--agent-url"])).toThrow("needs a URL")
    expect(() => resolve(["--agent-url", "--local"])).toThrow("needs a URL")
  })

  test("a path without a scheme throws instead of being read as a host", () => {
    expect(() => resolve([], { AGENT_HOST: "localhost:8787/agents/deal-scout" })).toThrow(
      "full ws:// URL or a bare host"
    )
  })

  test("a scheme with no host throws", () => {
    expect(() => resolve(["--agent-url=ws://"])).toThrow()
  })
})

describe("shortTargetLabel", () => {
  // The status-line tag has to stay short: an over-long box title is dropped by
  // the renderer rather than truncated, which would lose the connection status.
  test("anything on this machine or the LAN is just 'local'", () => {
    expect(shortTargetLabel(resolve(["--local"]))).toBe("local")
    expect(shortTargetLabel(resolve([], { AGENT_HOST: "127.0.0.1:8787" }))).toBe("local")
    expect(shortTargetLabel(resolve([], { AGENT_HOST: "192.168.1.9:8787" }))).toBe("local")
  })

  test("a remote host is named, without its port", () => {
    expect(shortTargetLabel(resolve([], { DEAL_BUSTER_AGENT_URL: "wss://staging.example.com:443" })))
      .toBe("staging.example.com")
  })

  test("a very long hostname is clipped", () => {
    const label = shortTargetLabel(
      resolve([], { DEAL_BUSTER_AGENT_URL: "wss://deal-buster-agent.kilarusravankumar.workers.dev" })
    )
    expect(label.length).toBeLessThanOrEqual(20)
    expect(label).toEndWith("…")
  })
})
