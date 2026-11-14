import { ArrowLeft, LineChart, ListChecks, MessageSquareText, Radiation, Table2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import AiPanel from "./AiPanel.jsx";
import ReadingForm from "./ReadingForm.jsx";
import { FindingRow, STATUS, StatusBadge, timeAgo } from "./Status.jsx";
import VitalChart from "./VitalChart.jsx";

const VITALS = [
  { metric: "heart_rate", title: "Resting heart rate", unit: "bpm", limit: 110, limitLabel: "caution 110" },
  { metric: "spo2", title: "Blood oxygen (SpO₂)", unit: "%", limit: 95, limitLabel: "caution <95", domain: [88, 100] },
  { metric: "sleep_hours", title: "Sleep duration", unit: "h", limit: 5, limitLabel: "fatigue <5", domain: [0, 10] },
  { metric: "blood_pressure_sys", title: "Systolic blood pressure", unit: "mmHg", limit: 140, limitLabel: "stage 2 ≥140" },
];
const WELLBEING = [
  { metric: "fatigue", title: "Fatigue (Samn-Perelli)", unit: "/7", limit: 6, limitLabel: "extremely tired ≥6", domain: [1, 7] },
  { metric: "mood", title: "Mood", unit: "/5", limit: 2, limitLabel: "low ≤2", domain: [1, 5] },
  { metric: "exercise_minutes", title: "Countermeasure exercise", unit: "min", limit: 75, limitLabel: "<50% of schedule", domain: [0, 200] },
];

export default function AstronautDetail({ id, user, llm, onBack, onChanged }) {
  const [data, setData] = useState(null);
  const [readings, setReadings] = useState([]);
  const [error, setError] = useState(null);
  const [view, setView] = useState("chart");
  const [refreshKey, setRefreshKey] = useState(0);
  const can = (p) => user.permissions.includes(p);
  const canLog = can("submit_any_reading") || (can("submit_own_reading") && user.astronaut_id === id);

  const load = useCallback(async () => {
    try {
      const [d, r] = await Promise.all([api.astronaut(id), api.readings(id, 21)]);
      setData(d);
      setReadings(r);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <p className="text-status-critical">Could not load astronaut: {error}</p>;
  if (!data) return <p className="text-ink-3">Loading…</p>;

  const ev = data.evaluation;
  const s = STATUS[ev.risk_level] ?? STATUS.UNKNOWN;
  const note = data.open_alert?.ground_note;
  const self = user.astronaut_id === id;

  return (
    <section className="space-y-5">
      {onBack && (
        <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink-1">
          <ArrowLeft className="h-4 w-4" /> Crew overview
        </button>
      )}

      <div className={`rounded-xl p-5 ring-1 ${s.bg} ${s.ring}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">
              {data.name}{self && <span className="ml-2 text-base font-normal text-ink-3">(you)</span>}
            </h1>
            <p className="text-ink-2">
              {data.role} · {data.id} · last reading {timeAgo(ev.reading_timestamp)}
            </p>
          </div>
          <StatusBadge level={ev.risk_level} size="lg" />
        </div>
        <p className="mt-4 text-lg text-ink-1">{ev.summary}</p>
      </div>

      {note && (
        <div className="flex gap-3 rounded-xl bg-surface-1 p-4 ring-1 ring-series/50">
          <MessageSquareText className="mt-0.5 h-5 w-5 shrink-0 text-series" aria-hidden />
          <div>
            <div className="text-sm font-medium">Advice from ground flight surgeon</div>
            <p className="mt-1 text-ink-1">{note}</p>
            <p className="mt-1 text-xs text-ink-3">{new Date(data.open_alert.ground_note_at).toLocaleString()}</p>
          </div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl bg-surface-1 p-5 ring-1 ring-line">
          <h2 className="text-lg font-semibold">Why — findings ({ev.findings.length})</h2>
          {ev.findings.length ? (
            <ul className="mt-3 space-y-2">
              {ev.findings.map((f, i) => <FindingRow key={i} f={f} />)}
            </ul>
          ) : (
            <p className="mt-3 text-ink-2">No deviations from personal baseline or safety limits.</p>
          )}
        </div>
        <div className="space-y-5">
          <div className="rounded-xl bg-surface-1 p-5 ring-1 ring-line">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <ListChecks className="h-5 w-5 text-series" aria-hidden /> What to do
            </h2>
            {ev.actions.length ? (
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-ink-1 marker:text-ink-3">
                {ev.actions.map((a, i) => <li key={i}>{a}</li>)}
              </ol>
            ) : (
              <p className="mt-3 text-ink-2">No action needed. Continue scheduled operations.</p>
            )}
          </div>
          <RadiationTile radiation={ev.radiation} />
        </div>
      </div>

      {can("use_assistant") && <AiPanel astronautId={id} llm={llm} refreshKey={refreshKey} />}

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Last {readings.length} readings</h2>
          <div className="flex rounded-lg bg-surface-2 p-1 text-sm" role="tablist">
            {[["chart", LineChart, "Charts"], ["table", Table2, "Table"]].map(([v, Icon, label]) => (
              <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}
                      className={`flex items-center gap-1.5 rounded-md px-3 py-1 ${view === v ? "bg-surface-3 text-ink-1" : "text-ink-3"}`}>
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>
        </div>
        {view === "chart" ? (
          <div className="space-y-6">
            <ChartGroup title="Vitals" cols="md:grid-cols-2" charts={VITALS} readings={readings} baseline={ev.baseline} />
            <ChartGroup title="Wellbeing & countermeasures" cols="md:grid-cols-2 xl:grid-cols-3" charts={WELLBEING} readings={readings} baseline={ev.baseline} />
          </div>
        ) : (
          <ReadingsTable readings={readings} />
        )}
      </div>

      {canLog ? (
        <ReadingForm astronautId={id} current={ev.current} isSelf={self}
                     onSaved={async () => { await load(); setRefreshKey((k) => k + 1); onChanged?.(); }} />
      ) : (
        <p className="rounded-xl bg-surface-1 p-4 text-sm text-ink-3 ring-1 ring-line">
          Your role ({user.role_label}) has read-only access to this astronaut's vitals.
        </p>
      )}
    </section>
  );
}

function ChartGroup({ title, cols, charts, readings, baseline }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium uppercase tracking-wide text-ink-3">{title}</h3>
      <div className={`grid gap-4 ${cols}`}>
        {charts.map((c) => (
          <VitalChart key={c.metric} {...c} readings={readings} baseline={baseline[c.metric]} />
        ))}
      </div>
    </div>
  );
}

function RadiationTile({ radiation }) {
  if (!radiation) return null;
  const pct = Math.min(100, (radiation.career_dose_msv / radiation.limit_msv) * 100);
  return (
    <div className="rounded-xl bg-surface-1 p-5 ring-1 ring-line">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Radiation className="h-5 w-5 text-series" aria-hidden /> Career radiation dose
      </h2>
      <div className="mt-2 font-mono text-2xl">
        {radiation.career_dose_msv.toFixed(1)} <span className="text-sm text-ink-3">/ {radiation.limit_msv} mSv</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-3" role="meter" aria-valuemin={0}
           aria-valuemax={radiation.limit_msv} aria-valuenow={radiation.career_dose_msv} aria-label="Career radiation dose">
        <div className="h-full rounded-full bg-series" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-xs text-ink-3">{pct.toFixed(0)}% of the NASA-STD-3001 career limit · warning at 80%</p>
    </div>
  );
}

function ReadingsTable({ readings }) {
  const cols = [
    ["timestamp", "Time"], ["heart_rate", "HR"], ["spo2", "SpO₂"], ["blood_pressure_sys", "Sys"],
    ["blood_pressure_dia", "Dia"], ["temperature", "Temp"], ["sleep_hours", "Sleep"], ["fatigue", "Fatigue"],
    ["mood", "Mood"], ["exercise_minutes", "Exercise"], ["radiation_msv", "mSv"], ["stress_level", "Stress"],
    ["source", "Source"],
  ];
  return (
    <div className="overflow-x-auto rounded-xl bg-surface-1 ring-1 ring-line">
      <table className="w-full text-sm">
        <thead className="text-left text-ink-3">
          <tr>{cols.map(([k, l]) => <th key={k} className="whitespace-nowrap px-3 py-2 font-medium">{l}</th>)}</tr>
        </thead>
        <tbody className="font-mono">
          {[...readings].reverse().map((r) => (
            <tr key={r.id} className="border-t border-line">
              {cols.map(([k]) => (
                <td key={k} className="whitespace-nowrap px-3 py-1.5">
                  {k === "timestamp" ? new Date(r[k]).toLocaleString() : r[k] ?? "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
