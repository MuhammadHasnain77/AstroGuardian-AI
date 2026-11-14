import { CheckCircle2, ClipboardPen, MessageSquareText, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import AdviceComposer from "./AdviceComposer.jsx";
import AiDrawer from "./AiDrawer.jsx";
import AlertsLog from "./AlertsLog.jsx";
import CheckIn from "./CheckIn.jsx";
import ProblemList from "./ProblemList.jsx";
import { SpaceWeatherStrip, useSpaceWeather } from "./SpaceWeather.jsx";
import { headline, shortName, STATUS, StatusBadge, timeAgo } from "./Status.jsx";
import TrendsView from "./TrendsView.jsx";
import { Button, SectionHeading, Tabs } from "./ui.jsx";
import VitalTiles from "./VitalTiles.jsx";

/**
 * One astronaut. As the astronaut's own home ("Today") it leads with status and
 * the daily check-in; inside a CMO/ground side panel (`inPanel`) the header
 * carries that role's tools instead.
 */
export default function AstronautView({ id, user, llm, onChanged, inPanel, pulse }) {
  const [data, setData] = useState(null);
  const [readings, setReadings] = useState([]);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("today");
  const [focus, setFocus] = useState(null);
  const [checkIn, setCheckIn] = useState(false);
  const [ai, setAi] = useState({ open: false, question: null });
  const [acking, setAcking] = useState(false);
  const can = (p) => user.permissions.includes(p);
  const self = user.astronaut_id === id;
  const sw = useSpaceWeather(inPanel ? null : pulse);

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

  // `pulse` ticks on the shell's periodic refresh; reload in place (keeps tab and scroll).
  useEffect(() => {
    load();
  }, [load, pulse]);

  async function saved() {
    setCheckIn(false);
    await load();
    onChanged?.();
  }

  async function acknowledge() {
    setAcking(true);
    try {
      await api.ackAlert(data.open_alert.id);
      await load();
      onChanged?.();
    } finally {
      setAcking(false);
    }
  }

  if (error) return <p role="alert" className="text-status-text-critical">Couldn't load this astronaut: {error}</p>;
  if (!data) return <ViewSkeleton />;

  const ev = data.evaluation;
  const s = STATUS[ev.risk_level] ?? STATUS.UNKNOWN;
  const alert = data.open_alert;
  const needsAck = alert && !alert.acknowledged && can("acknowledge_alert");
  const canLog = can("submit_any_reading") || (self && can("submit_own_reading"));
  const askAbout = (f) =>
    setAi({ open: true, question: `Why is "${shortName(f)}" flagged for me, and what should I do about it?` });
  const H = inPanel ? "h3" : "h1";

  return (
    <div className="space-y-6">
      {/* Status: what state am I in, why, and the one thing to do next. */}
      <section className={`rounded-xl px-5 py-5 ring-1 ${s.bg} ${s.ring}`} aria-label="Current status">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <StatusBadge level={ev.risk_level} size="lg" />
            <H className="text-xl font-semibold text-ink-1">{headline(ev.findings)}</H>
            <p className="text-sm text-ink-2">
              {inPanel ? `${data.role} · ` : ""}Last reading {timeAgo(ev.reading_timestamp)}
              {self && data.checked_in_today && " · Checked in today"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {self && !data.checked_in_today && !checkIn && (
              <Button variant="primary" icon={ClipboardPen} onClick={() => setCheckIn(true)}>Start today's check-in</Button>
            )}
            {self && data.checked_in_today && !checkIn && (
              <Button icon={ClipboardPen} onClick={() => setCheckIn(true)}>Update check-in</Button>
            )}
            {needsAck && (
              <Button variant="primary" icon={CheckCircle2} loading={acking} onClick={acknowledge}>Acknowledge alert</Button>
            )}
            {!self && canLog && !checkIn && <Button icon={ClipboardPen} onClick={() => setCheckIn(true)}>Log reading</Button>}
            {can("use_assistant") && (
              <Button icon={Sparkles} onClick={() => setAi({ open: true, question: null })}>
                {self ? "Explain my status" : "Ask AI"}
              </Button>
            )}
          </div>
        </div>
        {alert?.acknowledged && !self && (
          <p className="mt-3 text-sm text-ink-2">Alert acknowledged by {alert.acknowledged_by}.</p>
        )}
      </section>

      {!inPanel && <SpaceWeatherStrip sw={sw} />}

      {checkIn && (
        <section aria-labelledby="checkin-h" className="rounded-xl bg-surface-1 px-5 py-5 ring-1 ring-line">
          <h2 id="checkin-h" className="mb-4 text-lg font-semibold">{self ? "Today's check-in" : `Log a reading for ${data.name}`}</h2>
          <CheckIn astronautId={id} current={ev.current} mode={self ? "self" : "cmo"} onSaved={saved} onCancel={() => setCheckIn(false)} />
        </section>
      )}

      {alert?.ground_note && (
        <section className="flex gap-3 rounded-xl bg-surface-1 px-5 py-4 ring-1 ring-series/50" aria-label="Advice from ground">
          <MessageSquareText className="mt-0.5 h-5 w-5 shrink-0 text-series" aria-hidden />
          <div>
            <h2 className="font-medium text-ink-1">Advice from the ground flight surgeon</h2>
            <p className="mt-1 text-ink-1">{alert.ground_note}</p>
            <p className="mt-1 text-xs text-ink-3">{new Date(alert.ground_note_at).toLocaleString()}</p>
          </div>
        </section>
      )}

      {alert && can("ground_note") && <AdviceComposer alert={alert} onSaved={load} />}

      <div>
        <Tabs label="Astronaut sections" value={tab} onChange={(t) => { setTab(t); setFocus(null); }}
              tabs={[["today", inPanel ? "Overview" : "Today", ev.findings.length], ["trends", "Trends"], ["history", "History"]]} />
        <div className="pt-5">
          {tab === "today" && (
            <div className="space-y-8">
              <section>
                <SectionHeading aside={ev.findings.length ? `${ev.findings.length} item${ev.findings.length > 1 ? "s" : ""}` : null}>
                  Needs attention
                </SectionHeading>
                <ProblemList findings={ev.findings} readings={readings} baseline={ev.baseline}
                             onAsk={can("use_assistant") ? askAbout : null} selfView={self}
                             emptyText={self ? "Nothing needs your attention. Keep to your schedule." : undefined} />
              </section>
              <section>
                <SectionHeading aside="Last 14 days · tap for full chart">{self ? "Your readings" : "Readings"}</SectionHeading>
                <VitalTiles current={ev.current} baseline={ev.baseline} series={data.series} findings={ev.findings}
                            radiation={ev.radiation} selfView={self} onOpen={(m) => { setFocus(m); setTab("trends"); }} />
              </section>
            </div>
          )}
          {tab === "trends" && <TrendsView readings={readings} baseline={ev.baseline} focus={focus} />}
          {tab === "history" && <AlertsLog user={user} astronautId={id} embedded onChanged={() => { load(); onChanged?.(); }} />}
        </div>
      </div>

      {can("use_assistant") && (
        <AiDrawer open={ai.open} question={ai.question} onClose={() => setAi({ open: false, question: null })}
                  astronautId={id} name={data.name} llm={llm} />
      )}
    </div>
  );
}

function ViewSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <div className="h-36 animate-pulse rounded-xl bg-surface-1" />
      <div className="h-11 w-64 animate-pulse rounded-lg bg-surface-1" />
      <div className="h-48 animate-pulse rounded-xl bg-surface-1" />
    </div>
  );
}
