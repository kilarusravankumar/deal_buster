import { createWorkersAI } from "workers-ai-provider";
import { callable, getAgentByName, routeAgentRequest, type Schedule } from "agents";
import { getSchedulePrompt, scheduleSchema } from "agents/schedule";
import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateText,
  pruneMessages,
  stepCountIs,
  tool
} from "ai";
import { z } from "zod";
import { getSteamGameDetails } from "../src/api/steam";
import {
  GAME_TAGS_VERSION,
  initialDealScoutState,
  migrateDealScoutState,
  type CachedGameTags,
  type DealScoutState,
  type LoadGameTags,
  type ShownDeal,
  type Watch,
  type WatchStore
} from "./state";
import type { ClaimedAlerts, PriceCheckParams } from "./priceCheckWorkflow";
import type { PriceDrop } from "./priceCheck";
import { addWatchTool } from "./tools/addWatch";
import { getGameDetailsTool } from "./tools/getGameDetails";
import { listWatchesTool } from "./tools/listWatches";
import { removeWatchTool } from "./tools/removeWatch";
import { searchDealsTool } from "./tools/searchDeals";


// Workers AI model for the chat + tool-calling loop.
const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

// Single-owner app: one shared agent instance, no per-user identity. The TUI and
// the web chat both connect to this name, and the dev trigger route below has to
// agree with them.
//
// NOT exported: every named export of the Worker's main module is treated by the
// runtime as an entrypoint, and a string is not one ("Incorrect type for map
// entry 'AGENT_NAME': the provided value is not of type 'function or
// ExportedHandler'"). Only the handler and the DealScout/PriceCheckWorkflow
// classes may be exported from here.
const AGENT_NAME = "deal-scout";

// 09:00 UTC daily. A cron `schedule()` is idempotent by default, so re-running
// this on every DO restart returns the existing row instead of stacking up
// duplicates.
const PRICE_CHECK_CRON = "0 9 * * *";

export class DealScout extends AIChatAgent<Env, DealScoutState> {
  initialState = initialDealScoutState;

  maxPersistedMessages = 100;
  chatRecovery = true;
  // Wait for MCP connections to be re-established after hibernation before
  // processing a message, so MCP tools aren't intermittently missing.
  waitForMcpConnections = true;

  onStart() {
    this.migrateState();
    this.dropStaleGameTags();
    void this.ensurePriceCheckSchedule();

    // Configure OAuth popup behavior for MCP servers that require authentication
    this.mcp.configureOAuthCallback({
      customHandler: (result) => {
        if (result.authSuccess) {
          return new Response("<script>window.close();</script>", {
            headers: { "content-type": "text/html" },
            status: 200
          });
        }
        return new Response(
          `Authentication Failed: ${result.authError || "Unknown error"}`,
          { headers: { "content-type": "text/plain" }, status: 400 }
        );
      }
    });
  }

  // Scaffolding smoke check: a deterministic round-trip over the agent
  // WebSocket that does not depend on the model. Safe to delete once the real
  // Deal Buster tools land.
  @callable()
  async ping(message: string) {
    return {
      agent: "deal-scout",
      echo: message,
      at: new Date().toISOString()
    };
  }

  @callable()
  async addServer(name: string, url: string) {
    return await this.addMcpServer(name, url);
  }

  @callable()
  async removeServer(serverId: string) {
    await this.removeMcpServer(serverId);
  }

  /**
   * Bring a state blob written by an older build up to the current shape.
   *
   * Runs before anything else reads state: `initialState` is only applied to a
   * brand-new instance, so without this an existing agent would be missing
   * `lastShownDeals` entirely and would still be carrying `threshold` where
   * watches now hold `targetPrice`.
   */
  private migrateState() {
    const migrated = migrateDealScoutState(this.state);
    if (migrated == null) return;
    console.log("[DealScout] migrated state to the current shape");
    this.setState(migrated);
  }

