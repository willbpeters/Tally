import { describe, it, expect } from "vitest";
import { withFundQuotes } from "./liveFunds";
import { buildSummary } from "./summary";
import type { ChartSeries } from "./charts";
import type { Holding } from "./types";

const fund = (over: Partial<ChartSeries> = {}): ChartSeries => ({
  symbol: "SWPPX", previous_close: 19.07, points: [], daily_only: true, estimated: false, ...over,
});
const ids = new Map([["SWPPX", 1], ["GOOG", 2]]);
// Stored closes on a Monday before the NAV is out: Friday's and Thursday's.
const stored = { latest: [[1, 19.07], [2, 286.01]] as [number, number][], previous: [[1, 19.01], [2, 283.93]] as [number, number][] };

describe("withFundQuotes", () => {
  it("prices a fund at its ETF estimate and measures today from its last real close", () => {
    const live = fund({ estimated: true, points: [[100, 19.3], [200, 19.5]] });
    const got = withFundQuotes(stored.latest, stored.previous, [live], ids);
    expect(new Map(got.latest).get(1)).toBe(19.5);
    expect(new Map(got.previous).get(1)).toBe(19.07);
  });

  // Without this, "today" counted Friday's move (19.01 -> 19.07) as Monday's.
  it("gives a fund with no price yet today no move, rather than the last session's", () => {
    const got = withFundQuotes(stored.latest, stored.previous, [fund()], ids);
    expect(new Map(got.latest).get(1)).toBe(19.07);
    expect(new Map(got.previous).get(1)).toBe(19.07);
  });

  it("leaves stocks to their own stored prices", () => {
    const stock: ChartSeries = { symbol: "GOOG", previous_close: 283.93, points: [[1, 280]], daily_only: false, estimated: false };
    const got = withFundQuotes(stored.latest, stored.previous, [stock], ids);
    expect(new Map(got.latest).get(2)).toBe(286.01);
    expect(new Map(got.previous).get(2)).toBe(283.93);
  });

  it("changes nothing without live data", () => {
    const got = withFundQuotes(stored.latest, stored.previous, [], ids);
    expect(got.latest).toEqual(stored.latest);
    expect(got.previous).toEqual(stored.previous);
  });

  it("feeds the Dashboard's today figure", () => {
    const h = { security_id: 1, shares: 100, lastPrice: 19.5, marketValue: 1950 } as Holding;
    const live = fund({ estimated: true, points: [[200, 19.5]] });
    const got = withFundQuotes(stored.latest, stored.previous, [live], ids);
    const s = buildSummary([h], 0, new Map(got.previous));
    expect(s.dayChange).toBeCloseTo(100 * (19.5 - 19.07));
  });
});
