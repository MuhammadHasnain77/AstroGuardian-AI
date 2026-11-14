import { ArrowRight, CheckCircle2, ChevronDown, MessageCircleQuestion } from "lucide-react";
import { useState } from "react";
import { SeverityIcon, shortName } from "./Status.jsx";
import VitalChart from "./VitalChart.jsx";

const KIND = {
  absolute: "Safety limit crossed",
  baseline: "Unusual for this astronaut",
  pattern: "Multi-day pattern",
  trend: "Predicted within 3 days",
  missing: "Data problem",
  environment: "Live space weather",
};

const CHART = {
  heart_rate: { unit: "bpm", limit: 110 },
  spo2: { unit: "%", limit: 95, domain: [88, 100] },
  sleep_hours: { unit: "h", limit: 5, domain: [0, 10] },
  blood_pressure_sys: { unit: "mmHg", limit: 140 },
  temperature: { unit: "°C", limit: 37.8 },
  fatigue: { unit: "/7", limit: 6, domain: [1, 7] },
  mood: { unit: "/5", limit: 2, domain: [1, 5] },
  exercise_minutes: { unit: "min", limit: 75, domain: [0, 200] },
};

/** Problems, each with what to do about it. `onAsk(finding)` opens the AI assistant. */
const SELF_REPORTED = new Set(["fatigue", "mood", "stress_level"]);
const unitText = (u) => (!u ? "" : /^[/%]/.test(u) ? u : ` ${u}`);

// Engine messages are written for clinicians ("this astronaut"); on the
// astronaut's own screen, speak to them directly.
const personal = (text) =>
  text.replace(/this astronaut's/g, "your").replace(/for this astronaut/g, "for you").replace(/^Astronaut reported/, "You reported");

export default function ProblemList({ findings, readings, baseline, onAsk, emptyText, selfView }) {
  if (!findings.length) {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-surface-1 px-5 py-4 ring-1 ring-line">
        <CheckCircle2 className="h-5 w-5 text-status-good" aria-hidden />
        <p className="text-ink-2">{emptyText ?? "Nothing needs attention. Keep to the schedule."}</p>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl bg-surface-1 ring-1 ring-line">
      {findings.map((f, i) => (
        <Problem key={`${f.metric}-${f.kind}-${i}`} f={f} readings={readings} baseline={baseline} onAsk={onAsk} selfView={selfView} />
      ))}
    </ul>
  );
}

function Problem({ f, readings, baseline, onAsk, selfView }) {
  const [open, setOpen] = useState(false);
  const chart = CHART[f.metric];
  const id = `why-${f.metric}-${f.kind}`;

  return (
    <li className="px-5 py-4">
      <div className="flex gap-3">
        <SeverityIcon level={f.severity} className="mt-0.5 h-5 w-5" />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-ink-1">
            {shortName(f)}
            <span className="ml-2 text-sm font-normal text-ink-3">
              {f.kind === "absolute" && SELF_REPORTED.has(f.metric)
                ? (selfView ? "You reported" : "Self-reported")
                : f.kind === "baseline" && selfView ? "Unusual for you" : KIND[f.kind] ?? f.kind}
            </span>
          </h3>
          <p className="mt-0.5 text-ink-2">{selfView ? personal(f.message) : f.message}</p>

          {f.actions?.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {f.actions.map((a) => (
                <li key={a} className="flex gap-2 text-ink-1">
                  <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-series" aria-hidden />
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-2 flex flex-wrap gap-1">
            <button aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}
                    className="-ml-2 inline-flex h-9 items-center gap-1 rounded-md px-2 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink-1">
              Why?
              <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
            </button>
            {onAsk && (
              <button onClick={() => onAsk(f)}
                      className="inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink-1">
                <MessageCircleQuestion className="h-4 w-4" aria-hidden /> Ask AI about this
              </button>
            )}
          </div>

          {open && (
            <div id={id} className="mt-2 space-y-3">
              {chart && readings?.length > 1 && (
                <VitalChart compact title={f.label} metric={f.metric} readings={readings}
                            baseline={baseline?.[f.metric]} unit={chart.unit} limit={chart.limit} domain={chart.domain} />
              )}
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                {f.value != null && <><dt className="text-ink-3">Latest</dt><dd className="text-ink-1">{String(f.value)}{unitText(f.unit)}</dd></>}
                {f.baseline_mean != null && <><dt className="text-ink-3">Your normal</dt><dd className="text-ink-1">{f.baseline_mean}{unitText(f.unit)}</dd></>}
                {f.projected != null && <><dt className="text-ink-3">In 3 days</dt><dd className="text-ink-1">{f.projected}{unitText(f.unit)} (limit {f.limit})</dd></>}
                <dt className="text-ink-3">Rule source</dt><dd className="text-ink-2">{f.source_text}</dd>
              </dl>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
