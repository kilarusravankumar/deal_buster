import { createWorkersAI } from "workers-ai-provider";
import { callable, routeAgentRequest, type Schedule } from "agents";
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
import { searchDeals } from "../src/api/cheapshark";
import { SORT_OPTIONS } from "../src/types/sort";


// Workers AI model for the chat + tool-calling loop.
const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

/** A game the user wants watched, with the price that should trigger an alert. */
export interface Watch {
  gameID: string;
  title: string;
  /** Alert when salePrice <= this, in USD. */
  threshold: number;
  steamAppID: string | null;
  addedAt: string;
}

/** A liked/disliked game, kept with its tags so similarity needs no re-fetch. */
export interface Preference {
  gameID: string;
  title: string;
  liked: boolean;
  /** Steam genres + categories, lowercased. */
  tags: string[];
  recordedAt: string;
}

/**
 * Everything the agent remembers, persisted with `setState()` as one JSON blob.
 * Single-owner app: there is one instance ("deal-scout") and no per-user keys.
 */
export interface DealScoutState {
  watches: Watch[];
  preferences: Preference[];
  prefs: {
    /** Default ceiling applied when the user does not name a price, in USD. */
    maxPrice: number | null;
    alertsEnabled: boolean;
  };
  lastPriceCheckAt: string | null;
}

export const initialDealScoutState: DealScoutState = {
  watches: [],
  preferences: [],
  prefs: { maxPrice: null, alertsEnabled: true },
  lastPriceCheckAt: null
};

export class DealScout extends AIChatAgent<Env, DealScoutState> {
  initialState = initialDealScoutState;

  maxPersistedMessages = 100;
  chatRecovery = true;
  // Wait for MCP connections to be re-established after hibernation before
  // processing a message, so MCP tools aren't intermittently missing.
  waitForMcpConnections = true;

  onStart() {
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

  async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    const mcpTools = this.mcp.getAITools();
    const workersai = createWorkersAI({ binding: this.env.AI });
    const { prefs, watches, preferences } = this.state;

    // Non-streaming on purpose. Workers AI's streamed tool calls arrive with
    // every argument delta duplicated, so the accumulated JSON comes out as
    // `{"maxPrice": "{"maxPrice": "10"}10"}` and every tool call fails to parse.
    // `generateText` reads the completed tool call instead, which is correct —
    // the cost is that the reply lands in one piece rather than token by token.
    const result = await generateText({
      model: workersai(MODEL, { sessionAffinity: this.sessionAffinity }),
      system: `You are Deal Scout, the agent behind Deal Buster — a terminal app for finding Steam game deals.

Use the search_deals tool whenever the user asks what is on sale, asks about a
specific game's price, or gives a budget. Never invent prices, savings or titles:
every number you state must come from a tool result. If a tool returns nothing,
say so plainly instead of guessing.

search_deals filters by title and price only — it cannot filter by genre, mood or
theme. If the user asks for a genre ("horror games under $15"), either search a
title they name or return the price-filtered deals and say plainly that these are
the current deals under that price, not a genre-filtered list. Never label a game
as belonging to a genre you have not verified.

When you report deals, keep it short: title, sale price, original price and the
discount, one per line. The terminal renders the structured results as game
cards, so do not repeat thumbnail URLs or IDs in your prose.

All prices are USD and every deal is on Steam.

Default price ceiling: ${prefs.maxPrice == null ? "none set" : `$${prefs.maxPrice}`}.
Games currently watched: ${watches.length}. Preferences recorded: ${preferences.length}.

${getSchedulePrompt({ date: new Date() })}

If the user asks to schedule a task, use the schedule tool to schedule the task.`,
      // Prune old tool calls and reasoning to save tokens on long conversations
      messages: pruneMessages({
        messages: await convertToModelMessages(this.messages),
        toolCalls: "before-last-2-messages",
        reasoning: "before-last-message"
      }),
      tools: {
        // MCP tools from connected servers
        ...mcpTools,

        search_deals: tool({
          description:
            "Search current Steam deals on CheapShark. Use for 'what's on sale', for a named game's current price, or when the user gives a budget.",
          inputSchema: z.object({
            title: z
              .string()
              .optional()
              .describe("Game title or partial title. Omit to browse all deals."),
            maxPrice: z.coerce
              .number()
              .optional()
              .describe("Highest acceptable sale price in USD."),
            // Same orderings the TUI's sort bar offers.
            sortBy: z
              .enum(SORT_OPTIONS)
              .optional()
              .describe("Result ordering. Defaults to DealRating."),
            limit: z.coerce
              .number()
              .int()
              .optional()
              .describe("How many deals to return (1-20, default 8).")
          }),
          execute: async ({ title, maxPrice, sortBy, limit }) => {
            // Fall back to the stored ceiling when the user did not name one.
            const ceiling = maxPrice ?? prefs.maxPrice ?? undefined;
            try {
              const deals = await searchDeals({
                title,
                maxPrice: ceiling,
                sortBy,
                limit
              });
              return { count: deals.length, deals };
            } catch (error) {
              return {
                error:
                  error instanceof Error ? error.message : "CheapShark request failed"
              };
            }
          }
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
      stopWhen: stepCountIs(5),
      abortSignal: options?.abortSignal
    });

    // Replay the finished turn as a UI message stream: the tool parts carry the
    // structured deals (which the TUI renders as its existing game cards), then
    // the assistant text.
    const stream = createUIMessageStream({
      execute: ({ writer }) => {
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

        const textId = crypto.randomUUID();
        writer.write({ type: "text-start", id: textId });
        writer.write({ type: "text-delta", id: textId, delta: result.text });
        writer.write({ type: "text-end", id: textId });
      }
    });

    return createUIMessageStreamResponse({ stream });
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

export default {
  async fetch(request: Request, env: Env) {
    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
