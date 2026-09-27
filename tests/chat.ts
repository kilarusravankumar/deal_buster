// Drives one real chat turn against a running `wrangler dev`, over the same
// WebSocket protocol the TUI will use. Run: bun tests/chat.ts "what's on sale?"
import { AgentClient } from "agents/client";

const HOST = process.env.AGENT_HOST ?? "localhost:8787";
const prompt = process.argv.slice(2).join(" ") || "what's on sale?";

const client = new AgentClient({
  host: HOST,
  agent: "deal-scout",
  name: "deal-scout"
});

const requestId = crypto.randomUUID();
let text = "";

client.addEventListener("message", (event: MessageEvent) => {
  const frame = JSON.parse(event.data as string);
  if (frame.type !== "cf_agent_use_chat_response") return;

  if (frame.error) {
    console.error("\n[stream error]", frame.body);
    return;
  }
  if (frame.body) {
    // Each frame carries one UI-message-stream event as JSON.
    const part = JSON.parse(frame.body);
    switch (part.type) {
      case "tool-input-available":
        console.log(`\n[tool call] ${part.toolName}(${JSON.stringify(part.input)})`);
        break;
      case "tool-output-available": {
        const out = part.output;
        const summary = out?.deals
          ? `${out.count} deals: ` +
            out.deals
              .map((d: { title: string; salePrice: number }) => `${d.title} $${d.salePrice}`)
              .join(" | ")
          : JSON.stringify(out);
        console.log(`[tool result] ${summary}`);
        break;
      }
      case "text-delta":
        text += part.delta ?? "";
        break;
    }
  }
  if (frame.done) {
    console.log(`\n[assistant]\n${text.trim()}\n`);
    client.close();
    process.exit(0);
  }
});

await client.ready;
console.log(`[user] ${prompt}\n`);

client.send(
  JSON.stringify({
    type: "cf_agent_use_chat_request",
    id: requestId,
    init: {
      method: "POST",
      body: JSON.stringify({
        messages: [
          {
            id: crypto.randomUUID(),
            role: "user",
            parts: [{ type: "text", text: prompt }]
          }
        ]
      })
    }
  })
);

// Don't hang forever if the model or the stream stalls.
setTimeout(() => {
  console.error("timed out after 90s");
  process.exit(1);
}, 90_000);
