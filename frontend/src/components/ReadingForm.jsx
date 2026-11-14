import { ClipboardPlus, Loader2 } from "lucide-react";
import { useState } from "react";
import { api } from "../api.js";

const VITALS = [
  { key: "heart_rate", label: "Heart rate", unit: "bpm", min: 20, max: 250 },
  { key: "spo2", label: "SpO₂", unit: "%", min: 50, max: 100 },
  { key: "blood_pressure_sys", label: "BP systolic", unit: "mmHg", min: 50, max: 260 },
  { key: "blood_pressure_dia", label: "BP diastolic", unit: "mmHg", min: 30, max: 160 },
  { key: "temperature", label: "Temperature", unit: "°C", min: 30, max: 43 },
  { key: "sleep_hours", label: "Sleep", unit: "h", min: 0, max: 24 },
  { key: "exercise_minutes", label: "Exercise today", unit: "min", min: 0, max: 600 },
  { key: "radiation_msv", label: "Dosimeter (today)", unit: "mSv", min: 0, max: 1000 },
];

// Samn-Perelli fatigue scale descriptors.
export const FATIGUE = [
  [1, "1 · Fully alert, wide awake"],
  [2, "2 · Very lively, responsive"],
  [3, "3 · Okay, somewhat fresh"],
  [4, "4 · A little tired"],
  [5, "5 · Moderately tired, let down"],
  [6, "6 · Extremely tired, hard to concentrate"],
  [7, "7 · Completely exhausted"],
];
const MOOD = [[5, "5 · Very good"], [4, "4 · Good"], [3, "3 · Neutral"], [2, "2 · Low"], [1, "1 · Very low"]];

const toForm = (cur) => ({
  ...Object.fromEntries(VITALS.map((f) => [f.key, cur?.[f.key] ?? ""])),
  stress_level: cur?.stress_level ?? "Low",
  fatigue: cur?.fatigue != null ? String(Math.round(cur.fatigue)) : "",
  mood: cur?.mood != null ? String(Math.round(cur.mood)) : "",
});

export default function ReadingForm({ astronautId, current, isSelf, onSaved }) {
  const [form, setForm] = useState(() => toForm(current));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const body = { stress_level: form.stress_level };
    for (const f of VITALS) body[f.key] = form[f.key] === "" ? null : Number(form[f.key]);
    for (const k of ["fatigue", "mood"]) body[k] = form[k] === "" ? null : Number(form[k]);
    try {
      await api.addReading(astronautId, body);
      onSaved();
    } catch (err) {
      setError(err.status === 0 ? "Offline — reading not saved. Try again when the server is reachable." : err.message);
    } finally {
      setSaving(false);
    }
  }

  const input = "mt-1 w-full rounded-lg bg-surface-2 px-3 py-2 text-ink-1 ring-1 ring-line focus:outline-none focus:ring-series";

  return (
    <form onSubmit={submit} className="rounded-xl bg-surface-1 p-5 ring-1 ring-line">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <ClipboardPlus className="h-5 w-5 text-series" aria-hidden /> {isSelf ? "Daily check-in" : "Log reading (CMO)"}
      </h2>
      <p className="mt-1 text-sm text-ink-3">
        Simulates a sensor push plus a self-report. Leave a field empty if it wasn't measured.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {VITALS.map((f) => (
          <label key={f.key} className="text-sm">
            <span className="text-ink-2">{f.label} <span className="text-ink-3">({f.unit})</span></span>
            <input type="number" inputMode="decimal" step="any" min={f.min} max={f.max} value={form[f.key]}
                   onChange={set(f.key)} className={`${input} font-mono`} />
          </label>
        ))}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="text-sm">
          <span className="text-ink-2">How tired are you?</span>
          <select value={form.fatigue} onChange={set("fatigue")} className={input}>
            <option value="">—</option>
            {FATIGUE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-ink-2">Mood</span>
          <select value={form.mood} onChange={set("mood")} className={input}>
            <option value="">—</option>
            {MOOD.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-ink-2">Stress</span>
          <select value={form.stress_level} onChange={set("stress_level")} className={input}>
            <option>Low</option>
            <option>Medium</option>
            <option>High</option>
          </select>
        </label>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-status-critical">{error}</p>}
      <button type="submit" disabled={saving}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-series px-4 py-2 font-medium text-white hover:brightness-110 disabled:opacity-60">
        {saving && <Loader2 className="h-4 w-4 animate-spin" />} Submit & re-evaluate
      </button>
    </form>
  );
}
