import { useState } from "react";
import type { DashboardTimeframe } from "../../data/useValueSeries";
import { money, pct } from "../../ui/format";
import { Card, EmptyState, Segmented } from "../../ui/components";
import { PriceChart } from "../../ui/PriceChart";
import { useChartColors, type ChartColors } from "../../ui/chartColors";
import { TIMEFRAMES } from "../../domain/charts";
import type { PortfolioSummary, ValuePoint } from "../../domain/types";

// Only windows the data can actually support: the series is rebuilt from
// SimpleFIN holdings and transactions, which reach back about 90 days.
const DASHBOARD_TIMEFRAMES: DashboardTimeframe[] = ["1d", "1w", "1m", "3m"];

/**
 * Which line the value chart plots, and which tab is selected. Net worth is
 * not one: it is mostly cash and card balances, which change once a day, so
 * its line could never move like a price chart. It stays as the headline.
 */
export type Mode = "invested" | "cash" | "liabilities";
export const MODE_ORDER: Mode[] = ["invested", "cash", "liabilities"];

const SHARE_CAVEAT = "Share counts are today’s — SimpleFIN does not report holdings history.";

// The caveat has to change with the mode. The share-count caveat belongs to the
// investments line only — today's synced share counts are assumed to have been
// held throughout, which is what bounds the window to 90 days.
export const CHART_MODES: Record<Mode, { label: string; dataKey: keyof ValuePoint; subtitle: string }> = {
  invested: {
    label: "Investments", dataKey: "invested",
    subtitle: `Your holdings’ market value. Mutual funds move with the ETF that tracks the same index during the day, then settle to their real price at the close. A deposit does not move this line. ${SHARE_CAVEAT}`,
  },
  cash: {
    label: "Cash", dataKey: "cash",
    subtitle: "Your cash balances, walked back from today through the transactions posted since, so the line steps once a day. Brokerage cash is included.",
  },
  liabilities: {
    label: "Liabilities", dataKey: "liabilities",
    subtitle: "What you owe on credit accounts, walked back from today’s balance through the transactions posted since.",
  },
};

/** Today's figure for a tab. Liabilities stay negative here, as they enter net worth. */
function figure(mode: Mode, s: PortfolioSummary): number {
  switch (mode) {
    case "invested": return s.investedValue;
    case "cash": return s.cash;
    case "liabilities": return s.liabilities;
  }
}

/**
 * Investments are green when the line ends above where it started and red
 * below, as a quote screen colours them. Cash and debt have no good direction
 * to colour — more debt is not a gain — so they stay in the accent.
 */
function lineColor(mode: Mode, series: ValuePoint[], colors: ChartColors): string {
  if (mode !== "invested" || series.length < 2) return colors.accent;
  return series[series.length - 1].invested >= series[0].invested ? colors.pos : colors.neg;
}

const signed = (n: number, text: string) => `${n > 0 ? "+" : ""}${text}`;

/**
 * The Dashboard's main card. Net worth leads as a figure; the tabs beside it
 * each carry today's figure for one measure and pick the line the chart plots.
 * Investments + Cash + Liabilities = Net worth, so the row is checkable by eye. Today and All
 * time sit under Investments because that is all they measure — a deposit
 * changes net worth and must never move them.
 */
export function ValueCard({ summary, series, timeframe, onTimeframe }: {
  summary: PortfolioSummary;
  /** Already windowed to the timeframe: see `useValueSeries`. */
  series: ValuePoint[];
  timeframe?: DashboardTimeframe;
  onTimeframe?: (tf: DashboardTimeframe) => void;
}) {
  const colors = useChartColors();
  const [ownTimeframe, setOwnTimeframe] = useState<DashboardTimeframe>("3m");
  const tf = timeframe ?? ownTimeframe;
  const setTf = onTimeframe ?? setOwnTimeframe;
  const [mode, setMode] = useState<Mode>("invested");
  const [dollars, cents] = money(summary.totalValue).split(".");

  return (
    <Card>
      <div className="value-tabs">
        <div className="value-hero">
          <span className="cap">Net worth</span>
          <span className="hero-value">{dollars}<span className="hero-cents">.{cents}</span></span>
        </div>
        <div className="value-tablist" role="tablist">
        {MODE_ORDER.map((m) => {
          const fig = figure(m, summary);
          return (
            <button key={m} role="tab" aria-label={CHART_MODES[m].label} aria-selected={m === mode}
              onClick={() => setMode(m)}>
              <span className="cap">{CHART_MODES[m].label}</span>
              <span className={`n value-tab-figure${fig < 0 ? " neg" : ""}`}>{money(fig)}</span>
              {m === "invested" && (
                <span className="value-tab-sub">
                  <span className={summary.dayChange >= 0 ? "pos" : "neg"}>{signed(summary.dayChange, money(summary.dayChange))} today</span>
                  {" · "}
                  <span className={summary.unrealized >= 0 ? "pos" : "neg"}>{pct(summary.unrealizedPct)} all time</span>
                </span>
              )}
            </button>
          );
        })}
        </div>
      </div>

      <div className="row between center" style={{ marginBottom: 6 }}>
        <div className="card-subtitle">{CHART_MODES[mode].subtitle}</div>
        <Segmented<DashboardTimeframe> value={tf} onChange={setTf}
          items={TIMEFRAMES.filter((t) => (DASHBOARD_TIMEFRAMES as string[]).includes(t.value))
            .map((t) => ({ value: t.value as DashboardTimeframe, label: t.label }))} />
      </div>

      {series.length < 2 ? (
        <EmptyState title="Not enough price history yet"
          body="The chart is rebuilt from daily closes. Tally downloads them on first launch — if you have just connected an account, give it a moment and refresh." />
      ) : (
        <PriceChart tf={tf} color={lineColor(mode, series, colors)}
          points={series.map((p) => ({ x: p.date, value: p[CHART_MODES[mode].dataKey] as number }))} />
      )}
    </Card>
  );
}
