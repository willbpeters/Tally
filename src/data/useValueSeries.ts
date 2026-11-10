import { useMemo } from "react";
import { localIsoDate } from "../domain/dates";
import {
  useAccounts, useTransactions, useSyncedHoldings, useBankTransactions, usePriceHistoryRows, useHandAddedTotals,
  useSecurities, useMarketChart,
} from "./queries";
import { heldSecurities } from "./useLivePrices";
import { reconstructSeries, type PriceRow } from "../domain/history";
import { localKey, timeline, withIntraday, type Timeframe } from "../domain/charts";
import type { ValuePoint } from "../domain/types";

/**
 * How far back the value chart is rebuilt.
 *
 * Ninety days is a data limit, not a preference. SimpleFIN reports the holdings
 * you have now and keeps roughly three months of transactions, so beyond this
 * the share counts and cash balances stop being reconstructible and the line
 * would be invention rather than history.
 */
export const HISTORY_DAYS = 90;

/** The Dashboard's timeframes: only those the 90 days above can support. */
export type DashboardTimeframe = Extract<Timeframe, "1d" | "1w" | "1m" | "3m">;

/** Calendar days each timeframe covers, for the daily line used when live bars are unavailable. */
const WINDOW_DAYS: Record<DashboardTimeframe, number> = { "1d": 1, "1w": 7, "1m": 30, "3m": HISTORY_DAYS };

function isoDaysAgo(days: number, now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** The daily line trimmed to a timeframe — but never below two points just because the window is narrow. */
function clip(series: ValuePoint[], days: number): ValuePoint[] {
  const cutoff = isoDaysAgo(days);
  const clipped = series.filter((p) => p.date >= cutoff);
  return clipped.length >= 2 ? clipped : series.slice(-2);
}

/**
 * The portfolio's value over a timeframe, rebuilt from holdings, prices and
 * cash movements rather than read back from the daily snapshots.
 *
 * Holdings are priced from live intraday bars — every 2 minutes for a day, up
 * to hourly for three months — so the line moves the way a quote screen's
 * does. Cash and card balances only change when a transaction posts, so they
 * step once a day between those bars. When the bars cannot be fetched the
 * line falls back to one point per trading day from the stored closes.
 */
export function useValueSeries(tf: DashboardTimeframe = "3m"): { series: ValuePoint[]; isLoading: boolean; live: boolean } {
  const today = localIsoDate();
  const from = isoDaysAgo(HISTORY_DAYS);

  const { data: accounts = [], isLoading: l1 } = useAccounts();
  const { data: txns = [], isLoading: l2 } = useTransactions();
  const { data: synced = [], isLoading: l3 } = useSyncedHoldings();
  const { data: bankTxns = [], isLoading: l4 } = useBankTransactions(from, today);
  const { data: rows = [], isLoading: l5 } = usePriceHistoryRows(from);
  const { data: securities = [] } = useSecurities();
  const { data: handAdded = [], isLoading: l6 } = useHandAddedTotals();

  const held = useMemo(() => heldSecurities(synced, txns, securities), [synced, txns, securities]);
  const tickers = useMemo(() => held.map((s) => s.ticker), [held]);
  const { data: bars } = useMarketChart(tickers, tf);

  const result = useMemo(() => {
    const daily: PriceRow[] = rows.map(([security_id, date, close]) => ({ security_id, date, close }));
    const inputs = { accounts, txns, synced, bankTxns, handAdded, today, days: HISTORY_DAYS };
    if (bars && bars.length > 0) {
      const idFor = new Map(held.map((s) => [s.ticker.toUpperCase(), s.id]));
      const keys = timeline(bars).map(localKey);
      const series = reconstructSeries({ ...inputs, prices: withIntraday(daily, bars, idFor, tf), keys });
      if (series.length >= 2) return { series, live: true };
    }
    return { series: clip(reconstructSeries({ ...inputs, prices: daily }), WINDOW_DAYS[tf]), live: false };
  }, [accounts, txns, synced, bankTxns, handAdded, rows, today, bars, held, tf]);

  return { ...result, isLoading: l1 || l2 || l3 || l4 || l5 || l6 };
}
