import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { STATUS } from "./Status.jsx";
import { normalBand, Sparkline } from "./ui.jsx";

const SENSOR = [
  { m: "heart_rate", label: "Heart rate", unit: "bpm", digits: 0 },
  { m: "spo2", label: "Blood oxygen", unit: "%", digits: 0 },
  { m: "blood_pressure_sys", label: "Blood pressure", unit: "mmHg", digits: 0, bp: true },
  { m: "temperature", label: "Temperature", unit: "°C", digits: 1 },
];
const SELF = [
  { m: "sleep_hours", label: "Sleep", unit: "h", digits: 1 },
  { m: "fatigue", label: "Fatigue", unit: "/ 7", digits: 0 },
  { m: "mood", label: "Mood", unit: "/ 5", digits: 0 },
  { m: "exercise_minutes", label: "Exercise", unit: "min", digits: 0 },
];

/** Today's values next to the personal normal, with a 14-day trend. Click a tile to open its full chart. */
export default function VitalTiles({ current, baseline, series, findings, radiation, onOpen, selfView = true }) {
  const normalWord = selfView ? "your normal" : "their normal";
  const worst = {};
  for (const f of findings ?? []) {
    const m = f.metric === "blood_pressure_dia" ? "blood_pressure_sys" : f.metric;
    if (!worst[m] || f.severity === "RED") worst[m] = f.severity;
  }
  return (
    <div className="space-y-5">
      <Group title="From wearable sensors" items={SENSOR} {...{ current, baseline, series, worst, onOpen, normalWord }} />
      <Group title={selfView ? "From your check-ins" : "From check-ins"} items={SELF} {...{ current, baseline, series, worst, onOpen, normalWord }} />
      {radiation && <RadiationMeter radiation={radiation} flagged={worst.radiation_msv} />}
    </div>
  );
}

function Group({ title, items, current, baseline, series, worst, onOpen, normalWord }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-medium text-ink-2">{title}</h3>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-line ring-1 ring-line lg:grid-cols-4">
        {items.map((t) => (
          <Tile key={t.m} t={t} value={current?.[t.m]} dia={current?.blood_pressure_dia} b={baseline?.[t.m]}
                values={series?.[t.m]?.map((p) => p.value)} flag={worst[t.m]} onOpen={onOpen} normalWord={normalWord} />
        ))}
      </div>
    </section>
  );
}

function Tile({ t, value, dia, b, values, flag, onOpen, normalWord }) {
  const has = value != null;
  const shown = has ? (t.bp && dia != null ? `${Math.round(value)}/${Math.round(dia)}` : Number(value).toFixed(t.digits)) : "—";
  const diff = has && b?.reliable ? value - b.mean : null;
  const meaningful = diff != null && Math.abs(diff) > b.std;
  const DiffIcon = !meaningful ? Minus : diff > 0 ? ArrowUp : ArrowDown;
  const s = flag ? STATUS[flag] : null;

  return (
    <button onClick={() => onOpen?.(t.m)}
            className="group flex min-h-[8.5rem] flex-col bg-surface-1 p-4 text-left transition-colors hover:bg-surface-2">
      <span className="flex w-full items-center justify-between gap-2 text-sm text-ink-2">
        {t.label}
        {s && <span className={`h-2 w-2 rounded-full ${s.dot}`} title={`${s.label}: see Needs attention`} />}
      </span>
      <span className="mt-1 font-mono text-2xl text-ink-1">
        {shown} <span className="font-sans text-sm text-ink-3">{has ? t.unit : ""}</span>
      </span>
      <span className="mt-0.5 flex items-center gap-1 text-xs text-ink-3">
        {diff != null ? (
          <>
            <DiffIcon className="h-3.5 w-3.5" aria-hidden />
            {meaningful
              ? `${Math.abs(diff).toFixed(Math.abs(diff) < 1 ? 1 : t.digits)}${t.unit.startsWith("/") ? "" : ` ${t.unit}`} ${diff > 0 ? "above" : "below"} ${normalWord}`
              : `Within ${normalWord}`}
          </>
        ) : has ? "Building your baseline" : "Not recorded"}
      </span>
      <div className="mt-auto w-full pt-3">
        <Sparkline values={values} band={normalBand(b)} height={28}
                   label={values?.length > 1 ? `${t.label}, last ${values.length} days` : undefined} />
      </div>
    </button>
  );
}

function RadiationMeter({ radiation, flagged }) {
  const pct = Math.min(100, (radiation.career_dose_msv / radiation.limit_msv) * 100);
  const fill = flagged === "RED" ? "bg-status-critical" : flagged ? "bg-status-warning" : "bg-series";
  return (
    <section className="rounded-xl bg-surface-1 px-4 py-3 ring-1 ring-line">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium text-ink-2">Career radiation dose</h3>
        <span className="font-mono text-ink-1">
          {radiation.career_dose_msv.toFixed(1)} <span className="font-sans text-sm text-ink-3">of {radiation.limit_msv} mSv · {pct.toFixed(0)}%</span>
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3" role="meter" aria-label="Career radiation dose"
           aria-valuemin={0} aria-valuemax={radiation.limit_msv} aria-valuenow={radiation.career_dose_msv}>
        <div className={`h-full rounded-full ${fill}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-ink-3">NASA-STD-3001 career limit. Warning at 80%.</p>
    </section>
  );
}
