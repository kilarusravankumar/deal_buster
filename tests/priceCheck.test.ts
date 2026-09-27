// The price-check decision logic, with mocked prices. No network, no Workflow —
// qualifyDrops is pure, which is why it lives in worker/priceCheck.ts apart from
// the WorkflowEntrypoint that calls it.
import { expect, test, describe } from "bun:test";
import type { CurrentPrice } from "../src/api/cheapshark";
import {
  alertEmailBody,
  alertSubject,
  fallbackAlertText,
  qualifyDrops
} from "../worker/priceCheck";
import type { Watch } from "../worker/state";

function watch(over: Partial<Watch> = {}): Watch {
  return {
    gameID: "196149",
    title: "Hades",
    targetPrice: 10,
    addedAt: "2026-09-01T00:00:00.000Z",
    ...over
  };
}

function price(over: Partial<CurrentPrice> = {}): CurrentPrice {
  return {
    gameID: "196149",
    title: "Hades",
    steamAppID: "1145360",
    salePrice: 6.24,
    normalPrice: 24.99,
    savingsPercent: 75,
    dealID: "deal-1",
    ...over
  };
}

describe("qualifyDrops", () => {
  test("a first-ever drop below the target alerts", () => {
    const drops = qualifyDrops([watch()], [price()]);
    expect(drops).toHaveLength(1);
    expect(drops[0]!.title).toBe("Hades");
    expect(drops[0]!.salePrice).toBe(6.24);
    expect(drops[0]!.targetPrice).toBe(10);
    expect(drops[0]).not.toHaveProperty("previousNotifiedPrice");
  });

  test("a price exactly at the target alerts — the target is inclusive", () => {
    expect(qualifyDrops([watch({ targetPrice: 6.24 })], [price()])).toHaveLength(1);
  });

  test("a price above the target does not alert", () => {
    expect(qualifyDrops([watch({ targetPrice: 5 })], [price()])).toHaveLength(0);
  });

  test("the same price twice does not alert again", () => {
    const already = watch({ lastNotifiedPrice: 6.24 });
    expect(qualifyDrops([already], [price()])).toHaveLength(0);
  });

  test("a price above the last alerted one stays silent, even under the target", () => {
    // The user was already told about $6.24; $6.99 is worse news than that, so
    // saying anything would be noise. This is the rule that differs from a plain
    // "price changed" check.
    const already = watch({ lastNotifiedPrice: 6.24 });
    expect(qualifyDrops([already], [price({ salePrice: 6.99 })])).toHaveLength(0);
  });

  test("a new low alerts again and carries the previous price", () => {
    const already = watch({ lastNotifiedPrice: 6.24 });
    const drops = qualifyDrops([already], [price({ salePrice: 4.99 })]);
    expect(drops).toHaveLength(1);
    expect(drops[0]!.salePrice).toBe(4.99);
    expect(drops[0]!.previousNotifiedPrice).toBe(6.24);
  });

  test("a watch with no price this run is skipped, not treated as free", () => {
    expect(qualifyDrops([watch()], [null])).toHaveLength(0);
  });

  test("prices are matched to watches by position, and one failure costs only itself", () => {
    const watches = [
      watch({ gameID: "1", title: "Hades", targetPrice: 10 }),
      watch({ gameID: "2", title: "Metro Exodus", targetPrice: 5 }),
      watch({ gameID: "3", title: "Borderlands 2", targetPrice: 6 })
    ];
    const prices = [
      null, // lookup failed
      price({ gameID: "2", title: "Metro Exodus", salePrice: 2.99 }),
      price({ gameID: "3", title: "Borderlands 2", salePrice: 5.99 })
    ];
    const drops = qualifyDrops(watches, prices);
    expect(drops.map((drop) => drop.gameID)).toEqual(["2", "3"]);
    expect(drops.map((drop) => drop.title)).toEqual(["Metro Exodus", "Borderlands 2"]);
  });

  test("an empty watchlist yields nothing", () => {
    expect(qualifyDrops([], [])).toEqual([]);
  });

  test("the watch's own steamAppID wins over CheapShark's", () => {
    const drops = qualifyDrops(
      [watch({ steamAppID: "292030" })],
      [price({ steamAppID: "124923" })]
    );
    expect(drops[0]!.steamAppID).toBe("292030");
  });
});

describe("alert rendering", () => {
  const drops = qualifyDrops(
    [watch(), watch({ gameID: "2", title: "Metro Exodus", targetPrice: 5 })],
    [price(), price({ gameID: "2", title: "Metro Exodus", salePrice: 2.99, normalPrice: 39.99, savingsPercent: 93 })]
  );

  test("the fallback names every drop and its price", () => {
    const text = fallbackAlertText(drops);
    expect(text).toContain("2 games");
    expect(text).toContain("Hades — $6.24");
    expect(text).toContain("Metro Exodus — $2.99");
  });

  test("a single drop is named in the subject, several are counted", () => {
    expect(alertSubject([drops[0]!])).toBe("💰 Price drop: Hades is $6.24");
    expect(alertSubject(drops)).toBe("💰 Price drops: 2 watched games");
  });

  test("the email carries the model's summary plus the verified numbers", () => {
    const { subject, text, html } = alertEmailBody(drops, "Two of your games got cheaper!");
    expect(subject).toContain("2 watched games");
    expect(text).toStartWith("Two of your games got cheaper!");
    expect(text).toContain("Hades — $6.24, was $24.99, 75% off (target $10.00)");
    expect(html).toContain("store.steampowered.com/app/1145360");
    expect(html).toContain("$2.99");
  });

  test("html-unsafe text in a summary or title is escaped", () => {
    const { html } = alertEmailBody(
      qualifyDrops([watch({ title: "Hades <b>2</b>" })], [price()]),
      "price & value <script>"
    );
    expect(html).toContain("price &amp; value &lt;script&gt;");
    expect(html).toContain("Hades &lt;b&gt;2&lt;/b&gt;");
    expect(html).not.toContain("<script>");
  });
});
