import { Check, CheckCheck, MessageSquareText } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import AdviceComposer from "../components/AdviceComposer.jsx";
import AstronautView from "../components/AstronautView.jsx";
import CrewTrends from "../components/CrewTrends.jsx";
import { SpaceWeatherPanel, useSpaceWeather } from "../components/SpaceWeather.jsx";
import { SEVERITY_RANK, StatusBadge, timeAgo } from "../components/Status.jsx";
import { Button, Drawer, SectionHeading } from "../components/ui.jsx";

const STATUS_TEXT = { open: "Open", resolved: "Resolved on board", superseded: "Replaced by a newer alert" };

/** Ground flight surgeon home: what arrived this comms window, reply inline, compare the crew. */
export default function GroundInbox({ crew, user, llm, openId, onOpen, onClose, onChanged, pulse }) {
  const sw = useSpaceWeather(pulse);
  const [alerts, setAlerts] = useState(null);
  const [error, setError] = useState(null);
  const [marking, setMarking] = useState(false);

  const load = useCallback(() => api.alerts().then(setAlerts).catch((e) => setError(e.message)), []);
  useEffect(() => {
    load();
  }, [load]);

  const refresh = () => { load(); onChanged(); };

  async function markReviewed() {
    setMarking(true);
    try {
      await api.syncComplete();
      refresh();
    } finally {
      setMarking(false);
    }
  }

  const bySeverity = (a, b) => (a.status === "open") === (b.status === "open")
    ? SEVERITY_RANK[a.risk_level] - SEVERITY_RANK[b.risk_level]
    : a.status === "open" ? -1 : 1;
  const fresh = (alerts ?? []).filter((a) => !a.synced).sort(bySeverity);
  const reviewedOpen = (alerts ?? []).filter((a) => a.synced && a.status === "open").sort(bySeverity);
  const open = crew.find((a) => a.id === openId);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Comms window</h1>
          <p className="text-ink-2">
            {alerts == null ? "Loading…" : fresh.length
              ? `${fresh.length} update${fresh.length > 1 ? "s" : ""} from the spacecraft since your last review.`
              : "You're up to date with the spacecraft."}
          </p>
        </div>
        {fresh.length > 0 && (
          <Button variant="primary" icon={CheckCheck} loading={marking} onClick={markReviewed}>Mark window reviewed</Button>
        )}
      </header>

      {error && <p role="alert" className="text-status-text-critical">{error}</p>}

      {fresh.length > 0 && (
        <section aria-labelledby="new-h">
          <SectionHeading><span id="new-h">New since last review</span></SectionHeading>
          <ul className="divide-y divide-line overflow-hidden rounded-xl bg-surface-1 ring-1 ring-line">
            {fresh.map((a) => <InboxItem key={a.id} a={a} onOpen={onOpen} onSaved={refresh} />)}
          </ul>
        </section>
      )}

      {reviewedOpen.length > 0 && (
        <section aria-labelledby="open-h">
          <SectionHeading><span id="open-h">Still open, already reviewed</span></SectionHeading>
          <ul className="divide-y divide-line overflow-hidden rounded-xl bg-surface-1 ring-1 ring-line">
            {reviewedOpen.map((a) => <InboxItem key={a.id} a={a} onOpen={onOpen} onSaved={refresh} compact />)}
          </ul>
        </section>
      )}

      <SpaceWeatherPanel sw={sw} />

      <section aria-labelledby="trends-h">
        <SectionHeading aside="Last 14 days"><span id="trends-h">Crew trends</span></SectionHeading>
        <CrewTrends crew={crew} />
      </section>

      <Drawer open={!!open} onClose={onClose} title={open?.name ?? ""} subtitle={open ? `${open.role} · ${open.id} · read-only vitals` : ""}>
        {open && <AstronautView key={open.id} id={open.id} user={user} llm={llm} inPanel onChanged={refresh} />}
      </Drawer>
    </div>
  );
}

function InboxItem({ a, onOpen, onSaved, compact }) {
  const [writing, setWriting] = useState(!compact && a.status === "open" && !a.ground_note);
  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <StatusBadge level={a.risk_level} />
        <button onClick={() => onOpen(a.astronaut_id)} className="font-medium text-ink-1 hover:underline">{a.astronaut_name}</button>
        <span className="text-sm text-ink-3">
          {STATUS_TEXT[a.status]} · opened {timeAgo(a.opened_at)}{a.occurrences > 1 && ` · seen ${a.occurrences}×`}
        </span>
        <span className="ml-auto flex items-center gap-1 text-sm text-ink-3">
          {a.acknowledged ? <><Check className="h-4 w-4" aria-hidden /> CMO acknowledged</> : a.status === "open" ? "Not yet acknowledged on board" : null}
        </span>
      </div>
      {!compact && (
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-ink-2">
          {a.findings.slice(0, 4).map((f, i) => <li key={i}>{f.message}</li>)}
          {a.findings.length > 4 && <li className="list-none text-ink-3">+{a.findings.length - 4} more in the crew member's view</li>}
        </ul>
      )}
      {a.ground_note && (
        <p className="mt-2 flex gap-2 text-sm">
          <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-series" aria-hidden />
          <span><span className="text-ink-3">Your advice:</span> <span className="text-ink-1">{a.ground_note}</span></span>
        </p>
      )}
      {a.status === "open" && (
        writing ? (
          <div className="mt-3"><AdviceComposer alert={a} onSaved={() => { setWriting(false); onSaved(); }} /></div>
        ) : (
          <Button size="sm" variant="ghost" className="-ml-3 mt-2" onClick={() => setWriting(true)}>
            {a.ground_note ? "Replace advice" : "Add advice"}
          </Button>
        )
      )}
    </li>
  );
}
