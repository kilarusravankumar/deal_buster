// End-to-end check of the scheduled price-drop alert, against a running
// `wrangler dev`:
//
//   bunx wrangler dev
//   bun tests/priceCheck.manual.ts
//
// Seeds a watch whose target is ABOVE the live sale price, so a drop must be
// reported, then triggers the dev route twice: the first run must alert and
// email, the second must be suppressed by the dedupe. Re-runnable — the seed
// writes a watch with no lastNotifiedPrice every time.
import { AgentClient } from "agents/client";
import { getCurrentPrice, searchDeals } from "../src/api/cheapshark";

const HOST = process.env.AGENT_HOST ?? "localhost:8787";
const TOKEN = process.env.DEV_TRIGGER_TOKEN ?? "local-dev-price-check";
const client = new AgentClient({ host: HOST, agent: "deal-scout", name: "deal-scout" });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface PriceAlert {
  summary: string;
  drops: { gameID: string; title: string; salePrice: number; targetPrice: number }[];
}

const alerts: PriceAlert[] = [];
client.addEventListener("message", (event) => {
  const frame = JSON.parse((event as MessageEvent).data as string);
  if (frame.type === "price-alert") {
    console.log(
      `\n🔔 price-alert pushed over the socket: ${frame.drops?.length ?? 0} drop(s)\n   "${frame.summary}"`
    );
    for (const drop of frame.drops ?? []) {
      console.log(`   • ${drop.title} — $${drop.salePrice} (target $${drop.targetPrice})`);
    }
    alerts.push(frame as PriceAlert);
  }
});

function agentState(): Promise<Record<string, any>> {
  return new Promise((resolve) => {
    if (client.state) return resolve(client.state as Record<string, any>);
    const poll = setInterval(() => {
      if (client.state) {
        clearInterval(poll);
        resolve(client.state as Record<string, any>);
      }
    }, 200);
  });
}

async function trigger(label: string) {
  const response = await fetch(`http://${HOST}/dev/price-check`, {
    method: "POST",
    headers: { "x-dev-token": TOKEN }
  });
  const body = await response.text();
  console.log(`\n▸ POST /dev/price-check (${label}) → ${response.status} ${body.replace(/\s+/g, " ")}`);
  return { status: response.status, body };
}

function fail(message: string): never {
  console.error(`\n❌ ${message}`);
  process.exit(1);
}

await client.ready;
console.log(`connected to deal-scout at ${HOST}`);

// ── pick a real game that is on sale right now ───────────────────────────────
const [deal] = await searchDeals({ maxPrice: 15, limit: 1, sortBy: "Deal Rating" });
if (deal == null) fail("CheapShark returned no deals to build the test watch from");
const live = await getCurrentPrice(deal.gameID);
if (live == null) fail(`no current Steam price for ${deal.title} (${deal.gameID})`);
console.log(`\ntest game: ${live.title} (gameID ${live.gameID}) at $${live.salePrice}`);

// Target deliberately above the live price, so this watch MUST qualify.
const targetPrice = Number((live.salePrice + 5).toFixed(2));

// ── seed the watchlist, bypassing the model for determinism ──────────────────
const before = await agentState();
client.setState({
  ...before,
  watches: [
    {
      gameID: live.gameID,
      title: live.title,
      ...(live.steamAppID ? { steamAppID: live.steamAppID } : {}),
      targetPrice,
      addedAt: new Date().toISOString()
      // No lastNotifiedPrice: this is a never-alerted watch.
    }
  ],
  prefs: { ...(before.prefs ?? {}), alertsEnabled: true }
} as never);
await sleep(1500);

const seeded = await agentState();
const seededWatch = (seeded.watches ?? [])[0];
if (seededWatch?.gameID !== live.gameID) {
  fail(`seeding the watchlist did not take — watches = ${JSON.stringify(seeded.watches)}`);
}
if (seededWatch.lastNotifiedPrice != null) {
  fail("the seeded watch already carries a lastNotifiedPrice");
}
console.log(
  `seeded 1 watch: ${seededWatch.title} target $${seededWatch.targetPrice} (live $${live.salePrice})`
);

// ── run 1: must alert ────────────────────────────────────────────────────────
const first = await trigger("run 1 — expect an alert");
if (first.status !== 200) fail(`dev route returned ${first.status}`);
if (!first.body.includes('"started": true')) fail("the run did not start");

for (let waited = 0; alerts.length === 0 && waited < 90; waited++) await sleep(1000);
if (alerts.length === 0) fail("no price-alert arrived within 90s of the first run");

const alerted = alerts[0]!.drops.find((drop) => drop.gameID === live.gameID);
if (alerted == null) fail(`the alert did not mention ${live.title}`);
if (alerted.salePrice !== live.salePrice) {
  fail(`alert quoted $${alerted.salePrice} but the live price is $${live.salePrice}`);
}

const afterFirst = await agentState();
const recorded = (afterFirst.watches ?? [])[0];
if (recorded?.lastNotifiedPrice !== live.salePrice) {
  fail(
    `lastNotifiedPrice should be ${live.salePrice}, got ${recorded?.lastNotifiedPrice} ` +
      `— the dedupe has nothing to work with`
  );
}
console.log(`\n✅ run 1: alert pushed, lastNotifiedPrice recorded as $${recorded.lastNotifiedPrice}`);
console.log(`   lastPriceCheckAt = ${afterFirst.lastPriceCheckAt}`);

// ── run 2: must be suppressed ────────────────────────────────────────────────
const alertsBefore = alerts.length;
const second = await trigger("run 2 — expect silence");
if (second.status !== 200) fail(`dev route returned ${second.status} on the second run`);

// Long enough for the whole workflow to finish: fetch, compare, claim.
await sleep(30_000);
if (alerts.length !== alertsBefore) {
  fail(`the dedupe failed — run 2 pushed ${alerts.length - alertsBefore} more alert(s)`);
}
console.log("\n✅ run 2: no second alert — the dedupe held");

console.log(
  "\nall checks passed. Confirm the email in the wrangler dev log:\n" +
    "  grep '\\[PriceCheck\\]' <wrangler output>"
);
process.exit(0);
