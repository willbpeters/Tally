/**
 * Price lines for the Charts screen and the Dashboard chart, assembled from the
 * live series `market_chart` returns. Pure, so the joining of many tickers'
 * bars into one line is unit-tested without a network.
 */
import type { PriceRow } from "./history";

/** The timeframes, in screen order. The bar size behind each is chosen in `market/chart.rs`. */
export type Timeframe = "1d" | "1w" | "1m" | "3m" | "1y" | "3y" | "5y" | "max";

export const TIMEFRAMES: { value: Timeframe; label: string; caption: string }[] = [
  { value: "1d", label: "1D", caption: "today" },
  { value: "1w", label: "1W", caption: "past week" },
  { value: "1m", label: "1M", caption: "past month" },
  { value: "3m", label: "3M", caption: "past 3 months" },
  { value: "1y", label: "1Y", caption: "past year" },
  { value: "3y", label: "3Y", caption: "past 3 years" },
  { value: "5y", label: "5Y", caption: "past 5 years" },
  { value: "max", label: "MAX", caption: "all time" },
];

/** One symbol's line from `market_chart`: (unix seconds, close), oldest first. */
export interface ChartSeries {
  symbol: string;
  /** The close before the first point: what a 1-day move is measured from. */
  previous_close: number | null;
  points: [number, number][];
  /** A mutual fund on an intraday chart: one close a day, each at the session's close. */
  daily_only: boolean;
  /** A daily-only fund whose day was filled in from the ETF tracking the same index. */
  estimated: boolean;
}

export interface LinePoint {
  /** Unix seconds. */
  t: number;
  value: number;
}

/** Timeframes drawn from intraday bars, which the screens refetch every minute while the market is open. */
export function isIntraday(tf: Timeframe): boolean {
  return tf === "1d" || tf === "1w" || tf === "1m";
}

/**
 * The instants a combined line is drawn at: every bar time any series has,
 * from where the longest series starts.
 *
 * The longest series sets the chart's window. Without that rule a mutual
 * fund's lone daily bar from yesterday's close would open a 1-day chart a
 * day early, ahead of the stocks' first 2-minute bar.
 */
export function timeline(series: ChartSeries[]): number[] {
  const longest = series.reduce<ChartSeries | null>(
    (best, s) => (best == null || s.points.length > best.points.length ? s : best), null);
  if (!longest) return [];
  const start = longest.points[0][0];
  const all = new Set<number>();
  for (const s of series) for (const [t] of s.points) if (t >= start) all.add(t);
  return [...all].sort((a, b) => a - b);
}

/**
 * The fallback for a fund with no tracking ETF (see `proxy_for` in
 * `market/benchmarks.rs`): its daily closes joined by straight lines across
 * the bars between them, as a daily chart would draw them. Held flat instead, a portfolio that is
 * mostly funds drew a staircase: level all day, then a cliff at each close.
 *
 * The join is by position on the timeline, not by clock time, because the
 * chart spaces bars evenly; by clock time nearly all of each move would land
 * on the one overnight segment and the cliff would be back.
 *
 * Not on a 1-day chart: there the fund's single close is the day's only news
 * about it, and spreading it back across the morning would show a move before
 * anyone could know it. Nothing is invented past the last close either.
 *
 * The previous close stands at the chart's first bar, so the first day ramps
 * up to its close like the rest instead of sitting flat and then jumping.
 */
export function betweenCloses(s: ChartSeries, times: number[], tf: Timeframe): ChartSeries {
  if (!s.daily_only || s.estimated || tf === "1d") return s;
  const start = times[0];
  const pts: [number, number][] = s.previous_close != null && start != null && start < s.points[0]?.[0]
    ? [[start, s.previous_close], ...s.points]
    : s.points;
  if (pts.length < 2) return s;
  const first = pts[0][0];
  const last = pts[pts.length - 1][0];
  const all = [...new Set([...times.filter((t) => t > first && t < last), ...pts.map(([t]) => t)])]
    .sort((a, b) => a - b);
  const pos = new Map(all.map((t, i) => [t, i]));
  const out: [number, number][] = [];
  let j = 0;
  for (const t of all) {
    while (j < pts.length - 1 && pts[j + 1][0] <= t) j++;
    const [t0, v0] = pts[j];
    if (t === t0 || j === pts.length - 1) { out.push([t, v0]); continue; }
    const [t1, v1] = pts[j + 1];
    const share = (pos.get(t)! - pos.get(t0)!) / (pos.get(t1)! - pos.get(t0)!);
    out.push([t, v0 + (v1 - v0) * share]);
  }
  return { ...s, points: out };
}

export interface HeldLine {
  ticker: string;
  shares: number;
  /** Today's value, held flat for a ticker Yahoo has no line for. */
  marketValue: number;
}

export interface CombinedLine {
  points: LinePoint[];
  /** What the holdings were worth at the previous close, when every one of them says. */
  base: number | null;
  /** Holdings with no line, counted at today's value throughout. */
  unpriced: string[];
}

/**
 * Today's holdings priced along the timeframe: today's share counts times each
 * bar's close, summed.
 *
 * Before a ticker's first bar its previous close stands in, but only on
 * intraday timeframes, where that is a few hours. Over years the instant is
 * skipped instead: a fund that did not exist yet would otherwise be priced at
 * a close it never had, and its arrival would read as a jump in value.
 */
