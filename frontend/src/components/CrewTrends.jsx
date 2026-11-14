import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// Crew identity colours: validated categorical slots 1–3 (dark mode). Colour
// follows the astronaut, never their rank, so it's stable across charts.
const CREW_COLORS = ["#3987e5", "#d95926", "#199e70"];
const GRID = "#2f2f2c";
const AXIS = "#8f8e86";

const METRICS = [
  { m: "heart_rate", title: "Resting heart rate", unit: "bpm" },
  { m: "spo2", title: "Blood oxygen", unit: "%" },
  { m: "sleep_hours", title: "Sleep", unit: "h" },
  { m: "fatigue", title: "Fatigue (1–7)", unit: "" },
];

/** Small multiples: one metric per chart, every crew member on each, for comparison from the ground. */
export default function CrewTrends({ crew }) {
  const people = [...crew].sort((a, b) => a.id.localeCompare(b.id)).map((a, i) => ({ ...a, color: CREW_COLORS[i % 3] }));
  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-2" aria-label="Legend">
        {people.map((p) => (
          <li key={p.id} className="flex items-center gap-2">
            <span className="inline-block h-0.5 w-5 rounded-full" style={{ background: p.color }} aria-hidden />
            {p.name}
          </li>
        ))}
      </ul>
      <div className="grid gap-4 md:grid-cols-2">
        {METRICS.map((x) => <SmallMultiple key={x.m} metric={x} people={people} />)}
      </div>
    </div>
  );
}

// Even, readable ticks: pad the data range and snap to a step that gives ~4 ticks.
function niceAxis(values) {
  const v = values.filter((x) => x != null);
  if (!v.length) return { domain: [0, 1], ticks: [0, 1] };
  let lo = Math.min(...v), hi = Math.max(...v);
  if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
  const raw = (hi - lo) / 3;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const start = Math.floor(lo / step) * step, end = Math.ceil(hi / step) * step;
  const ticks = [];
  for (let t = start; t <= end + step / 2; t += step) ticks.push(+t.toFixed(4));
  return { domain: [start, end], ticks };
}

function SmallMultiple({ metric, people }) {
  const days = [...new Set(people.flatMap((p) => p.series?.[metric.m]?.map((d) => d.day) ?? []))].sort();
  const data = days.map((day) => {
    const row = { day };
    for (const p of people) row[p.id] = p.series?.[metric.m]?.find((d) => d.day === day)?.value ?? null;
    return row;
  });
  const axis = niceAxis(data.flatMap((r) => people.map((p) => r[p.id])));
  return (
    <figure className="rounded-xl bg-surface-1 p-4 ring-1 ring-line">
      <figcaption className="mb-2 font-medium">
        {metric.title} <span className="text-sm font-normal text-ink-3">{metric.unit && `· ${metric.unit}`} · daily average</span>
      </figcaption>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="day" stroke={AXIS} tick={{ fontSize: 11 }} tickLine={false} axisLine={{ stroke: GRID }}
                   minTickGap={28} tickFormatter={(d) => new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" })} />
            <YAxis stroke={AXIS} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={40}
                   domain={axis.domain} ticks={axis.ticks} interval={0} tickFormatter={(t) => String(+t.toFixed(1))} />
            {people.map((p) => (
              <Line key={p.id} dataKey={p.id} name={p.name} stroke={p.color} strokeWidth={2} dot={false}
                    isAnimationActive={false} connectNulls activeDot={{ r: 5, stroke: "#1a1a19", strokeWidth: 2 }} />
            ))}
            <Tooltip content={<Tip unit={metric.unit} people={people} />} cursor={{ stroke: AXIS, strokeWidth: 1 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

function Tip({ active, payload, label, unit, people }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg bg-surface-3 px-3 py-2 text-sm shadow-lg ring-1 ring-line">
      <div className="text-xs text-ink-3">{new Date(label).toLocaleDateString()}</div>
      {people.map((p) => {
        const v = payload.find((x) => x.dataKey === p.id)?.value;
        return (
          <div key={p.id} className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} aria-hidden />
            <span className="text-ink-2">{p.name}</span>
            <span className="ml-auto pl-3 font-mono text-ink-1">{v ?? "—"} {v != null ? unit : ""}</span>
          </div>
        );
      })}
    </div>
  );
}
