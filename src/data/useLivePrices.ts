import { useMemo } from "react";
import { useLatestPrices, usePreviousPrices, useMarketChart, useSecurities, useSyncedHoldings, useTransactions } from "./queries";
import { withFundQuotes } from "../domain/liveFunds";
import type { Security, SyncedHolding, Transaction } from "../domain/types";

/** Everything held: synced holdings, and anything bought or sold by hand. */
export function heldSecurities(synced: SyncedHolding[], txns: Transaction[], securities: Security[]): Security[] {
  const ids = new Set<number>([
    ...synced.map((h) => h.security_id),
    ...txns.filter((t) => t.security_id != null && (t.type === "buy" || t.type === "sell"))
      .map((t) => t.security_id as number),
  ]);
  return securities.filter((s) => ids.has(s.id));
}

/**
 * The latest and previous closes every figure is priced from, with mutual
 * funds taken from today's live line — see `withFundQuotes`. It is the same
 * 1-day line the Dashboard's 1D chart draws, so the cache is shared and the
 * headline and the chart cannot tell different stories about a fund.
 *
 * Until that line arrives, or if it cannot be fetched, the stored closes stand.
 */
export function useLivePrices() {
  const { data: latest = [], isLoading: l1 } = useLatestPrices();
  const { data: previous = [], isLoading: l2 } = usePreviousPrices();
  const { data: synced = [] } = useSyncedHoldings();
  const { data: txns = [] } = useTransactions();
  const { data: securities = [] } = useSecurities();

  const held = useMemo(() => heldSecurities(synced, txns, securities), [synced, txns, securities]);
  const tickers = useMemo(() => held.map((s) => s.ticker), [held]);
  const { data: live = [] } = useMarketChart(tickers, "1d");

  return useMemo(() => {
    const idFor = new Map(held.map((s) => [s.ticker.toUpperCase(), s.id]));
    return { ...withFundQuotes(latest, previous, live, idFor), isLoading: l1 || l2 };
  }, [latest, previous, live, held, l1, l2]);
}
