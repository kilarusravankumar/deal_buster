// Drives the watch tools through the real model against a running `wrangler dev`,
// including the positional references that only work because state — not the
// pruned transcript — remembers what was shown.
//
//   bun tests/watch.manual.ts
import { AgentClient } from "agents/client";

const HOST = process.env.AGENT_HOST ?? "localhost:8787";
const client = new AgentClient({ host: HOST, agent: "deal-scout", name: "deal-scout" });

interface TurnResult {
  text: string;
  calls: { name: string; input: unknown; output?: unknown }[];
}

function turn(prompt: string, history: unknown[]): Promise<TurnResult> {
  const id = crypto.randomUUID();
  const result: TurnResult = { text: "", calls: [] };
  const byId = new Map<string, TurnResult["calls"][number]>();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out on "${prompt}"`)), 120_000);
    const onMessage = (event: MessageEvent) => {
      const frame = JSON.parse(event.data as string);
      if (frame.type !== "cf_agent_use_chat_response" || frame.id !== id) return;
      if (frame.error) console.error("[stream error]", frame.body);
      if (frame.body) {
        const part = JSON.parse(frame.body);
        if (part.type === "tool-input-available") {
          const call = { name: part.toolName, input: part.input };
          byId.set(part.toolCallId, call);
          result.calls.push(call);
        }
        if (part.type === "tool-output-available") {
          const call = byId.get(part.toolCallId);
          if (call) call.output = part.output;
        }
        if (part.type === "text-delta") result.text += part.delta ?? "";
      }
      if (frame.done) {
        clearTimeout(timer);
        client.removeEventListener("message", onMessage as never);
        resolve(result);
      }
    };
    client.addEventListener("message", onMessage as never);
    client.send(
      JSON.stringify({
        type: "cf_agent_use_chat_request",
        id,
        init: { method: "POST", body: JSON.stringify({ messages: history }) }
      })
    );
  });
}

const msg = (role: string, text: string) => ({
  id: crypto.randomUUID(),
  role,
  parts: [{ type: "text", text }]
});

const history: unknown[] = [];
async function ask(prompt: string) {
  history.push(msg("user", prompt));
  const result = await turn(prompt, [...history]);
  history.push(msg("assistant", result.text || "(no reply)"));
  console.log(`\n▸ ${prompt}`);
  for (const call of result.calls) {
    const out = JSON.stringify(call.output);
    console.log(`   ${call.name}(${JSON.stringify(call.input)})`);
    console.log(`     → ${out && out.length > 260 ? `${out.slice(0, 260)}…` : out}`);
  }
  console.log(`   "${result.text.replace(/\n+/g, " ").slice(0, 200)}"`);
  return result;
}

/** Agent state, read over the same socket the TUI uses. */
function state(): Promise<Record<string, any>> {
  return new Promise((resolve) => {
    if (client.state) return resolve(client.state as Record<string, any>);
    const check = setInterval(() => {
      if (client.state) {
        clearInterval(check);
        resolve(client.state as Record<string, any>);
      }
    }, 200);
  });
}

await client.ready;
// Start from a clean slate so positions are predictable.
client.send(JSON.stringify({ type: "cf_agent_chat_clear" }));
await new Promise((r) => setTimeout(r, 800));

await ask("what is on sale?");
const shown = await state();
console.log(
  `\n[state] lastShownDeals = ${(shown.lastShownDeals ?? [])
    .map((deal: any, index: number) => `${index + 1}. ${deal.title} $${deal.salePrice}`)
    .join(" | ")}`
);

// One call per game, across steps — never two in one assistant message.
await ask("watch the first two");
// An explicit price, and a repeat that must update in place rather than duplicate.
await ask("watch the first one, alert me at $8");
await ask("what am I watching?");

const before = await state();
console.log(`\n[state] watches = ${JSON.stringify(before.watches)}`);

// The guarantee: clearing chat wipes the transcript only.
client.send(JSON.stringify({ type: "cf_agent_chat_clear" }));
await new Promise((resolve) => setTimeout(resolve, 1200));
history.length = 0;
const after = await state();
console.log(
  `[state] after chat clear — watches: ${(after.watches ?? []).length}, ` +
    `preferences: ${(after.preferences ?? []).length}, ` +
    `gameTags: ${Object.keys(after.gameTags ?? {}).length}, ` +
    `lastShownDeals: ${(after.lastShownDeals ?? []).length}`
);

// Positional references still work here only because state, not the transcript,
// remembers what was shown.
await ask("what games am I watching?");
await ask("stop watching the first one");

// Leave the dev instance as it was found.
for (let i = 0; i < 6; i++) {
  if (((await state()).watches ?? []).length === 0) break;
  await ask("stop watching the first one");
}
console.log(`\n[state] final watches = ${JSON.stringify((await state()).watches)}`);
process.exit(0);