export function holdingsLine(series: ChartSeries[], held: HeldLine[], tf: Timeframe): CombinedLine {
  const bySymbol = new Map(series.map((s) => [s.symbol.toUpperCase(), s]));
  const priced = held.filter((h) => bySymbol.has(h.ticker.toUpperCase()));
  const unpriced = held.filter((h) => !bySymbol.has(h.ticker.toUpperCase()));
  const flat = unpriced.reduce((sum, h) => sum + h.marketValue, 0);
  const fallback = isIntraday(tf);

  const times = timeline(priced.map((h) => bySymbol.get(h.ticker.toUpperCase())!));
  const walkers = priced.map((h) => {
    const s = betweenCloses(bySymbol.get(h.ticker.toUpperCase())!, times, tf);
    return { shares: h.shares, s, i: 0, last: fallback ? s.previous_close : null };
  });
  const points: LinePoint[] = [];
  for (const t of times) {
    let value = flat;
    let complete = true;
    for (const w of walkers) {
      while (w.i < w.s.points.length && w.s.points[w.i][0] <= t) w.last = w.s.points[w.i++][1];
      if (w.last == null) complete = false;
      else value += w.shares * w.last;
    }
    if (complete) points.push({ t, value });
  }

  const base = walkers.every((w) => w.s.previous_close != null)
    ? walkers.reduce((sum, w) => sum + w.shares * (w.s.previous_close as number), flat)
    : null;
  return { points, base: walkers.length > 0 ? base : null, unpriced: unpriced.map((h) => h.ticker) };
}

/** One ticker's line, as drawn on its own. */
export function singleLine(s: ChartSeries): LinePoint[] {
  return s.points.map(([t, value]) => ({ t, value }));
}

/**
 * What a timeframe's change is measured from. A day is measured from the
 * previous close, as every quote screen does; anything longer from its own
 * first point.
 */
export function baseline(points: LinePoint[], tf: Timeframe, previousClose: number | null): number | null {
  if (tf === "1d" && previousClose != null) return previousClose;
  return points[0]?.value ?? null;
}

/**
 * The most points a line is drawn with. A whole history of weekly closes runs
 * past a thousand; past a few hundred the line stops reading as a trend and
 * starts reading as noise.
 */
export const MAX_POINTS = 300;

/**
 * Every k-th point, always keeping the last so the line ends on today's
 * figure. Picking points rather than averaging them keeps the line jagged.
 */
export function thin<T>(points: T[], max: number = MAX_POINTS): T[] {
  if (points.length <= max) return points;
  const step = Math.ceil(points.length / max);
  const out = points.filter((_, i) => i % step === 0);
  if (out[out.length - 1] !== points[points.length - 1]) out.push(points[points.length - 1]);
  return out;
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * A bar time as a local "YYYY-MM-DDTHH:mm" key. It sorts with plain
 * "YYYY-MM-DD" dates and starts with the local calendar day, so the history
 * rebuild can mix intraday bars with daily closes and compare either against
 * a transaction's date.
 */
export function localKey(t: number): string {
  const d = new Date(t * 1000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A point's key — a date, or a `localKey` — back to a local Date. */
export function keyToDate(key: string): Date {
  const [y, m, d] = key.slice(0, 10).split("-").map(Number);
  const [hh, mm] = key.length > 10 ? key.slice(11, 16).split(":").map(Number) : [0, 0];
  return new Date(y, m - 1, d, hh, mm);
}

/**
 * Stored daily closes with intraday bars laid over them, for the Dashboard's
 * history rebuild.
 *
 * A ticker with a live line keeps only its daily closes from before that line
 * starts, so a fund priced at yesterday's close holds that close until its own
 * bar at today's close. A ticker with no live line keeps all of its closes.
 */
export function withIntraday(
  daily: PriceRow[], series: ChartSeries[], idFor: Map<string, number>, tf: Timeframe,
): PriceRow[] {
  const firstDay = new Map<number, string>();
  const rows: PriceRow[] = [];
  const times = timeline(series);
  for (const raw of series) {
    const s = betweenCloses(raw, times, tf);
    const id = idFor.get(s.symbol.toUpperCase());
    if (id == null || s.points.length === 0) continue;
    firstDay.set(id, localKey(s.points[0][0]).slice(0, 10));
    for (const [t, close] of s.points) rows.push({ security_id: id, date: localKey(t), close });
  }
  for (const r of daily) {
    const first = firstDay.get(r.security_id);
    if (first == null || r.date < first) rows.push(r);
  }
  return rows;
}

/** An axis tick: a time of day within one day, a day within months, a month beyond. */
export function axisLabel(d: Date, tf: Timeframe): string {
  if (tf === "1d") return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (tf === "3y" || tf === "5y" || tf === "max") {
    return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** A hover label: the date, and the time too where bars are under a day. */
export function tipLabel(d: Date, tf: Timeframe): string {
  const day = d.toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: isIntraday(tf) ? undefined : "numeric",
  });
  if (!isIntraday(tf)) return day;
  return `${day}, ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}
