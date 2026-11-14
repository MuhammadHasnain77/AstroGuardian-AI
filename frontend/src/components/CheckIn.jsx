import { Activity, ChevronDown } from "lucide-react";
import { useState } from "react";
import { api } from "../api.js";
import { Button } from "./ui.jsx";

const SENSORS = [
  { key: "heart_rate", label: "Heart rate", unit: "bpm", min: 20, max: 250 },
  { key: "spo2", label: "Blood oxygen", unit: "%", min: 50, max: 100 },
  { key: "blood_pressure_sys", label: "Systolic", unit: "mmHg", min: 50, max: 260 },
  { key: "blood_pressure_dia", label: "Diastolic", unit: "mmHg", min: 30, max: 160 },
  { key: "temperature", label: "Temperature", unit: "°C", min: 30, max: 43 },
  { key: "radiation_msv", label: "Dosimeter today", unit: "mSv", min: 0, max: 1000 },
];

// Samn-Perelli fatigue scale descriptors.
const FATIGUE = [
  [1, "Fully alert, wide awake"], [2, "Very lively, responsive"], [3, "Okay, somewhat fresh"],
  [4, "A little tired"], [5, "Moderately tired, let down"], [6, "Extremely tired, hard to concentrate"],
  [7, "Completely exhausted"],
];
const MOOD = [[1, "Very low"], [2, "Low"], [3, "Neutral"], [4, "Good"], [5, "Very good"]];
const STRESS = ["Low", "Medium", "High"];

const input = "h-11 w-full rounded-lg bg-surface-2 px-3 text-ink-1 ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-series";

/**
 * mode "self": an astronaut's daily check-in. Only what a person can report
 *              (sleep, fatigue, mood, stress, exercise); sensor values come
 *              from the wearable, with manual entry behind a demo link.
 * mode "cmo":  the CMO logs a full reading for any crew member.
 */
export default function CheckIn({ astronautId, current, mode = "self", onSaved, onCancel }) {
  const [form, setForm] = useState({
    sleep_hours: "", exercise_minutes: "", fatigue: "", mood: "", stress_level: "",
    ...Object.fromEntries(SENSORS.map((s) => [s.key, ""])),
  });
  const [manual, setManual] = useState(mode === "cmo");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const num = (v) => (v === "" ? null : Number(v));

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const body = {
      sleep_hours: num(form.sleep_hours), exercise_minutes: num(form.exercise_minutes),
      fatigue: num(form.fatigue), mood: num(form.mood), stress_level: form.stress_level || null,
    };
    if (manual) for (const s of SENSORS) body[s.key] = num(form[s.key]);
    if (Object.values(body).every((v) => v == null)) {
      setError("Fill in at least one answer.");
      setSaving(false);
      return;
    }
    try {
      await api.addReading(astronautId, body);
      onSaved();
    } catch (err) {
      setError(err.status === 0 ? "You're offline, so this wasn't saved. Try again when the connection is back." : err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Hours slept last night" hint="e.g. 7.5">
          <input type="number" inputMode="decimal" step="any" min="0" max="24" value={form.sleep_hours}
                 onChange={(e) => set("sleep_hours", e.target.value)} className={`${input} font-mono`} />
        </Field>
        <Field label="Exercise today (minutes)" hint="Scheduled: about 150">
          <input type="number" inputMode="numeric" step="any" min="0" max="600" value={form.exercise_minutes}
                 onChange={(e) => set("exercise_minutes", e.target.value)} className={`${input} font-mono`} />
        </Field>
      </div>

      <Choice legend="How tired are you right now?" name="fatigue" value={form.fatigue}
              onChange={(v) => set("fatigue", v)} options={FATIGUE} columns="sm:grid-cols-7" />
      <Choice legend="How is your mood?" name="mood" value={form.mood}
              onChange={(v) => set("mood", v)} options={MOOD} columns="grid-cols-5" />
      <Choice legend="Stress" name="stress" value={form.stress_level}
              onChange={(v) => set("stress_level", v)} options={STRESS.map((s) => [s, s])} columns="grid-cols-3" />

      <div className="rounded-lg bg-surface-2 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm text-ink-2">
            <Activity className="h-4 w-4 text-series" aria-hidden />
            {mode === "cmo" ? "Sensor values" : current?.heart_rate != null
              ? `Wearable: ${Math.round(current.heart_rate)} bpm · SpO₂ ${Math.round(current.spo2)}% — sent automatically`
              : "Wearable values are sent automatically"}
          </p>
          {mode === "self" && (
            <button type="button" aria-expanded={manual} onClick={() => setManual(!manual)}
                    className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-sm text-ink-3 underline-offset-4 hover:text-ink-1 hover:underline">
              Enter sensor values manually (demo)
              <ChevronDown className={`h-4 w-4 transition-transform ${manual ? "rotate-180" : ""}`} aria-hidden />
            </button>
          )}
        </div>
        {manual && (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {SENSORS.map((s) => (
              <Field key={s.key} label={s.label} hint={s.unit} small>
                <input type="number" inputMode="decimal" step="any" min={s.min} max={s.max} value={form[s.key]}
                       placeholder={current?.[s.key] != null ? String(current[s.key]) : ""}
                       onChange={(e) => set(s.key, e.target.value)} className={`${input} font-mono`} />
              </Field>
            ))}
          </div>
        )}
      </div>

      {error && <p role="alert" className="text-sm text-status-text-critical">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" loading={saving}>
          {mode === "cmo" ? "Save reading" : "Submit check-in"}
        </Button>
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>}
      </div>
    </form>
  );
}

function Field({ label, hint, small, children }) {
  return (
    <label className="block">
      <span className={`${small ? "text-sm" : ""} text-ink-2`}>
        {label} {hint && <span className="text-ink-3">· {hint}</span>}
      </span>
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

/** Segmented single-choice; each option shows its value and words, so meaning never relies on a number alone. */
function Choice({ legend, name, value, onChange, options, columns }) {
  return (
    <fieldset>
      <legend className="mb-2 text-ink-2">{legend}</legend>
      <div className={`grid grid-cols-2 gap-2 ${columns}`}>
        {options.map(([v, text]) => {
          const on = String(value) === String(v);
          return (
            <label key={v} className={`flex min-h-11 cursor-pointer flex-col justify-center rounded-lg px-3 py-2 text-sm ring-1 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-series ${
              on ? "bg-series/20 text-ink-1 ring-series" : "bg-surface-2 text-ink-2 ring-line hover:bg-surface-3"}`}>
              <input type="radio" name={name} value={v} checked={on} onChange={() => onChange(v)} className="sr-only" />
              {typeof v === "number" && <span className="font-mono text-base text-ink-1">{v}</span>}
              <span className="leading-tight">{text}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
