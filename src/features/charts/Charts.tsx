import { useMemo, useState } from "react";
import { PageHeader, Card, EmptyState, Segmented } from "../../ui/components";
import { PriceChart, type ChartPoint } from "../../ui/PriceChart";
import { money, pct } from "../../ui/format";
import { useChartColors } from "../../ui/chartColors";
import { usePortfolio } from "../../data/usePortfolio";
import { useMarketChart, useSecurities } from "../../data/queries";
import {
  TIMEFRAMES, holdingsLine, singleLine, baseline, thin, localKey, keyToDate, tipLabel,
  type ChartSeries, type LinePoint, type Timeframe,
} from "../../domain/charts";

const ALL = "__all__";

/** Where a line ends against where its timeframe measures from. */
function changeOf(points: LinePoint[], tf: Timeframe, previousClose: number | null) {
  const from = baseline(points, tf, previousClose);
  const last = points[points.length - 1]?.value;
  if (from == null || last == null) return null;
  return { last, change: last - from, pct: from !== 0 ? ((last - from) / from) * 100 : 0 };
}

function Change({ c, caption }: { c: { change: number; pct: number }; caption?: string }) {
  const tone = c.change > 0 ? "pos" : c.change < 0 ? "neg" : "";
  return (
    <span className={tone}>
      {c.change > 0 ? "+" : ""}{money(c.change)} ({pct(c.pct)}){caption && <span className="muted"> {caption}</span>}
    </span>
  );
}

/**
 * Your investments as price charts: all of them together, or one at a time,
 * over a day through to their whole history.
 */
