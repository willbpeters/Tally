import { useMemo } from "react";
import { useTransactions, useSecurities, useAccounts, useSyncedHoldings, useHandAddedTotals } from "./queries";
import { useLivePrices } from "./useLivePrices";
import { derivePortfolio } from "../domain/portfolio";
export type { AccountBreakdown } from "../domain/portfolio";

export function usePortfolio() {
  const { data: txns = [], isLoading: l1 } = useTransactions();
  const { data: securities = [], isLoading: l2 } = useSecurities();
  const { data: accounts = [], isLoading: l3 } = useAccounts();
  const { latest, previous, isLoading: l4 } = useLivePrices();
  const { data: synced = [], isLoading: l6 } = useSyncedHoldings();
  const { data: handAdded = [], isLoading: l7 } = useHandAddedTotals();

  return useMemo(() => ({
    ...derivePortfolio({ txns, securities, accounts, latest, previous, synced, handAdded }),
    isLoading: l1 || l2 || l3 || l4 || l6 || l7,
  }), [txns, securities, accounts, latest, previous, synced, handAdded, l1, l2, l3, l4, l6, l7]);
}
