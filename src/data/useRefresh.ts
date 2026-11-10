import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { keys } from "./queries";
import { localIsoDate } from "../domain/dates";
import { derivePortfolio } from "../domain/portfolio";

export function useRefreshPrices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const updated = await api.prices.refresh();
      await qc.invalidateQueries({ queryKey: keys.latest });
      await qc.invalidateQueries({ queryKey: keys.previous });
      // The Dashboard chart's last daily point is today's close.
      await qc.invalidateQueries({ queryKey: ["prices", "history"] });
      // Funds are priced from the live 1-day line (see `useLivePrices`). After
      // the close it is otherwise cached for half an hour, and a fund's NAV
      // landing in the stored closes would sit beside a stale estimate.
      await qc.invalidateQueries({ queryKey: ["market", "chart", "1d"] });

      // Recompute total value with the same derivation the screens use, then
      // record today's snapshot for the chart.
      const [txns, securities, accounts, latest, previous, synced, handAdded] = await Promise.all([
        api.transactions.list(), api.securities.list(), api.accounts.list(),
        api.prices.latest(), api.prices.previous(), api.syncedHoldings.list(),
        api.bankTransactions.handAddedTotals(),
      ]);
      const { summary } = derivePortfolio({ txns, securities, accounts, latest, previous, synced, handAdded });
      await api.snapshots.record(localIsoDate(), summary.totalValue);
      await qc.invalidateQueries({ queryKey: keys.snapshots });
      return updated;
    },
  });
}