  /**
   * The watch tools' view of state. Reads go through `this.state` on every call
   * rather than being captured once, because a multi-step turn can add two
   * watches and the second call has to see the first one's write.
   */
  private watchStore: WatchStore = {
    watches: () => this.state.watches ?? [],
    saveWatches: (next: Watch[]) => {
      this.setState({ ...this.state, watches: next });
    },
    lastShownDeals: () => this.state.lastShownDeals ?? []
  };

  /** Snapshot the deals just shown, so the next turn can resolve "the second one". */
  private recordShownDeals = (deals: ShownDeal[]) => {
    this.setState({ ...this.state, lastShownDeals: deals });
  };

  /**
   * Drop cached tags written under an older {@link GAME_TAGS_VERSION}. The
   * version check in {@link loadGameTags} already refuses to trust them, but
   * sweeping on start keeps stale entries — e.g. the Italian genre strings cached
   * before the Steam locale was pinned — out of state entirely.
   */
  private dropStaleGameTags() {
    const gameTags = this.state.gameTags ?? {};
    const fresh = Object.fromEntries(
      Object.entries(gameTags).filter(
        ([, entry]) => entry.version === GAME_TAGS_VERSION
      )
    );
    const dropped = Object.keys(gameTags).length - Object.keys(fresh).length;
    if (dropped === 0 && this.state.gameTags != null) return;

    console.log(`[DealScout] dropped ${dropped} stale cached game tags`);
    this.setState({ ...this.state, gameTags: fresh });
  }

  /**
   * Cache-first Steam lookup over the candidate appIDs for one game, best first
   * (see `steamAppIDCandidates`). The first candidate Steam answers for wins,
   * and the cache is keyed by that candidate, not by whichever id the caller led
   * with — so a repeat lookup has to consult every candidate's cache entry
   * before fetching anything, or the second call would re-fetch.
   *
   * A failed or unknown appID is deliberately not cached: Steam returns
   * `success: false` for regional restrictions and delisted apps too, and
   * remembering that as "no tags" would make it permanent.
   */
  // Typed against the shared contract so this and ./tools/getGameDetails cannot
  // drift apart.
  private loadGameTags: LoadGameTags = async (candidates) => {
    // An instance whose state predates a field keeps its old shape — `initialState`
    // is not re-applied to existing instances — so never assume a key is there.
    const gameTags = this.state.gameTags ?? {};
    for (const steamAppID of candidates) {
      const cached = gameTags[steamAppID];
      // A stale-version entry is treated as a miss and overwritten below.
      if (cached && cached.version === GAME_TAGS_VERSION) {
        return { ...cached, cached: true, steamAppID };
      }
    }

    for (const steamAppID of candidates) {
      // A transport failure on one candidate (a 429, a 5xx) must not cost us the
      // next one — that is the whole point of having a second candidate.
      let details: Awaited<ReturnType<typeof getSteamGameDetails>>;
      try {
        details = await getSteamGameDetails(steamAppID);
      } catch (error) {
        console.error(
          `[DealScout] Steam lookup failed for appID ${steamAppID}:`,
          error instanceof Error ? error.message : error
        );
        continue;
      }
      if (details == null) continue;

      const entry: CachedGameTags = {
        title: details.name,
        genres: details.genres,
        categories: details.categories,
        cachedAt: new Date().toISOString(),
        version: GAME_TAGS_VERSION
      };
      this.setState({
        ...this.state,
        gameTags: { ...gameTags, [steamAppID]: entry }
      });
      return { ...entry, cached: false, steamAppID };
    }
    return null;
  }

  async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    const mcpTools = this.mcp.getAITools();
    const workersai = createWorkersAI({ binding: this.env.AI });
    const { prefs, watches, preferences } = this.state;

