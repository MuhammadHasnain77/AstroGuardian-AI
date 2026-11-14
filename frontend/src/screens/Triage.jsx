import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { api } from "../api.js";
import AstronautView from "../components/AstronautView.jsx";
import { SpaceWeatherStrip, useSpaceWeather } from "../components/SpaceWeather.jsx";
import { headline, SEVERITY_RANK, StatusBadge, timeAgo } from "../components/Status.jsx";
import { Button, Drawer, normalBand, SectionHeading, Sparkline } from "../components/ui.jsx";

const COLS = [
  { m: "heart_rate", label: "Heart rate", unit: "bpm", digits: 0 },
  { m: "spo2", label: "SpO₂", unit: "%", digits: 0 },
  { m: "sleep_hours", label: "Sleep", unit: "h", digits: 1 },
];

/** CMO home: who needs me, in what order, and what changed. */
export default function Triage({ crew, user, llm, openId, onOpen, onClose, onChanged, pulse }) {
  const sw = useSpaceWeather(pulse);
  const sorted = [...crew].sort((a, b) => SEVERITY_RANK[a.risk_level] - SEVERITY_RANK[b.risk_level]);
  const queue = sorted.filter((a) => a.open_alert && !a.open_alert.acknowledged);
  const open = crew.find((a) => a.id === openId);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Crew triage</h1>
        <p className="text-ink-2">Most urgent first. Select a crew member to review, log a reading or acknowledge.</p>
      </header>

      <SpaceWeatherStrip sw={sw} />

      {queue.length > 0 && (
        <section aria-labelledby="queue-h">
          <SectionHeading aside={`${queue.length} waiting`}><span id="queue-h">Waiting for your acknowledgement</span></SectionHeading>
          <ul className="divide-y divide-line overflow-hidden rounded-xl bg-surface-1 ring-1 ring-line">
            {queue.map((a) => <QueueItem key={a.id} a={a} onOpen={onOpen} onChanged={onChanged} />)}
          </ul>
        </section>
      )}

      <section aria-labelledby="crew-h">
        <SectionHeading aside="Trend: last 14 days, shaded band = personal normal"><span id="crew-h">Crew</span></SectionHeading>
        <CrewTable crew={sorted} onOpen={onOpen} />
        <CrewList crew={sorted} onOpen={onOpen} />
      </section>

      <Drawer open={!!open} onClose={onClose} title={open?.name ?? ""} subtitle={open ? `${open.role} · ${open.id}` : ""}>
        {open && <AstronautView key={open.id} id={open.id} user={user} llm={llm} inPanel onChanged={onChanged} />}
      </Drawer>
    </div>
  );
}

function QueueItem({ a, onOpen, onChanged }) {
  const [busy, setBusy] = useState(false);
  async function ack() {
    setBusy(true);
    try {
      await api.ackAlert(a.open_alert.id);
      onChanged();
    } finally {
      setBusy(false);
    }
  }
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
      <StatusBadge level={a.open_alert.risk_level} />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-ink-1">{a.name}</p>
        <p className="truncate text-sm text-ink-2">
          {headline(a.findings)} · opened {timeAgo(a.open_alert.opened_at)}
          {a.open_alert.occurrences > 1 && `, seen ${a.open_alert.occurrences}×`}
        </p>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="ghost" onClick={() => onOpen(a.id)}>Review</Button>
        <Button size="sm" variant="primary" loading={busy} onClick={ack}>Acknowledge</Button>
      </div>
    </li>
  );
}

function Metric({ a, c }) {
  const v = a.current?.[c.m];
  return (
    <div className="w-full min-w-0 max-w-[7rem]">
      <span className="font-mono text-ink-1">{v != null ? Number(v).toFixed(c.digits) : "—"}</span>
      <span className="ml-1 text-xs text-ink-3">{v != null ? c.unit : ""}</span>
      <Sparkline values={a.series?.[c.m]?.map((p) => p.value)} band={normalBand(a.baseline?.[c.m])} height={22} />
    </div>
  );
}

function CrewTable({ crew, onOpen }) {
  return (
    <div className="hidden overflow-hidden rounded-xl bg-surface-1 ring-1 ring-line md:block">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Crew status, most urgent first</caption>
        <thead className="border-b border-line text-ink-3">
          <tr>
            <th scope="col" className="px-5 py-3 font-medium">Crew member</th>
            <th scope="col" className="px-3 py-3 font-medium">Status</th>
            <th scope="col" className="px-3 py-3 font-medium">Main issue</th>
            {COLS.map((c) => <th key={c.m} scope="col" className="px-3 py-3 font-medium">{c.label}</th>)}
            <th scope="col" className="px-3 py-3 font-medium">Last reading</th>
            <th scope="col"><span className="sr-only">Open</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {crew.map((a) => (
            <tr key={a.id} onClick={() => onOpen(a.id)} className="cursor-pointer align-top transition-colors hover:bg-surface-2">
              <th scope="row" className="px-5 py-4 font-normal">
                <button onClick={(e) => { e.stopPropagation(); onOpen(a.id); }} className="text-left font-medium text-ink-1 hover:underline">
                  {a.name}
                </button>
                <div className="text-ink-3">{a.role}</div>
              </th>
              <td className="px-3 py-4"><StatusBadge level={a.risk_level} /></td>
              <td className="max-w-[16rem] px-3 py-4 text-ink-2">{a.findings.length ? headline(a.findings) : "—"}</td>
              {COLS.map((c) => <td key={c.m} className="px-3 py-4"><Metric a={a} c={c} /></td>)}
              <td className="whitespace-nowrap px-3 py-4 text-ink-2">{timeAgo(a.reading_timestamp)}</td>
              <td className="px-3 py-4 text-ink-3"><ChevronRight className="h-5 w-5" aria-hidden /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Below md, the table becomes a list so nothing scrolls sideways.
function CrewList({ crew, onOpen }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl bg-surface-1 ring-1 ring-line md:hidden">
      {crew.map((a) => (
        <li key={a.id}>
          <button onClick={() => onOpen(a.id)} className="w-full px-4 py-4 text-left hover:bg-surface-2">
            <span className="flex items-center justify-between gap-3">
              <span className="font-medium text-ink-1">{a.name}</span>
              <StatusBadge level={a.risk_level} />
            </span>
            <span className="mt-1 block text-sm text-ink-2">{a.findings.length ? headline(a.findings) : "No issues"}</span>
            <span className="mt-3 grid grid-cols-3 gap-3">
              {COLS.map((c) => (
                <span key={c.m}>
                  <span className="block text-xs text-ink-3">{c.label}</span>
                  <Metric a={a} c={c} />
                </span>
              ))}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
