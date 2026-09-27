// The scheduled price check: a Cloudflare Workflow whose steps each retry on
// their own, so one CheapShark hiccup does not cost a whole run.
//
// Triggered two ways, both of which land in DealScout.runPriceCheck (see
// server.ts): a persisted Durable Object alarm registered with `schedule()`,
// which wakes the agent daily even with nobody connected, and a dev-only route
// for demos.

import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { getCurrentPrice, type CurrentPrice } from "../src/api/cheapshark";
import {
  alertEmailBody,
  fallbackAlertText,
  qualifyDrops,
  type PriceDrop
} from "./priceCheck";
import { sendAlertEmail } from "./resend";
import type { Watch } from "./state";

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

/**
 * The workflow is fed its watchlist rather than reading it back out of the agent:
 * a run then describes one fixed set of watches, and the only thing it needs the
 * Durable Object for is the write at the end.
 */
export interface PriceCheckParams {
  /** The DealScout instance to report back to — "deal-scout" for this app. */
  agentName: string;
  watches: Watch[];
}

/** What DealScout.claimPriceAlerts hands back. Kept here so both sides agree. */
export interface ClaimedAlerts {
  claimed: PriceDrop[];
  /** Drops that a concurrent run had already alerted by the time we claimed. */
  alreadyNotified: number;
}

/** CheapShark is a free API; four in flight is polite and still fast. */
const FETCH_CONCURRENCY = 4;

/** Map with a bounded number of in-flight promises, preserving input order. */
async function mapWithConcurrency<In, Out>(
  items: In[],
  limit: number,
  fn: (item: In, index: number) => Promise<Out>
): Promise<Out[]> {
  const results = new Array<Out>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]!, index);
    }
  });
  await Promise.all(workers);
  return results;
}

