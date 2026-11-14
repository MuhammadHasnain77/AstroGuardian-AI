import { ExternalLink, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api.js";
import { STATUS, timeAgo } from "./Status.jsx";
import { SectionHeading, Sparkline } from "./ui.jsx";

// S1–S2 are shown but don't change anyone's alert tier; S3 = YELLOW, S4+ = RED (see backend/space_weather.py).
const tone = (s) => (s == null ? STATUS.UNKNOWN : s >= 4 ? STATUS.RED : s >= 1 ? STATUS.YELLOW : null);
const log = (v) => (v > 0 ? Math.log10(v) : null);
const fmt = (v) => (v == null ? "—" : v >= 100 ? Math.round(v).toLocaleString() : v >= 1 ? v.toFixed(1) : v.toFixed(2));

export function useSpaceWeather(pulse) {
  const [sw, setSw] = useState(null);
  useEffect(() => {
    api.spaceWeather().then(setSw).catch(() => setSw({ source: "unavailable" }));
  }, [pulse]);
  return sw;
}

/** One-line status for the astronaut and CMO screens. */
export function SpaceWeatherStrip({ sw }) {
  if (!sw || sw.source === "off") return null;
  if (sw.source === "unavailable") {
    return (
      <p className="flex items-center gap-2 text-sm text-ink-3">
        <Sun className="h-4 w-4" aria-hidden /> Space weather unavailable: no connection to NOAA or NASA.
      </p>
    );
  }
  const t = tone(sw.s_level);
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl px-4 py-3 ring-1 ${t ? `${t.bg} ${t.ring}` : "bg-surface-1 ring-line"}`}>
      <Sun className={`h-5 w-5 shrink-0 ${t ? t.icolor : "text-series"}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className={`font-medium ${t ? t.text : "text-ink-1"}`}>
          {sw.s_level == null ? "Solar particle event reported" : sw.s_text}
        </p>
        <p className="text-sm text-ink-3">
          ≥10 MeV protons {fmt(sw.proton_10mev_pfu)} pfu · {sw.source_label}
          {sw.observed_at ? ` · ${timeAgo(sw.observed_at)}` : ""}{sw.fresh === false && sw.observed_at ? " (stale)" : ""}
        </p>
      </div>
      {sw.series?.length > 1 && (
        <div className="w-32">
          <Sparkline values={sw.series.map((p) => log(p.pfu))} height={28}
                     label={`Proton flux, last ${sw.series.length} hours (log scale)`} />
        </div>
      )}
    </div>
  );
}

/** Full panel for the ground: 24 h flux on a log scale with S-scale lines, plus the DONKI event log. */
export function SpaceWeatherPanel({ sw }) {
  if (!sw || sw.source === "off") return null;
  const donkiDown = sw.errors?.some((e) => e.startsWith("DONKI"));
  return (
    <section aria-labelledby="sw-h" className="space-y-3">
      <SectionHeading aside="NOAA GOES live · NASA DONKI events"><span id="sw-h">Space weather</span></SectionHeading>
      <SpaceWeatherStrip sw={sw} />
      {sw.series?.length > 1 && (
        <figure className="rounded-xl bg-surface-1 p-4 ring-1 ring-line">
          <figcaption className="mb-2 font-medium">
            ≥10 MeV proton flux <span className="text-sm font-normal text-ink-3">· pfu, hourly max, log scale · dashed = NOAA storm levels</span>
          </figcaption>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sw.series} margin={{ top: 6, right: 40, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="#2f2f2c" vertical={false} />
                <XAxis dataKey="t" stroke="#8f8e86" tick={{ fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#2f2f2c" }}
                       minTickGap={40} tickFormatter={(t) => new Date(t).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })} />
                <YAxis scale="log" domain={[0.1, 100000]} ticks={[0.1, 1, 10, 100, 1000, 10000, 100000]} allowDataOverflow
                       stroke="#8f8e86" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={52}
                       tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : String(v))} />
                {[[10, "S1"], [1000, "S3"], [10000, "S4"]].map(([y, l]) => (
                  <ReferenceLine key={l} y={y} stroke="#c3c2b7" strokeDasharray="4 4"
                                 label={{ value: l, position: "right", fill: "#c3c2b7", fontSize: 11 }} />
                ))}
                <Line dataKey="pfu" stroke="#3987e5" strokeWidth={2} dot={false} isAnimationActive={false}
                      activeDot={{ r: 5, stroke: "#1a1a19", strokeWidth: 2 }} />
                <Tooltip cursor={{ stroke: "#8f8e86" }}
                         content={({ active, payload }) => active && payload?.length ? (
                           <div className="rounded-lg bg-surface-3 px-3 py-2 text-sm ring-1 ring-line">
                             <div className="text-xs text-ink-3">{new Date(payload[0].payload.t).toLocaleString()}</div>
                             <div className="font-mono text-ink-1">{fmt(payload[0].value)} pfu</div>
                           </div>) : null} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </figure>
      )}
      <div className="rounded-xl bg-surface-1 px-5 py-4 ring-1 ring-line">
        <h3 className="font-medium text-ink-1">Solar particle events, last 30 days</h3>
        {!sw.events_available ? (
          <p className="mt-1 text-sm text-ink-3">
            NASA DONKI event log unavailable{donkiDown ? " (request limit reached; set NASA_API_KEY)" : ""}.
          </p>
        ) : sw.events?.length ? (
          <ul className="mt-2 space-y-1 text-sm">
            {sw.events.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-x-2">
                <span className="font-mono text-ink-1">{new Date(e.time).toLocaleString()}</span>
                <span className="text-ink-3">{e.instruments?.join(", ")}</span>
                {e.link && (
                  <a href={e.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-ink-2 underline underline-offset-4 hover:text-ink-1">
                    DONKI <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  </a>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-ink-2">None reported.</p>
        )}
      </div>
    </section>
  );
}
