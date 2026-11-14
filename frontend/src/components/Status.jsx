import { AlertTriangle, CheckCircle2, HelpCircle, OctagonAlert } from "lucide-react";

// Status is always colour + icon + text — never colour alone.
// Icons/fills use the status colour (graphic, ≥3:1); labels use the lighter
// status-text step so they pass 4.5:1 on the tinted badge.
export const STATUS = {
  GREEN: { label: "Nominal", icon: CheckCircle2, icolor: "text-status-good", text: "text-status-text-good", bg: "bg-status-good/15", ring: "ring-status-good/50", dot: "bg-status-good" },
  YELLOW: { label: "Caution", icon: AlertTriangle, icolor: "text-status-warning", text: "text-status-text-warning", bg: "bg-status-warning/15", ring: "ring-status-warning/50", dot: "bg-status-warning" },
  RED: { label: "Critical", icon: OctagonAlert, icolor: "text-status-critical", text: "text-status-text-critical", bg: "bg-status-critical/15", ring: "ring-status-critical/60", dot: "bg-status-critical" },
  UNKNOWN: { label: "Unknown", icon: HelpCircle, icolor: "text-status-unknown", text: "text-status-text-unknown", bg: "bg-surface-3", ring: "ring-line", dot: "bg-status-unknown" },
};

export const SEVERITY_RANK = { RED: 0, YELLOW: 1, UNKNOWN: 2, GREEN: 3 };

export function StatusBadge({ level, size = "md" }) {
  const s = STATUS[level] ?? STATUS.UNKNOWN;
  const Icon = s.icon;
  const big = size === "lg";
  return (
    <span className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full ring-1 ${s.bg} ${s.ring} font-semibold ${
      big ? "px-4 py-2 text-lg" : "px-2.5 py-1 text-sm"}`}>
      <Icon className={`${big ? "h-6 w-6" : "h-4 w-4"} ${s.icolor}`} aria-hidden />
      <span className={s.text}>{level}</span>
      <span className="font-normal text-ink-2">· {s.label}</span>
    </span>
  );
}

export function SeverityIcon({ level, className = "h-5 w-5" }) {
  const s = STATUS[level] ?? STATUS.UNKNOWN;
  const Icon = s.icon;
  return <Icon className={`${className} shrink-0 ${s.icolor}`} aria-label={s.label} role="img" />;
}

/** One-line reason for a status, e.g. "Fatigue, sleep debt and 3 more". */
export function headline(findings) {
  if (!findings?.length) return "Everything is within your normal range and safety limits.";
  const names = [...new Set(findings.map((f) => shortName(f)))];
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1].toLowerCase()}`;
  return `${names[0]}, ${names[1].toLowerCase()} and ${names.length - 2} more`;
}

const SHORT = {
  heart_rate: "Heart rate", spo2: "Blood oxygen", blood_pressure_sys: "Blood pressure", blood_pressure_dia: "Blood pressure",
  temperature: "Temperature", sleep_hours: "Sleep", fatigue: "Fatigue", mood: "Mood", stress_level: "Stress",
  exercise_minutes: "Exercise", radiation_msv: "Radiation", timestamp: "Stale data",
};
export function shortName(f) {
  if (f.kind === "pattern" && f.metric === "sleep_hours") return "Sleep debt";
  if (f.kind === "missing") return f.metric === "timestamp" ? "Stale data" : "Missing sensor data";
  return SHORT[f.metric] ?? f.label;
}

export function timeAgo(iso) {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}