    const system = `You are Deal Scout, the agent behind Deal Buster — a terminal app for finding Steam game deals.

Use the search_deals tool whenever the user asks what is on sale, asks about a
specific game's price, or gives a budget. Never invent prices, savings or titles:
every number you state must come from a tool result. If a tool returns nothing,
say so plainly instead of guessing.

Pick search_deals filters from what the user actually said:
- "well-reviewed", "critically acclaimed", "top rated" → minMetacritic (80) and/or
  minSteamRating (85). "popular", "not obscure" → minReviewCount (1000).
- "new deals", "just went on sale", "today", "this week" → newWithinHours (24, 168).
  onSale defaults to true; only pass false if they want full-price games too.
- "newly released games", "recent releases", "new games" → sortBy 'Release'
  (do NOT pass sortDescending; CheapShark's default is already newest-first).
- "steals", "practically a steal", "biggest discount", "deep discount", "highest savings" →
  sortBy 'Savings' (do NOT pass sortDescending; CheapShark's default is already highest savings first).
- "cheapest" → sortBy 'Price'. "most expensive" → sortBy 'Price' with sortDescending: true.
- "AAA", "big-budget", "major releases" → aaaOnly.
- a budget range ("$10 to $20", "between 5 and 15") → minPrice with maxPrice.
- general browsing or greeting ("what's on sale", "fetch deals", "hi, what can you do") →
  call search_deals with no extra filters or default ceiling, rather than inventing unrequested rating filters.
- a steamAppID you got from get_game_details → the steamAppID filter for a
  precise lookup. If that returns no deal, fall back to searching by title.
Combine filters in a single call rather than searching repeatedly, and do not
filter on something the user did not ask for.

GENRE RULE — this one is absolute:
search_deals filters by title and price ONLY. It does NOT filter by genre, mood or
theme. You may never claim, label or imply a game's genre unless you called
get_game_details for that exact game and its returned genres confirm it.

When the user asks for a genre ("roguelikes under $15"):
1. call search_deals for the price/title constraints;
2. call get_game_details on the candidates, using each deal's steamAppID;
3. keep only the games whose returned genres or categories actually match, and
   report those — naming the genres you saw.
If you have not verified a game, either say you have not checked it yet and offer
to, or describe it only by title and price. Never present a price-filtered list as
if it were genre-filtered, and never guess a genre from a title you recognise.

A steamAppID must always come from a search_deals result — never from memory. If
you do not have one for a game, call search_deals first. If get_game_details
reports titleMismatch, throw that result away: it describes a different game.

Call exactly ONE tool at a time and wait for its result before the next call.
Never emit two tool calls in the same turn — this model cannot do that, and the
request fails outright.

When you report deals, keep it short: title, sale price, original price and the
discount, one per line. The terminal renders the structured results as game
cards, so do not repeat thumbnail URLs or IDs in your prose. Number them, so the
user can refer back to one by position.

WATCHING GAMES:
The user can ask to be alerted when a game gets cheaper. Three tools cover this,
and between them they are the ONLY source of truth about what is watched — the
conversation history is pruned between turns, so anything you "remember" about
the watchlist or about deals you listed earlier is unreliable.

- add_watch puts ONE game on the list. The user usually refers to it by position
  in the deals you just showed — "watch the second one", "that one", "the first
  two" — so pass 'position' (1-based, counting the deals you last listed). Pass
  'title' only when they named a game you have not just shown.
  If they did NOT name a price, OMIT targetPrice: it then defaults to the game's
  current sale price, which means "alert me if it drops any further". Only pass
  targetPrice when they said a number ("tell me when it hits $10" → 10).
  Watching a game that is already watched updates its target price.
  To watch more than one game, call add_watch once per game, one call per step —
  never two in the same message.
- list_watches answers "what am I watching?". Always call it rather than
  answering from the conversation. Its numbering is what remove_watch counts.
- remove_watch takes one game off. Its 'position' counts the WATCHLIST from
  list_watches, NOT the deals search. If the user says "remove the second one"
  and you are not certain what the watchlist looks like, call list_watches first.

Watches survive restarts and cleared chat history, so it is safe to tell the user
a game is being watched once add_watch returns added: true.

All prices are USD and every deal is on Steam.

Default price ceiling: ${prefs.maxPrice == null ? "none set" : `$${prefs.maxPrice}`}.
Games currently watched: ${watches.length}. Preferences recorded: ${preferences.length}.

${getSchedulePrompt({ date: new Date() })}

If the user asks to schedule a task, use the schedule tool to schedule the task.`;

