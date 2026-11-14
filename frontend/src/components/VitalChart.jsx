import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const SERIES = "#3987e5";
const GRID = "#2f2f2c";
const AXIS = "#8f8e86";
const LIMIT = "#c3c2b7";

const fmtDay = (iso) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/**
 * One vital over time.
 *   - line: the astronaut's readings
 *   - shaded band: personal baseline (mean ± 2 std) — "normal for this person"
 *   - dashed line: fixed safety limit
 */
export default function VitalChart({ title, unit, readings, metric, baseline, limit, limitLabel, domain, compact, id }) {
  const data = readings.map((r) => ({ t: r.timestamp, v: r[metric] }));
  const band =
    baseline?.reliable && baseline.std != null
      ? [+(baseline.mean - 2 * baseline.std).toFixed(1), +(baseline.mean + 2 * baseline.std).toFixed(1)]
      : null;
  const withBand = data.map((d) => ({ ...d, band }));
  const latest = data.at(-1)?.v;

  return (
    <figure id={id} className={compact ? "" : "scroll-mt-24 rounded-xl bg-surface-1 p-4 ring-1 ring-line"}>
      <figcaption className={compact ? "sr-only" : "mb-2 flex items-baseline justify-between gap-2"}>
        <span className="font-medium">{title}</span>
        <span className="font-mono text-lg">
          {latest ?? "—"} <span className="text-sm text-ink-3">{unit}</span>
        </span>
      </figcaption>
      <div className={compact ? "h-36" : "h-44"}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={withBand} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="t" tickFormatter={fmtDay} stroke={AXIS} tick={{ fontSize: 11 }} tickLine={false}
                   axisLine={{ stroke: GRID }} minTickGap={24} />
            <YAxis domain={domain ?? [(lo) => Math.floor(Math.min(lo, band?.[0] ?? lo) - 5),
                                      (hi) => Math.ceil(Math.max(hi, limit ?? hi, band?.[1] ?? hi) + 5)]} stroke={AXIS} tick={{ fontSize: 11 }} tickLine={false}
                   axisLine={false} width={44} />
            {band && (
              <Area dataKey="band" stroke="none" fill={SERIES} fillOpacity={0.14} isAnimationActive={false}
                    activeDot={false} />
            )}
            {limit != null && (
              <ReferenceLine y={limit} stroke={LIMIT} strokeDasharray="4 4" strokeWidth={1}
                             label={{ value: limitLabel ?? `limit ${limit}`, fill: LIMIT, fontSize: 10,
                                      position: "insideTopRight" }} />
            )}
            <Line dataKey="v" stroke={SERIES} strokeWidth={2} dot={false} isAnimationActive={false}
                  activeDot={{ r: 5, stroke: "#1a1a19", strokeWidth: 2 }} connectNulls />
            <Tooltip content={<Tip unit={unit} band={band} />} cursor={{ stroke: AXIS, strokeWidth: 1 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-ink-3">
        {band && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: SERIES, opacity: 0.3 }} />
            Personal normal {band[0]}–{band[1]}
          </span>
        )}
        {limit != null && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 border-t border-dashed" style={{ borderColor: LIMIT }} />
            Safety limit
          </span>
        )}
      </div>
    </figure>
  );
}

function Tip({ active, payload, unit, band }) {
  if (!active || !payload?.length) return null;
  const p = payload.find((x) => x.dataKey === "v")?.payload;
  if (!p) return null;
  return (
    <div className="rounded-lg bg-surface-3 px-3 py-2 text-sm shadow-lg ring-1 ring-line">
      <div className="text-xs text-ink-3">{new Date(p.t).toLocaleString()}</div>
      <div className="font-mono text-ink-1">
        {p.v ?? "—"} {unit}
      </div>
      {band && <div className="text-xs text-ink-2">normal {band[0]}–{band[1]}</div>}
    </div>
  );
}
