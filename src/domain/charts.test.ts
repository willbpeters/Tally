import { describe, it, expect } from "vitest";
import {
  timeline, holdingsLine, baseline, thin, localKey, keyToDate, withIntraday, singleLine, betweenCloses,
  type ChartSeries,
} from "./charts";

const s = (symbol: string, points: [number, number][], previous_close: number | null = null, daily_only = false): ChartSeries =>
  ({ symbol, points, previous_close, daily_only, estimated: false });

describe("timeline", () => {
  it("starts where the longest series starts, so a fund's bar from yesterday cannot open the day", () => {
    const stock = s("GOOG", [[100, 1], [200, 1], [300, 1]]);
    const fundYesterday = s("SWPPX", [[50, 1]]);
    expect(timeline([stock, fundYesterday])).toEqual([100, 200, 300]);
  });

  it("merges every series' bar times in order, once each", () => {
    expect(timeline([s("A", [[1, 1], [3, 1], [5, 1]]), s("B", [[2, 1], [3, 1]])])).toEqual([1, 2, 3, 5]);
  });

  it("is empty with nothing to draw", () => {
    expect(timeline([])).toEqual([]);
  });
});

describe("holdingsLine", () => {
  it("sums today's shares times each bar's close", () => {
    const line = holdingsLine(
      [s("A", [[1, 10], [2, 11]], 9), s("B", [[1, 100], [2, 90]], 100)],
      [{ ticker: "A", shares: 2, marketValue: 22 }, { ticker: "B", shares: 1, marketValue: 90 }],
      "1y",
    );
    expect(line.points).toEqual([{ t: 1, value: 120 }, { t: 2, value: 112 }]);
  });

  it("holds a fund at its previous close until its bar at the close, on a day chart", () => {
    const stock = s("GOOG", [[100, 10], [200, 11], [300, 12]], 10);
    const fund = s("SWPPX", [[300, 21]], 20, true);
    const line = holdingsLine(
      [stock, fund],
      [{ ticker: "GOOG", shares: 1, marketValue: 12 }, { ticker: "SWPPX", shares: 1, marketValue: 21 }],
      "1d",
    );
    expect(line.points.map((p) => p.value)).toEqual([30, 31, 33]);
    expect(line.base).toBe(30);
  });

  it("over years, skips the time before a holding existed instead of inventing its price", () => {
    const old = s("LLY", [[1, 10], [2, 10], [3, 10]], 5);
    const young = s("GOOG", [[3, 50]], 40);
    const line = holdingsLine(
      [old, young],
      [{ ticker: "LLY", shares: 1, marketValue: 10 }, { ticker: "GOOG", shares: 1, marketValue: 50 }],
      "max",
    );
    expect(line.points).toEqual([{ t: 3, value: 60 }]);
  });

  it("counts a ticker with no line at today's value throughout, and names it", () => {
    const line = holdingsLine(
      [s("A", [[1, 10], [2, 12]])],
      [{ ticker: "A", shares: 1, marketValue: 12 }, { ticker: "SWVXX", shares: 500, marketValue: 500 }],
      "1y",
    );
    expect(line.points.map((p) => p.value)).toEqual([510, 512]);
    expect(line.unpriced).toEqual(["SWVXX"]);
  });

  it("matches tickers whatever their case", () => {
    const line = holdingsLine([s("GOOG", [[1, 10]])], [{ ticker: "goog", shares: 2, marketValue: 20 }], "1y");
    expect(line.points).toEqual([{ t: 1, value: 20 }]);
  });
});

describe("baseline", () => {
  const pts = singleLine(s("A", [[1, 10], [2, 12]]));

  it("measures a day from the previous close", () => {
    expect(baseline(pts, "1d", 9)).toBe(9);
  });

  it("measures anything longer from its first point", () => {
    expect(baseline(pts, "1y", 9)).toBe(10);
  });

  it("falls back to the first point when the previous close is unknown", () => {
    expect(baseline(pts, "1d", null)).toBe(10);
  });
});

describe("thin", () => {
  it("leaves a short line alone", () => {
    const pts = [1, 2, 3];
    expect(thin(pts, 10)).toBe(pts);
  });

  it("keeps at most about the limit and always ends on the last point", () => {
    const pts = Array.from({ length: 1255 }, (_, i) => i);
    const out = thin(pts, 800);
    expect(out.length).toBeLessThanOrEqual(801);
    expect(out[out.length - 1]).toBe(1254);
    expect(out[0]).toBe(0);
  });
});

describe("local keys", () => {
  it("sort after the same day's plain date, and round-trip to the same local time", () => {
    const t = new Date(2026, 9, 30, 14, 5).getTime() / 1000;
    const key = localKey(t);
    expect(key).toBe("2026-10-30T14:05");
    expect("2026-10-30" < key && key < "2026-10-31").toBe(true);
    expect(keyToDate(key).getTime()).toBe(t * 1000);
    expect(keyToDate("2026-10-30").getDate()).toBe(30);
  });
});

describe("withIntraday", () => {
  const t = (h: number) => new Date(2026, 9, 30, h, 0).getTime() / 1000;
  const ids = new Map([["GOOG", 1], ["SWPPX", 2]]);

  it("keeps a ticker's daily closes only from before its live line starts", () => {
    const rows = withIntraday(
      [
        { security_id: 1, date: "2026-10-29", close: 280 },
        { security_id: 1, date: "2026-10-30", close: 278 },
      ],
      [s("GOOG", [[t(10), 279]])],
      ids, "1m",
    );
    expect(rows).toEqual([
      { security_id: 1, date: "2026-10-30T10:00", close: 279 },
      { security_id: 1, date: "2026-10-29", close: 280 },
    ]);
  });

  it("keeps every close for a ticker with no live line", () => {
    const daily = [{ security_id: 3, date: "2026-10-30", close: 1 }];
    expect(withIntraday(daily, [s("GOOG", [[t(10), 279]])], ids, "1m")).toContainEqual(daily[0]);
  });
});

describe("betweenCloses", () => {
  const fund = s("SWPPX", [[100, 10], [400, 13]], null, true);
  const times = [100, 200, 300, 400, 500];

  it("joins a fund's closes by position across the bars between them", () => {
    expect(betweenCloses(fund, times, "1w").points).toEqual([[100, 10], [200, 11], [300, 12], [400, 13]]);
  });

  it("spaces by bar, not by clock, so a long night takes no more of the move than an hour", () => {
    const got = betweenCloses(fund, [100, 110, 400], "1w").points;
    expect(got).toEqual([[100, 10], [110, 11.5], [400, 13]]);
  });

  it("invents nothing past the last close, and leaves a 1-day chart stepped", () => {
    expect(betweenCloses(fund, times, "1w").points.some(([t]) => t > 400)).toBe(false);
    expect(betweenCloses(fund, times, "1d")).toBe(fund);
  });

  it("ramps the first day up from the previous close", () => {
    const got = betweenCloses(s("SWPPX", [[300, 12]], 9, true), [100, 200, 300], "1w").points;
    expect(got).toEqual([[100, 9], [200, 10.5], [300, 12]]);
  });

  it("leaves a fund already estimated from its ETF alone", () => {
    const estimated = { ...fund, estimated: true };
    expect(betweenCloses(estimated, times, "1w")).toBe(estimated);
  });

  it("leaves a stock alone", () => {
    const stock = s("GOOG", [[100, 1], [400, 2]]);
    expect(betweenCloses(stock, times, "1w")).toBe(stock);
  });
});
