import { AlertTriangle, ArrowDown, ArrowUp, ExternalLink } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { SectionHeading, Sparkline } from "../components/ui.jsx";

const fmt = (v) => (v == null ? "—" : Math.abs(v) >= 100 ? Math.round(v).toLocaleString() : +v.toFixed(2));

/**
 * Real crew blood tests from Inspiration4 (NASA OSDR): each analyte the day
 * after return (R+1) against that person's own pre-flight baseline.
 */
export default function Labs() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [crew, setCrew] = useState(null);
  const [panel, setPanel] = useState("all");
  const [notableOnly, setNotableOnly] = useState(false);

  useEffect(() => {
    api.labs().then((d) => { setData(d); setCrew(d.crew[0]); }).catch((e) => setError(e.message));
  }, []);

  const rows = useMemo(() => {
    if (!data || !crew) return [];
    return data.analytes
      .filter((a) => panel === "all" || a.panel === panel)
      .map((a) => ({ ...a, c: a.crew[crew] }))
      .filter((a) => a.c && (!notableOnly || a.c.notable))
      .sort((x, y) => (y.c.r1_out_of_range - x.c.r1_out_of_range) || (y.c.notable - x.c.notable)
        || Math.abs(y.c.change_pct ?? 0) - Math.abs(x.c.change_pct ?? 0));
  }, [data, crew, panel, notableOnly]);

  if (error) return <p role="alert" className="text-status-text-critical">{error}</p>;
  if (!data) return <div className="h-40 animate-pulse rounded-xl bg-surface-1" aria-busy="true" aria-label="Loading" />;

  const outCount = data.analytes.filter((a) => a.crew[crew]?.r1_out_of_range).length;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Labs: Inspiration4 reference crew</h1>
        <p className="max-w-prose text-ink-2">
          Real blood tests from the {data.mission} crew, published by NASA. Each value the day after return (R+1) is
          compared with that person's own pre-flight baseline. Blood was drawn before launch and after return only, and
          these four people are not the simulated crew.
        </p>
        <p className="flex flex-wrap gap-x-4 text-sm">
          {data.sources.map((s) => (
            <a key={s.study} href={s.url} target="_blank" rel="noreferrer"
               className="inline-flex items-center gap-1 text-ink-2 underline underline-offset-4 hover:text-ink-1">
              NASA OSDR {s.study}: {s.name} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          ))}
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <Segmented label="Crew member" value={crew} onChange={setCrew} options={data.crew.map((c) => [c, c])} />
        <Segmented label="Panel" value={panel} onChange={setPanel}
                   options={[["all", "All"], ["cmp", "Metabolic"], ["cbc", "Blood count"]]} />
        <label className="flex h-11 cursor-pointer items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" checked={notableOnly} onChange={(e) => setNotableOnly(e.target.checked)} className="h-4 w-4" />
          Only notable
        </label>
      </div>

      <section aria-labelledby="labs-h">
        <SectionHeading aside={`${outCount} outside reference range at R+1 · highlighted: outside range or ≥${data.notable_change_pct}% change`}>
          <span id="labs-h">{crew}: day after return vs pre-flight</span>
        </SectionHeading>
        <div className="overflow-x-auto rounded-xl bg-surface-1 ring-1 ring-line">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <caption className="sr-only">Lab values for {crew}, most notable first</caption>
            <thead className="border-b border-line text-ink-3">
              <tr>
                <th scope="col" className="px-5 py-3 font-medium">Test</th>
                <th scope="col" className="px-3 py-3 font-medium">Reference range</th>
                <th scope="col" className="px-3 py-3 font-medium">Pre-flight</th>
                <th scope="col" className="px-3 py-3 font-medium">Day after return</th>
                <th scope="col" className="px-3 py-3 font-medium">Change</th>
                <th scope="col" className="px-3 py-3 font-medium">L-92 → R+194</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((a) => <Row key={a.id} a={a} />)}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <p className="mt-3 text-ink-2">No notable changes for {crew} in this panel.</p>}
        <p className="mt-2 text-xs text-ink-3">{data.note}</p>
        {data.excluded?.filter((e) => e.crew === crew).map((e) => (
          <p key={`${e.crew}-${e.timepoint}`} className="mt-1 flex gap-1.5 text-xs text-status-text-warning">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Data quality: {e.panel} draw {e.timepoint} ({e.study}). {e.reason}
          </p>
        ))}
      </section>
    </div>
  );
}

function Row({ a }) {
  const { c } = a;
  const [lo, hi] = c.range;
  const Arrow = c.change_pct > 0 ? ArrowUp : ArrowDown;
  return (
    <tr className={c.notable ? "bg-status-warning/5" : ""}>
      <th scope="row" className="px-5 py-3 font-normal">
        <span className="font-medium text-ink-1">{a.name}</span>
        <span className="block text-xs text-ink-3">{a.panel_name}{a.unit ? ` · ${a.unit}` : ""}</span>
        {a.unit_note && <span className="block text-xs text-ink-3">{a.unit_note}</span>}
      </th>
      <td className="whitespace-nowrap px-3 py-3 font-mono text-ink-2">
        {lo != null && hi != null ? `${fmt(lo)}–${fmt(hi)}` : lo != null ? `≥ ${fmt(lo)}` : hi != null ? `≤ ${fmt(hi)}` : "—"}
      </td>
      <td className="px-3 py-3 font-mono text-ink-2">{fmt(c.baseline)}</td>
      <td className="whitespace-nowrap px-3 py-3 font-mono">
        <span className={c.r1_out_of_range ? "text-status-text-warning" : "text-ink-1"}>{fmt(c.r1)}</span>
        {c.r1_out_of_range && (
          <span className="ml-2 inline-flex items-center gap-1 font-sans text-xs text-status-text-warning">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> {c.r1 < lo ? "low" : "high"}
          </span>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-3 font-mono text-ink-2">
        {c.change_pct == null ? "—" : (
          <span className="inline-flex items-center gap-1">
            <Arrow className="h-3.5 w-3.5" aria-hidden />{Math.abs(c.change_pct)}%
          </span>
        )}
      </td>
      <td className="w-36 px-3 py-3">
        <Sparkline values={c.series.map((p) => p.value)} band={lo != null && hi != null ? [lo, hi] : null} height={26}
                   label={`${a.name}, 7 draws from 92 days before launch to 194 days after return`} />
      </td>
    </tr>
  );
}

function Segmented({ label, value, onChange, options }) {
  return (
    <div className="flex rounded-lg bg-surface-2 p-1 text-sm" role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} aria-pressed={value === v} onClick={() => onChange(v)}
                className={`h-9 rounded-md px-3 ${value === v ? "bg-surface-3 text-ink-1" : "text-ink-3 hover:text-ink-1"}`}>
          {text}
        </button>
      ))}
    </div>
  );
}
