import { test, expect, afterAll } from "bun:test";
import { AgentClient } from "agents/client";

// Scaffolding check for step 1: a real WebSocket round-trip against
// `wrangler dev`, proving the Worker routes to the DealAgent Durable Object
// instance named "deal-scout". Start the dev server first:
//   cd agent && bunx wrangler dev
const HOST = process.env.AGENT_HOST ?? "localhost:8787";
const AGENT = "deal-scout"; // kebab-case of the exported DealScout class
const NAME = "deal-scout";

const clients: AgentClient[] = [];
afterAll(() => {
  for (const c of clients) c.close();
});

function connect(): AgentClient {
  const client = new AgentClient({ host: HOST, agent: AGENT, name: NAME });
  clients.push(client);
  return client;
}

test("connects to the deal-scout agent and exchanges one message", async () => {
  const client = connect();

  // `ready` resolves once the server has sent its identity for this instance.
  await client.ready;
  expect(client.name).toBe(NAME);
  expect(client.agent).toBe(AGENT);

  const reply = (await client.call("ping", ["hello deal-scout"])) as {
    agent: string;
    echo: string;
    at: string;
  };

  expect(reply.agent).toBe(NAME);
  expect(reply.echo).toBe("hello deal-scout");
  expect(Number.isFinite(Date.parse(reply.at))).toBe(true);
  console.log("agent replied:", reply);
}, 30_000);
