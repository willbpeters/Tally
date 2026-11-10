import type { ChartSeries } from "./charts";

type PriceList = [number, number][];

/**
 * The stored latest and previous closes, with each mutual fund's taken from
 * today's live 1-day line instead.
 *
 * A fund prices once a day, hours after the close, so all day its stored
 * latest close is the last session's and its previous close the one before.
 * Read as today, that put the fund at yesterday's value and counted
 * yesterday's move as today's. The live line has what the Dashboard chart
 * draws: the fund's last real close, and today's estimate from the ETF
 * tracking the same index (or the real NAV once it is out). A fund with no
 * tracking ETF and no NAV yet gets no move today, the honest answer.
 *
 * Stocks and ETFs keep their stored closes, which are already today's.
 */
export function withFundQuotes(
  latest: PriceList, previous: PriceList, live: ChartSeries[], idFor: Map<string, number>,
): { latest: PriceList; previous: PriceList } {
  const nowMap = new Map(latest);
  const beforeMap = new Map(previous);
  for (const s of live) {
    const id = idFor.get(s.symbol.toUpperCase());
    if (id == null || !s.daily_only || s.previous_close == null) continue;
    nowMap.set(id, s.points.length > 0 ? s.points[s.points.length - 1][1] : s.previous_close);
    beforeMap.set(id, s.previous_close);
  }
  return { latest: [...nowMap], previous: [...beforeMap] };
}