    // Prune *all* tool calls and results out of the history, not just the older
    // ones. Workers AI rejects any request whose history contains an assistant
    // message with more than one tool call ("8007: This model only supports
    // single tool-calls at once!"), and a multi-step turn — search_deals plus a
    // get_game_details per candidate — persists exactly that shape. Left in, one
    // such turn poisons every later request in the conversation. The tool results
    // themselves are not worth keeping: what matters lives in agent state.
    const messages = pruneMessages({
      messages: await convertToModelMessages(this.messages),
      toolCalls: "all",
      reasoning: "all"
    });

    // Non-streaming on purpose. Workers AI's streamed tool calls arrive with
    // every argument delta duplicated, so the accumulated JSON comes out as
    // `{"maxPrice": "{"maxPrice": "10"}10"}` and every tool call fails to parse.
    // `generateText` reads the completed tool call instead, which is correct —
    // the cost is that the reply lands in one piece rather than token by token.
    const runTurn = () =>
      generateText({
        model: workersai(MODEL, { sessionAffinity: this.sessionAffinity }),
        system,
        messages,
        tools: {
          // MCP tools from connected servers
          ...mcpTools,

          search_deals: searchDealsTool({
            defaultMaxPrice: prefs.maxPrice,
            recordShownDeals: this.recordShownDeals
          }),

          add_watch: addWatchTool({ store: this.watchStore }),
          list_watches: listWatchesTool({ store: this.watchStore }),
          remove_watch: removeWatchTool({ store: this.watchStore }),

          get_game_details: getGameDetailsTool({
            // Bound to the agent: the cache it reads and writes is agent state.
            loadGameTags: (candidates) => this.loadGameTags(candidates)
          }),

          scheduleTask: tool({
            description:
              "Schedule a task to be executed at a later time. Use this when the user asks to be reminded or wants something done later.",
            inputSchema: scheduleSchema,
            execute: async ({ when, description }) => {
              if (when.type === "no-schedule") {
                return "Not a valid schedule input";
              }
              const input =
                when.type === "scheduled"
                  ? when.date
                  : when.type === "delayed"
                    ? when.delayInSeconds
                    : when.type === "cron"
                      ? when.cron
                      : null;
              if (!input) return "Invalid schedule type";
              try {
                this.schedule(input, "executeTask", description, {
                  idempotent: true
                });
                return `Task scheduled: "${description}" (${when.type}: ${input})`;
              } catch (error) {
                return `Error scheduling task: ${error}`;
              }
            }
          }),

          getScheduledTasks: tool({
            description: "List all tasks that have been scheduled",
            inputSchema: z.object({}),
            execute: async () => {
              const tasks = this.getSchedules();
              return tasks.length > 0 ? tasks : "No scheduled tasks found.";
            }
          }),

          cancelScheduledTask: tool({
            description: "Cancel a scheduled task by its ID",
            inputSchema: z.object({
              taskId: z.string().describe("The ID of the task to cancel")
            }),
            execute: async ({ taskId }) => {
              try {
                this.cancelSchedule(taskId);
                return `Task ${taskId} cancelled.`;
              } catch (error) {
                return `Error cancelling task: ${error}`;
              }
            }
          })
        },
        // A genre question costs one search step plus one get_game_details step
        // per candidate, so the ceiling has to leave room for the verify loop.
        stopWhen: stepCountIs(8),
        abortSignal: options?.abortSignal
      });

    // Llama 3.3 on Workers AI rejects a turn outright if the model emits two
    // tool calls at once ("8007: This model only supports single tool-calls at
    // once!"). It usually picks a single call when asked again, so retry once —
    // and if it still fails, say so in the reply rather than leaving the turn
    // with no terminal frame, which would hang the client.
    let result: Awaited<ReturnType<typeof runTurn>> | null = null;
    let failure: string | null = null;
    for (let attempt = 0; attempt < 2 && result === null; attempt++) {
      try {
        result = await runTurn();
      } catch (error) {
        failure = error instanceof Error ? error.message : String(error);
        console.error(`[DealScout] turn attempt ${attempt + 1} failed:`, failure);
      }
    }

