// Dev utility: wipe the agent's persisted chat history (state — watchlist,
// preferences, cached tags — is untouched). Run: bun tests/clear-history.ts
import { AgentClient } from "agents/client";
const client = new AgentClient({ host: "localhost:8787", agent: "deal-scout", name: "deal-scout" });
await client.ready;
client.send(JSON.stringify({ type: "cf_agent_chat_clear" }));
await new Promise((r) => setTimeout(r, 800));
console.log("history cleared");
process.exit(0);
