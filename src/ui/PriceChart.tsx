import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts";
import { keyToDate, tipLabel, type Timeframe } from "../domain/charts";
import { money } from "./format";
import { useChartColors } from "./chartColors";

export interface ChartPoint {
  /** A date or a `localKey`: the x axis is the point's place in the list, not its time. */
  x: string;
  value: number;
}

/**
 * The hover readout: the point's date floating over the cursor, as Robinhood
 * shows it. The value goes with it unless the screen shows it in its own
 * header instead — see `onHover`.
 */
function Readout({ active, payload, label, tf, withValue }:
  { active?: boolean; payload?: { value: number }[]; label?: string; tf: Timeframe; withValue: boolean }) {
  if (!active || !payload?.length || label == null) return null;
  return (
    <div className="chart-readout">
      {withValue && <strong className="n">{money(payload[0].value)} </strong>}
      <span className="muted">{tipLabel(keyToDate(String(label)), tf)}</span>
    </div>
  );
}

/**
 * A price line as Robinhood draws one: straight segments between the points,
 * no fill, no grid, no axes. Straight segments once read as choppy, but that
 * was the mutual funds sitting flat all day and jumping at the close; with
 * their days estimated from tracking ETFs every point moves, and smoothing
 * only made the line look invented. Points are evenly spaced by
 * position, so nights and weekends take no room. Hovering shows a cursor and
 * the point's date; `onHover` hands the point to the screen so its header can
 * show the value there, which is where the eye already is. `base`, when given,
 * is the dotted previous close a day's move is measured from.
 */
export function PriceChart({ points, tf, color, base, height = 340, onHover }: {
  points: ChartPoint[]; tf: Timeframe; color: string; base?: number | null; height?: number;
  onHover?: (point: ChartPoint | null) => void;
}) {
  const colors = useChartColors();
  const values = points.map((p) => p.value);
  if (base != null) values.push(base);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  // A flat line still needs a band around it, or it sits on the chart's edge.
  const pad = (hi - lo) * 0.06 || Math.abs(hi) * 0.01 || 1;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={points} margin={{ left: 0, right: 0, top: 28, bottom: 8 }}
        onMouseMove={(state) => {
          if (!onHover) return;
          const i = Number(state?.activeTooltipIndex);
          onHover(Number.isInteger(i) && points[i] ? points[i] : null);
        }}
        onMouseLeave={() => onHover?.(null)}>
        <XAxis dataKey="x" hide />
        <YAxis hide domain={[lo - pad, hi + pad]} />
        <Tooltip content={<Readout tf={tf} withValue={!onHover} />} position={{ y: 0 }} offset={0}
          cursor={{ stroke: colors.text, strokeWidth: 1, strokeOpacity: 0.5 }} isAnimationActive={false} />
        {base != null && (
          <ReferenceLine y={base} stroke={colors.text} strokeDasharray="1 4" strokeWidth={1.5} strokeOpacity={0.6} />
        )}
        <Line type="linear" dataKey="value" stroke={color} strokeWidth={2}
          strokeLinejoin="round" strokeLinecap="round" dot={false} isAnimationActive={false}
          activeDot={{ r: 4, fill: color, stroke: "var(--surface)", strokeWidth: 2 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
