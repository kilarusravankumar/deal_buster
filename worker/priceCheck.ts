// Decision logic for the scheduled price check.
//
// Deliberately free of `cloudflare:workers` imports and of any I/O: this is the
// part worth unit-testing, and `tests/` is typechecked under the Bun project
// (see tsconfig.json), which knows nothing about workerd's module namespace.
// The WorkflowEntrypoint that calls this lives in ./priceCheckWorkflow.ts.

import type { CurrentPrice } from "../src/api/cheapshark";
import type { Watch } from "./state";

/** A watch whose current Steam price is worth telling the user about. */
export interface PriceDrop {
  gameID: string;
  title: string;
  steamAppID?: string;
  /** The price the user asked to be alerted at. */
  targetPrice: number;
  salePrice: number;
  normalPrice: number;
  savingsPercent: number;
  /** What the previous alert for this watch quoted, if there was one. */
  previousNotifiedPrice?: number;
}

/**
 * Which watches have genuinely dropped.
 *
 * `prices` is positional against `watches` — a `null` is a game we could not
 * price this run (fetch failed, delisted, or no Steam row) and is skipped
 * rather than treated as free.
 *
 * Two conditions, and the second is the interesting one:
 *
 *  1. `salePrice <= targetPrice` — it hit the number the user asked for.
 *  2. it is a NEW LOW: nothing has been alerted for this watch yet, or the price
 *     is strictly below what the last alert quoted.
 *
 * (2) is what stops a daily run from re-sending the same alert every morning for
 * as long as a sale lasts. Note it is strictly-below, not "differs from": a game
 * alerted at $6.24 that ticks up to $6.99 is still under a $8 target, but the
 * user has already been told about a better price than that, so saying anything
 * would be noise.
 */
export function qualifyDrops(
  watches: Watch[],
  prices: (CurrentPrice | null)[]
): PriceDrop[] {
  const drops: PriceDrop[] = [];

  watches.forEach((watch, index) => {
    const price = prices[index];
    if (price == null) return;
    if (price.salePrice > watch.targetPrice) return;

    const previous = watch.lastNotifiedPrice;
    if (previous != null && price.salePrice >= previous) return;

    drops.push({
      gameID: watch.gameID,
      // The watch's title is what the user asked for and what they will
      // recognise; CheapShark's is the fallback for a watch stored without one.
      title: watch.title || price.title,
      ...(watch.steamAppID ?? price.steamAppID
        ? { steamAppID: watch.steamAppID ?? price.steamAppID! }
        : {}),
      targetPrice: watch.targetPrice,
      salePrice: price.salePrice,
      normalPrice: price.normalPrice,
      savingsPercent: price.savingsPercent,
      ...(previous != null ? { previousNotifiedPrice: previous } : {})
    });
  });

  return drops;
}

const usd = (value: number) => `$${value.toFixed(2)}`;

/** One drop as a single line, the shared spine of every rendering below. */
function dropLine(drop: PriceDrop): string {
  const parts = [
    `${drop.title} — ${usd(drop.salePrice)}`,
    `was ${usd(drop.normalPrice)}`,
    `${drop.savingsPercent}% off`
  ];
  return `${parts.join(", ")} (target ${usd(drop.targetPrice)})`;
}

/**
 * Alert text written without the model. Used when the AI call fails, because
 * generating prose must never be what stops an alert going out.
 */
export function fallbackAlertText(drops: PriceDrop[]): string {
  if (drops.length === 0) return "No watched games have dropped.";
  const heading =
    drops.length === 1
      ? "A game on your watchlist dropped:"
      : `${drops.length} games on your watchlist dropped:`;
  return [heading, ...drops.map((drop) => `• ${dropLine(drop)}`)].join("\n");
}

/** The email subject: names the game when there is only one. */
export function alertSubject(drops: PriceDrop[]): string {
  if (drops.length === 1) {
    return `💰 Price drop: ${drops[0]!.title} is ${usd(drops[0]!.salePrice)}`;
  }
  return `💰 Price drops: ${drops.length} watched games`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const steamUrl = (drop: PriceDrop) =>
  drop.steamAppID ? `https://store.steampowered.com/app/${drop.steamAppID}` : null;

/**
 * The digest email body. One email per run covering every drop — a run that
 * finds eight cheap games should not send eight emails.
 *
 * `summary` is the model's prose (or the fallback); the table beneath it is
 * built from the numbers, so every figure in the email comes from a tool result
 * even if the model wrote something loose above it.
 */
export function alertEmailBody(
  drops: PriceDrop[],
  summary: string
): { subject: string; text: string; html: string } {
  const text = [summary, "", ...drops.map((drop) => `• ${dropLine(drop)}`)]
    .join("\n")
    .trim();

  const rows = drops
    .map((drop) => {
      const url = steamUrl(drop);
      const name = escapeHtml(drop.title);
      const link = url ? `<a href="${url}">${name}</a>` : name;
      return `<li><strong>${link}</strong> — ${usd(drop.salePrice)} <span style="color:#6b7280">(was ${usd(
        drop.normalPrice
      )}, ${drop.savingsPercent}% off — your target was ${usd(drop.targetPrice)})</span></li>`;
    })
    .join("\n");

  const html = `<div style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5">
<p>${escapeHtml(summary).replace(/\n/g, "<br>")}</p>
<ul>
${rows}
</ul>
<p style="color:#6b7280;font-size:12px">Sent by Deal Buster · prices from CheapShark, Steam only</p>
</div>`;

  return { subject: alertSubject(drops), text, html };
}
