import { useMemo } from "react";
import { useTransactions, useSecurities, useAccounts, useLatestPrices, usePreviousPrices, useSyncedHoldings, useHandAddedTotals } from "./queries";
import { derivePortfolio } from "../domain/portfolio";
export type { AccountBreakdown } from "../domain/portfolio";

export function usePortfolio() {
  const { data: txns = [], isLoading: l1 } = useTransactions();
  const { data: securities = [], isLoading: l2 } = useSecurities();
  const { data: accounts = [], isLoading: l3 } = useAccounts();
  const { data: latest = [], isLoading: l4 } = useLatestPrices();
  const { data: previous = [], isLoading: l5 } = usePreviousPrices();
  const { data: synced = [], isLoading: l6 } = useSyncedHoldings();
  const { data: handAdded = [], isLoading: l7 } = useHandAddedTotals();

  return useMemo(() => ({
    ...derivePortfolio({ txns, securities, accounts, latest, previous, synced, handAdded }),
    isLoading: l1 || l2 || l3 || l4 || l5 || l6 || l7,
  }), [txns, securities, accounts, latest, previous, synced, handAdded, l1, l2, l3, l4, l5, l6, l7]);
}