    // Replay the finished turn as a UI message stream: the tool parts carry the
    // structured deals (which the TUI renders as its existing game cards), then
    // the assistant text.
    const stream = createUIMessageStream({
      execute: ({ writer }) => {
        const textId = crypto.randomUUID();

        if (result === null) {
          writer.write({ type: "text-start", id: textId });
          writer.write({
            type: "text-delta",
            id: textId,
            delta: `Sorry — that request failed on the model side (${failure}). Try asking again, or ask for one thing at a time.`
          });
          writer.write({ type: "text-end", id: textId });
          return;
        }

        // `result.staticToolCalls` only covers the final step, which is the
        // text step — the tool calls happened in earlier ones.
        for (const step of result.steps) {
          for (const call of step.staticToolCalls) {
            writer.write({
              type: "tool-input-available",
              toolCallId: call.toolCallId,
              toolName: call.toolName,
              input: call.input
            });
          }
          for (const toolResult of step.staticToolResults) {
            writer.write({
              type: "tool-output-available",
              toolCallId: toolResult.toolCallId,
              output: toolResult.output
            });
          }
        }

        writer.write({ type: "text-start", id: textId });
        writer.write({ type: "text-delta", id: textId, delta: result.text });
        writer.write({ type: "text-end", id: textId });
      }
    });

    return createUIMessageStreamResponse({ stream });
  }

  /**
   * Register the daily price check.
   *
   * This is a persisted Durable Object alarm, not a timer in a running process:
   * Cloudflare stores it, and wakes this object to call `runPriceCheck` when it
   * comes due even if the agent has been idle and nobody is connected.
   */
  private async ensurePriceCheckSchedule() {
    try {
      await this.schedule(PRICE_CHECK_CRON, "runPriceCheck");
    } catch (error) {
      // A failed schedule must not take the agent down — chat still works, the
      // price check just will not fire until the next start.
      console.error(
        "[DealScout] could not register the price-check schedule:",
        error instanceof Error ? error.message : error
      );
    }
  }

  /**
   * Start a price-check run. The alarm's callback, and what the dev trigger route
   * calls.
   *
   * The watchlist is passed to the workflow as params rather than being read back
   * out of this object mid-run, so one run describes one fixed set of watches.
   */
  async runPriceCheck(): Promise<{ started: boolean; instanceId?: string; reason?: string }> {
    const watches = this.state.watches ?? [];
    if (watches.length === 0) {
      console.log("[DealScout] price check skipped: nothing is being watched");
      return { started: false, reason: "nothing watched" };
    }
    // The user's global off switch, checked here rather than inside the workflow
    // so a disabled run costs nothing at all.
    if (this.state.prefs?.alertsEnabled === false) {
      console.log("[DealScout] price check skipped: alerts are disabled");
      return { started: false, reason: "alerts disabled" };
    }

    const params: PriceCheckParams = { agentName: this.name, watches };
    const instance = await this.env.PRICE_CHECK_WORKFLOW.create({ params });
    console.log(
      `[DealScout] price check started (instance ${instance.id}) for ${watches.length} watch(es)`
    );
    return { started: true, instanceId: instance.id };
  }

  /** Manual trigger for the dev route — same path as the alarm. */
  @callable()
  async checkPricesNow() {
    return await this.runPriceCheck();
  }

  /**
   * Claim price alerts: the workflow's only write path into this agent.
   *
   * Claiming and recording are one operation on purpose. The workflow sends the
   * email only for what this returns, so a retried notify step finds the drops
   * already recorded, claims nothing, and sends nothing — the dedupe that stops a
   * duplicate email lives here, in the object that owns the state.
   *
   * Re-checks each drop against current state rather than trusting the workflow's
   * view, which was computed before the fetch and could be stale if the watch was
   * removed, re-targeted, or alerted by a concurrent run in the meantime.
   */
  async claimPriceAlerts(
    drops: PriceDrop[],
    summary: string,
    checkedAt: string
  ): Promise<ClaimedAlerts> {
    const watches = this.state.watches ?? [];
    const claimed: PriceDrop[] = [];

    const next = watches.map((watch) => {
      const drop = drops.find((candidate) => candidate.gameID === watch.gameID);
      if (drop == null) return watch;
      // The same two conditions qualifyDrops applied, re-asserted against the
      // state as it is right now.
      if (drop.salePrice > watch.targetPrice) return watch;
      if (watch.lastNotifiedPrice != null && drop.salePrice >= watch.lastNotifiedPrice) {
        return watch;
      }
      claimed.push(drop);
      return { ...watch, lastNotifiedPrice: drop.salePrice };
    });

    this.setState({ ...this.state, watches: next, lastPriceCheckAt: checkedAt });

    if (claimed.length > 0) {
      // broadcast(), not saveMessages(): an alert is not a conversation turn, and
      // injecting it into chat history would feed it back to the model as new
      // context on the next message.
      this.broadcast(
        JSON.stringify({
          type: "price-alert",
          summary,
          drops: claimed,
          timestamp: checkedAt
        })
      );
    }

    console.log(
      `[DealScout] claimed ${claimed.length}/${drops.length} price alert(s)`
    );
    return { claimed, alreadyNotified: drops.length - claimed.length };
  }

  /** A run that found nothing still counts as a check. */
  async recordPriceCheck(checkedAt: string) {
    this.setState({ ...this.state, lastPriceCheckAt: checkedAt });
  }

  async executeTask(description: string, _task: Schedule<string>) {
    // Do the actual work here (send email, call API, etc.)
    console.log(`Executing scheduled task: ${description}`);

    // Notify connected clients via a broadcast event.
    // We use broadcast() instead of saveMessages() to avoid injecting
    // into chat history — that would cause the AI to see the notification
    // as new context and potentially loop.
    this.broadcast(
      JSON.stringify({
        type: "scheduled-task",
        description,
        timestamp: new Date().toISOString()
      })
    );
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json" }
  });

