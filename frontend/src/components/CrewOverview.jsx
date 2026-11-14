import { ChevronRight, HeartPulse, Moon, Wind } from "lucide-react";
import { STATUS, StatusBadge, timeAgo } from "./Status.jsx";

const ORDER = { RED: 0, YELLOW: 1, UNKNOWN: 2, GREEN: 3 };

export default function CrewOverview({ crew, onOpen }) {
  const sorted = [...crew].sort((a, b) => ORDER[a.risk_level] - ORDER[b.risk_level]);
  const counts = crew.reduce((acc, a) => ({ ...acc, [a.risk_level]: (acc[a.risk_level] ?? 0) + 1 }), {});

  return (
    <section>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Crew status</h1>
          <p className="text-ink-2">Most urgent first. Select an astronaut for details.</p>
        </div>
        <div className="flex gap-2 text-sm">
          {["RED", "YELLOW", "UNKNOWN", "GREEN"].map((l) =>
            counts[l] ? (
              <span key={l} className="flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1 text-ink-2">
                <span className={`h-2 w-2 rounded-full ${STATUS[l].dot}`} /> {counts[l]} {STATUS[l].label}
              </span>
            ) : null,
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sorted.map((a) => (
          <button
            key={a.id}
            onClick={() => onOpen(a.id)}
            className={`group flex flex-col rounded-xl bg-surface-1 p-5 text-left ring-1 transition hover:bg-surface-2 ${
              STATUS[a.risk_level]?.ring ?? "ring-line"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">{a.name}</div>
                <div className="text-sm text-ink-3">
                  {a.role} · {a.id}
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-ink-3 transition group-hover:translate-x-0.5" aria-hidden />
            </div>
            <div className="mt-4">
              <StatusBadge level={a.risk_level} />
            </div>
            <p className="mt-3 line-clamp-2 min-h-[3rem] text-ink-2">{a.top_finding ?? a.summary}</p>
            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-4 text-sm">
              <Mini icon={HeartPulse} label="HR" value={a.current?.heart_rate} unit="bpm" />
              <Mini icon={Wind} label="SpO₂" value={a.current?.spo2} unit="%" />
              <Mini icon={Moon} label="Sleep" value={a.current?.sleep_hours} unit="h" />
            </div>
            <div className="mt-3 text-xs text-ink-3">Last reading {timeAgo(a.reading_timestamp)}</div>
          </button>
        ))}
      </div>
    </section>
  );
}

function Mini({ icon: Icon, label, value, unit }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-xs text-ink-3">
        <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
      </div>
      <div className="font-mono text-ink-1">
        {value ?? "—"} <span className="text-xs text-ink-3">{value != null ? unit : ""}</span>
      </div>
    </div>
  );
}