export class PriceCheckWorkflow extends WorkflowEntrypoint<Env, PriceCheckParams> {
  async run(event: Readonly<WorkflowEvent<PriceCheckParams>>, step: WorkflowStep) {
    const { agentName, watches: rawWatches } = event.payload;

    // ── load ──────────────────────────────────────────────────────────────
    const watches = await step.do("load", async () => {
      // A watch without a gameID cannot be priced (gameID is the lookup key) and
      // one without a numeric target can never match, so both are dropped here
      // rather than being carried through every later step.
      const usable = (rawWatches ?? []).filter(
        (watch): watch is Watch =>
          watch != null &&
          typeof watch.gameID === "string" &&
          watch.gameID.length > 0 &&
          Number.isFinite(watch.targetPrice)
      );
      console.log(
        `[PriceCheck] ${agentName}: ${usable.length} watch(es) to price` +
          (usable.length === (rawWatches ?? []).length
            ? ""
            : ` (${(rawWatches ?? []).length - usable.length} unusable, skipped)`)
      );
      return usable;
    });

    if (watches.length === 0) {
      return { checked: 0, drops: 0, reason: "nothing watched" };
    }

    // ── fetchPrices ───────────────────────────────────────────────────────
    const prices = await step.do(
      "fetchPrices",
      {
        retries: { limit: 3, delay: "5 seconds", backoff: "exponential" },
        timeout: "1 minute"
      },
      async () => {
        const fetched = await mapWithConcurrency(
          watches,
          FETCH_CONCURRENCY,
          async (watch) => {
            // One game failing must not cost us the others — the same reasoning
            // as the per-candidate catch in DealScout.loadGameTags. A null here
            // means "no price this run", and qualifyDrops skips it.
            try {
              return await getCurrentPrice(watch.gameID);
            } catch (error) {
              console.error(
                `[PriceCheck] price lookup failed for ${watch.title} (${watch.gameID}):`,
                error instanceof Error ? error.message : error
              );
              return null;
            }
          }
        );
        const priced = fetched.filter((price) => price != null).length;
        console.log(`[PriceCheck] priced ${priced}/${watches.length} watch(es)`);
        return fetched satisfies (CurrentPrice | null)[];
      }
    );

    // ── compare ───────────────────────────────────────────────────────────
    const drops = await step.do("compare", async () => {
      const qualifying = qualifyDrops(watches, prices);
      console.log(
        `[PriceCheck] ${qualifying.length} qualifying drop(s): ` +
          (qualifying.map((drop) => `${drop.title} $${drop.salePrice}`).join(", ") || "none")
      );
      return qualifying;
    });

    if (drops.length === 0) {
      // Still recorded, so "when did you last check?" has an answer on a quiet day.
      await step.do("recordQuietRun", async () => {
        const stub = await this.agentStub(agentName);
        await stub.recordPriceCheck(new Date().toISOString());
        return { recorded: true };
      });
      return { checked: watches.length, drops: 0, reason: "no qualifying drops" };
    }

    // ── writeAlert ────────────────────────────────────────────────────────
    const summary = await step.do(
      "writeAlert",
      { retries: { limit: 1, delay: "2 seconds" } },
      async () => {
        // Never allowed to fail the run: if the model is down or slow, the alert
        // goes out with templated text instead. Prose is the garnish, not the
        // point.
        try {
          const lines = drops
            .map(
              (drop) =>
                `${drop.title}: now $${drop.salePrice.toFixed(2)}, ` +
                `normally $${drop.normalPrice.toFixed(2)}, ` +
                `${drop.savingsPercent}% off, the user's target was $${drop.targetPrice.toFixed(2)}`
            )
            .join("\n");

          const result = (await this.env.AI.run(MODEL, {
            max_tokens: 300,
            messages: [
              {
                role: "system",
                content:
                  "You are Deal Scout, alerting a user that games on their Steam " +
                  "watchlist dropped in price. Write at most three short, friendly " +
                  "sentences. State only the prices given to you — never invent a " +
                  "number, a title, a genre or a review score. Do not add a greeting, " +
                  "a sign-off, or a bulleted list; the list is rendered separately."
              },
              { role: "user", content: `These watched games dropped:\n${lines}` }
            ]
          })) as { response?: string };

          const text = result.response?.trim();
          if (!text) throw new Error("the model returned no text");
          return text;
        } catch (error) {
          console.error(
            "[PriceCheck] alert text generation failed, using the fallback:",
            error instanceof Error ? error.message : error
          );
          return fallbackAlertText(drops);
        }
      }
    );

    // ── notify ────────────────────────────────────────────────────────────
    // State write and email in ONE step, claim first, because the two side
    // effects are not equally repeatable: pricing a game twice is free, emailing
    // twice is spam.
    //
    // `claimPriceAlerts` writes lastNotifiedPrice and broadcasts to connected
    // clients, and returns only the drops it actually claimed. So if this step is
    // retried after a successful run, the claim comes back empty and no second
    // email is sent. The cost of that ordering is the reverse case — a Resend
    // failure after a successful claim is not retried, and that alert is only
    // logged. Chosen deliberately: a missed email beats a duplicate one.
    const notified = await step.do(
      "notify",
      { retries: { limit: 2, delay: "10 seconds" } },
      async () => {
        const stub = await this.agentStub(agentName);
        const { claimed, alreadyNotified } = await stub.claimPriceAlerts(
          drops,
          summary,
          new Date().toISOString()
        );

        if (claimed.length === 0) {
          console.log(
            `[PriceCheck] nothing to claim (${alreadyNotified} already notified) — no email sent`
          );
          return { claimed: 0, email: "skipped: already notified" };
        }

        const { subject, text, html } = alertEmailBody(claimed, summary);
        const result = await sendAlertEmail({
          apiKey: this.env.RESEND_API_KEY,
          to: this.env.NOTIFY_EMAIL,
          from: this.env.RESEND_FROM,
          subject,
          text,
          html
        });

        if (result.sent) {
          console.log(`[PriceCheck] email sent, Resend id ${result.id ?? "(none returned)"}`);
        } else if (result.skipped) {
          console.log(`[PriceCheck] email skipped — ${result.reason}`);
        } else {
          // Deliberately not thrown: see the note above about retries.
          console.error(`[PriceCheck] email FAILED — ${result.reason}`);
        }

        return {
          claimed: claimed.length,
          email: result.sent ? `sent:${result.id ?? "ok"}` : `${result.skipped ? "skipped" : "failed"}: ${result.reason}`
        };
      }
    );

    return {
      checked: watches.length,
      drops: drops.length,
      claimed: notified.claimed,
      email: notified.email
    };
  }

  /**
   * The DealScout instance to report to. Resolved per step rather than once, so a
   * step retried after hibernation gets a live stub.
   */
  private async agentStub(agentName: string) {
    const namespace = this.env.DealScout;
    return namespace.get(namespace.idFromName(agentName));
  }
}