export function Charts() {
  const { holdings, isLoading } = usePortfolio();
  const { data: securities = [] } = useSecurities();
  const colors = useChartColors();
  const [tf, setTf] = useState<Timeframe>("1d");
  const [pick, setPick] = useState<string>(ALL);
  // The point under the cursor. While there is one, the header reads it out,
  // measured from the same baseline as the timeframe's own change.
  const [hover, setHover] = useState<ChartPoint | null>(null);

  const held = useMemo(
    () => holdings.filter((h) => h.shares > 0).sort((a, b) => b.marketValue - a.marketValue),
    [holdings],
  );
  const tickers = useMemo(() => held.map((h) => h.ticker), [held]);
  const names = useMemo(() => new Map(securities.map((s) => [s.id, s.name])), [securities]);
  const chart = useMarketChart(tickers, tf);
  const series: ChartSeries[] = useMemo(() => chart.data ?? [], [chart.data]);
  const find = (ticker: string) => series.find((s) => s.symbol.toUpperCase() === ticker.toUpperCase());

  const view = useMemo(() => {
    if (pick === ALL) {
      const line = holdingsLine(series, held.map((h) => (
        { ticker: h.ticker, shares: h.shares, marketValue: h.marketValue })), tf);
      return { points: line.points, previous: line.base, unpriced: line.unpriced, estimated: false };
    }
    const s = series.find((x) => x.symbol.toUpperCase() === pick.toUpperCase());
    return {
      points: s ? singleLine(s) : [], previous: s?.previous_close ?? null, unpriced: [] as string[],
      estimated: s?.estimated ?? false,
    };
  }, [series, held, pick, tf]);

  const drawn = useMemo(() => thin(view.points).map((p) => ({ x: localKey(p.t), value: p.value })), [view.points]);
  const change = changeOf(view.points, tf, view.previous);
  const caption = TIMEFRAMES.find((t) => t.value === tf)!.caption;
  const from = change ? change.last - change.change : null;
  const shown = hover && from != null
    ? { last: hover.value, change: hover.value - from, pct: from !== 0 ? ((hover.value - from) / from) * 100 : 0 }
    : change;
  const shownCaption = hover ? tipLabel(keyToDate(hover.x), tf) : caption;
  const pickedHolding = held.find((h) => h.ticker === pick);

  if (isLoading) return <p className="muted">Loading…</p>;

  return (
    <>
      <PageHeader subtitle="Your investments over time, from a day to their whole history" />

      {held.length === 0 ? (
        <Card><EmptyState title="Nothing invested yet" body="Holdings appear here once you have them." /></Card>
      ) : (
        <>
          <Card>
            <div className="row between center" style={{ marginBottom: 10 }}>
              <div>
                <div className="cap">
                  {pick === ALL ? "All holdings" : `${pick}${pickedHolding && names.get(pickedHolding.security_id) ? ` · ${names.get(pickedHolding.security_id)}` : ""}`}
                </div>
                <div className="hero-value n">{shown ? money(shown.last) : "—"}</div>
                <div style={{ fontSize: 13, marginTop: 4 }}>
                  {shown ? <Change c={shown} caption={shownCaption} /> : <span className="muted">&nbsp;</span>}
                </div>
              </div>
              <Segmented<Timeframe> value={tf} onChange={setTf}
                items={TIMEFRAMES.map((t) => ({ value: t.value, label: t.label }))} />
            </div>

            {chart.isError ? (
              <div className="notice neg">Couldn't load prices from Yahoo. Check your connection and try again.</div>
            ) : drawn.length < 2 ? (
              <div className="chart-placeholder muted" style={{ height: 340 }}>
                {chart.isFetching ? "Loading chart…" : "No prices for this timeframe."}
              </div>
            ) : (
              <PriceChart points={drawn} tf={tf} onHover={setHover}
                color={change && change.change < 0 ? colors.neg : colors.pos}
                base={tf === "1d" ? view.previous : null} />
            )}

            <p className="card-subtitle" style={{ marginTop: 8 }}>
              {pick === ALL
                ? "What you hold today, priced back through time — today's share counts, not what you held then. Mutual funds move with the ETF that tracks the same index during the day, then settle to their real price at the close."
                : view.estimated
                  ? "Price per share. A mutual fund prices once a day, after the close; during the day this follows the ETF that tracks the same index."
                  : "Price per share."}
              {tf === "1d" && " The dotted line is the previous close."}
              {view.unpriced.length > 0 && ` ${view.unpriced.join(", ")} ${view.unpriced.length === 1 ? "has" : "have"} no price history and ${view.unpriced.length === 1 ? "is" : "are"} counted at today's value.`}
            </p>
          </Card>

          <Card title="Your holdings" subtitle={`How each one moved ${
            tf === "1d" ? "today" : tf === "max" ? "over its whole history" : `over the ${caption}`
          }. Pick one to chart it on its own.`}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th className="left">Holding</th><th>Price</th><th>Change</th><th>Value</th></tr>
                </thead>
                <tbody>
                  <tr className={`pick-row${pick === ALL ? " on" : ""}`} aria-selected={pick === ALL} onClick={() => setPick(ALL)}>
                    <td className="left"><span className="cell-primary">All holdings</span></td>
                    <td />
                    <td>{pick === ALL && change ? <Change c={change} /> : ""}</td>
                    <td className="n">{money(held.reduce((sum, h) => sum + h.marketValue, 0))}</td>
                  </tr>
                  {held.map((h) => {
                    const s = find(h.ticker);
                    const c = s ? changeOf(singleLine(s), tf, s.previous_close) : null;
                    return (
                      <tr key={h.security_id} className={`pick-row${pick === h.ticker ? " on" : ""}`}
                        aria-selected={pick === h.ticker} onClick={() => setPick(h.ticker)}>
                        <td className="left">
                          <div className="cell-primary">{h.ticker}</div>
                          <div className="cell-secondary">{names.get(h.security_id) ?? ""}</div>
                        </td>
                        <td className="n">{c ? money(c.last) : money(h.lastPrice)}</td>
                        <td className="n">{c ? <Change c={c} /> : <span className="muted">—</span>}</td>
                        <td className="n">{money(h.marketValue)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </>
  );
}