/**
 * Side door for demos: start a price check right now instead of waiting for the
 * daily alarm.
 *
 * Off unless `DEV_TRIGGER_TOKEN` is set, and then it must be presented — a route
 * that kicks off real emails should not be reachable just because it was left in
 * the bundle. Not a substitute for auth; this app has a single owner and no user
 * identity.
 */
async function handleDevPriceCheck(request: Request, env: Env): Promise<Response> {
  const expected = env.DEV_TRIGGER_TOKEN;
  if (!expected) return new Response("Not found", { status: 404 });
  if (request.method !== "POST") {
    return json({ error: "POST only" }, 405);
  }

  const provided =
    request.headers.get("x-dev-token") ??
    new URL(request.url).searchParams.get("token");
  if (provided !== expected) {
    return json({ error: "bad or missing dev token" }, 403);
  }

  const agent = await getAgentByName<Env, DealScout>(env.DealScout, AGENT_NAME);
  const result = await agent.runPriceCheck();
  return json({ agent: AGENT_NAME, ...result });
}

export default {
  async fetch(request: Request, env: Env) {
    if (new URL(request.url).pathname === "/dev/price-check") {
      return await handleDevPriceCheck(request, env);
    }
    // Agent routing first, always: the chat WebSocket and the agent's HTTP
    // routes must never be shadowed by a static file.
    const agentResponse = await routeAgentRequest(request, env);
    if (agentResponse != null) return agentResponse;

    // Everything else is the web chat. Assets are matched before the Worker for
    // paths outside `run_worker_first`, so this mainly catches the ones inside
    // it; serving them here too means one fall-through path rather than two
    // answers for "not an agent route".
    return await env.ASSETS.fetch(request);
  }
} satisfies ExportedHandler<Env>;

export { PriceCheckWorkflow } from "./priceCheckWorkflow";
