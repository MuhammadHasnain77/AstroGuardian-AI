import { Check, MessageSquareText } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import { StatusBadge } from "./Status.jsx";
import { Button } from "./ui.jsx";

const STATUS_TEXT = { open: "Open", resolved: "Resolved", superseded: "Replaced by a newer alert" };

/**
 * Alert history. Used as a page (CMO/ground) and as the History tab of an
 * astronaut (`astronautId` filters it). Acknowledging is the CMO's job.
 */
export default function AlertsLog({ user, astronautId, onOpen, onChanged, embedded }) {
  const [alerts, setAlerts] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState(embedded ? "all" : "open");
  const can = (p) => user.permissions.includes(p);

  const load = useCallback(() => api.alerts().then(setAlerts).catch((e) => setError(e.message)), []);
  useEffect(() => {
    load();
  }, [load]);

  async function ack(id) {
    try {
      await api.ackAlert(id);
      await load();
      onChanged?.();
    } catch (e) {
      setError(e.message);
    }
  }

  if (!alerts) return error ? <p className="text-status-text-critical">{error}</p> : <p className="text-ink-3">Loading…</p>;
  const mine = astronautId ? alerts.filter((a) => a.astronaut_id === astronautId) : alerts;
  const shown = mine.filter((a) => (filter === "open" ? a.status === "open" : true));

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        {!embedded && (
          <div>
            <h1 className="text-2xl font-semibold">Alert history</h1>
            <p className="text-ink-2">One alert per ongoing problem. Repeat readings update it; a new or worse problem opens a new one.</p>
          </div>
        )}
        <div className="flex rounded-lg bg-surface-2 p-1 text-sm" role="group" aria-label="Show">
          {[["open", "Open"], ["all", "All"]].map(([v, l]) => (
            <button key={v} aria-pressed={filter === v} onClick={() => setFilter(v)}
                    className={`h-9 rounded-md px-3 ${filter === v ? "bg-surface-3 text-ink-1" : "text-ink-3 hover:text-ink-1"}`}>{l}</button>
          ))}
        </div>
      </div>
      {error && <p role="alert" className="mb-3 text-sm text-status-text-critical">{error}</p>}
      {shown.length === 0 ? (
        <p className="rounded-xl bg-surface-1 px-5 py-4 text-ink-2 ring-1 ring-line">
          {filter === "open" ? "No open alerts." : "No alerts recorded yet. Alerts appear when a reading needs attention."}
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl bg-surface-1 ring-1 ring-line">
          {shown.map((a) => (
            <li key={a.id} className={`px-5 py-4 ${a.status !== "open" ? "text-ink-3" : ""}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <StatusBadge level={a.risk_level} />
                  {!astronautId && (
                    <button onClick={() => onOpen?.(a.astronaut_id)} className="font-medium text-ink-1 hover:underline">
                      {a.astronaut_name}
                    </button>
                  )}
                  <span className="text-sm text-ink-3">
                    {STATUS_TEXT[a.status]} · opened {new Date(a.opened_at).toLocaleString()}
                    {a.occurrences > 1 && ` · seen ${a.occurrences}×`}
                  </span>
                </div>
                {a.acknowledged ? (
                  <span className="flex items-center gap-1 text-sm text-ink-3">
                    <Check className="h-4 w-4" aria-hidden /> Acknowledged by {a.acknowledged_by}
                  </span>
                ) : a.status === "open" && can("acknowledge_alert") ? (
                  <Button size="sm" onClick={() => ack(a.id)}>Acknowledge</Button>
                ) : a.status === "open" ? (
                  <span className="text-sm text-ink-3">Awaiting CMO acknowledgement</span>
                ) : null}
              </div>
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-ink-2">
                {a.findings.map((f, i) => <li key={i}>{f.message}</li>)}
              </ul>
              {a.ground_note && (
                <p className="mt-2 flex gap-2 text-sm">
                  <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-series" aria-hidden />
                  <span><span className="text-ink-3">Flight surgeon:</span> <span className="text-ink-1">{a.ground_note}</span></span>
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
