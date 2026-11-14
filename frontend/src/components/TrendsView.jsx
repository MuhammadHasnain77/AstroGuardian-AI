import { LineChart, Table2 } from "lucide-react";
import { useEffect, useState } from "react";
import VitalChart from "./VitalChart.jsx";

export const CHARTS = {
  vitals: [
    { metric: "heart_rate", title: "Resting heart rate", unit: "bpm", limit: 110, limitLabel: "caution 110" },
    { metric: "spo2", title: "Blood oxygen (SpO₂)", unit: "%", limit: 95, limitLabel: "caution <95", domain: [88, 100] },
    { metric: "blood_pressure_sys", title: "Systolic blood pressure", unit: "mmHg", limit: 140, limitLabel: "stage 2 ≥140" },
    { metric: "temperature", title: "Temperature", unit: "°C", limit: 37.8, limitLabel: "fever >37.8" },
  ],
  wellbeing: [
    { metric: "sleep_hours", title: "Sleep", unit: "h", limit: 5, limitLabel: "fatigue <5", domain: [0, 10] },
    { metric: "fatigue", title: "Fatigue (Samn-Perelli)", unit: "/7", limit: 6, limitLabel: "extremely tired ≥6", domain: [1, 7] },
    { metric: "mood", title: "Mood", unit: "/5", limit: 2, limitLabel: "low ≤2", domain: [1, 5] },
    { metric: "exercise_minutes", title: "Countermeasure exercise", unit: "min", limit: 75, limitLabel: "<50% of schedule", domain: [0, 200] },
  ],
};

/** Full 21-day charts plus a table view. `focus` scrolls to one metric's chart. */
export default function TrendsView({ readings, baseline, focus }) {
  const [view, setView] = useState("chart");
  useEffect(() => {
    if (focus && view === "chart") document.getElementById(`trend-${focus}`)?.scrollIntoView({ block: "center" });
  }, [focus, view]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink-3">Last {readings.length} readings. Shaded band = personal normal, dashed line = limit.</p>
        <div className="flex rounded-lg bg-surface-2 p-1 text-sm" role="group" aria-label="View as">
          {[["chart", LineChart, "Charts"], ["table", Table2, "Table"]].map(([v, Icon, label]) => (
            <button key={v} aria-pressed={view === v} onClick={() => setView(v)}
                    className={`flex h-9 items-center gap-1.5 rounded-md px-3 ${view === v ? "bg-surface-3 text-ink-1" : "text-ink-3 hover:text-ink-1"}`}>
              <Icon className="h-4 w-4" aria-hidden /> {label}
            </button>
          ))}
        </div>
      </div>
      {view === "chart" ? (
        <>
          <Group title="Vitals" charts={CHARTS.vitals} readings={readings} baseline={baseline} />
          <Group title="Wellbeing and countermeasures" charts={CHARTS.wellbeing} readings={readings} baseline={baseline} />
        </>
      ) : (
        <ReadingsTable readings={readings} />
      )}
    </div>
  );
}

function Group({ title, charts, readings, baseline }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-medium text-ink-2">{title}</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {charts.map((c) => (
          <VitalChart key={c.metric} id={`trend-${c.metric}`} {...c} readings={readings} baseline={baseline?.[c.metric]} />
        ))}
      </div>
    </section>
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
        <caption className="sr-only">Readings, newest first</caption>
        <thead className="text-left text-ink-3">
          <tr>{cols.map(([k, l]) => <th key={k} scope="col" className="whitespace-nowrap px-3 py-2 font-medium">{l}</th>)}</tr>
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
