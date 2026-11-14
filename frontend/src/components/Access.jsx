import { Check, HeartPulse, Loader2, Satellite, ShieldCheck, Stethoscope, UserRound, X } from "lucide-react";
import { useState } from "react";
import { api } from "../api.js";

const ROLE_ICON = { astronaut: UserRound, cmo: Stethoscope, ground: Satellite };

const ROLE_CAN = {
  astronaut: ["Your own status, vitals and alerts", "Log daily check-ins", "Ask the AI assistant"],
  cmo: ["Whole-crew dashboard", "Log readings for any astronaut", "Acknowledge alerts", "Ask the AI assistant"],
  ground: ["Whole-crew dashboard (read-only vitals)", "Add flight-surgeon advice to alerts", "Run ground sync", "Ask the AI assistant"],
};
const ROLE_CANNOT = {
  astronaut: ["Other astronauts' data", "Acknowledge alerts or sync"],
  cmo: ["Ground notes or sync"],
  ground: ["Log readings", "Acknowledge alerts"],
};

function Shell({ children }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-3xl">
        <div className="mb-8 flex items-center justify-center gap-2 text-2xl font-semibold">
          <ShieldCheck className="h-8 w-8 text-series" aria-hidden /> AstroGuardian
        </div>
        {children}
      </div>
    </div>
  );
}

export function RolePicker({ state, onChosen }) {
  const [astronautId, setAstronautId] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  async function choose(role) {
    if (role === "astronaut" && !astronautId) {
      setError("Choose which astronaut you are.");
      return;
    }
    setBusy(role);
    setError(null);
    try {
      await api.chooseRole(role, role === "astronaut" ? astronautId : null);
      onChosen();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Shell>
      <h1 className="text-center text-xl font-semibold">Choose your role</h1>
      <p className="mt-1 text-center text-sm text-ink-3">Each role sees and can do different things.</p>
      {error && <p role="alert" className="mt-3 text-center text-sm text-status-text-critical">{error}</p>}
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {state.roles.map((r) => {
          const Icon = ROLE_ICON[r.id] ?? HeartPulse;
          return (
            <div key={r.id} className="flex flex-col rounded-xl bg-surface-1 p-5 ring-1 ring-line">
              <Icon className="h-7 w-7 text-series" aria-hidden />
              <h2 className="mt-3 font-semibold">{r.label}</h2>
              <p className="mt-1 text-sm text-ink-3">{r.description}</p>
              <ul className="mt-3 space-y-1 text-sm">
                {ROLE_CAN[r.id]?.map((t) => (
                  <li key={t} className="flex gap-2 text-ink-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-status-good" aria-label="Can" role="img" /> {t}
                  </li>
                ))}
                {ROLE_CANNOT[r.id]?.map((t) => (
                  <li key={t} className="flex gap-2 text-ink-3">
                    <X className="mt-0.5 h-4 w-4 shrink-0" aria-label="Cannot" role="img" /> {t}
                  </li>
                ))}
              </ul>
              {r.id === "astronaut" && (
                <>
                  <label htmlFor="who" className="mt-4 text-sm text-ink-2">I am</label>
                  <select id="who" value={astronautId} onChange={(e) => setAstronautId(e.target.value)}
                          className="mt-1 rounded-lg bg-surface-2 px-3 py-2 text-ink-1 ring-1 ring-line focus:outline-none focus:ring-series">
                    <option value="">Select astronaut…</option>
                    {state.astronauts.map((a) => (
                      <option key={a.id} value={a.id}>{a.name} · {a.role}</option>
                    ))}
                  </select>
                </>
              )}
              <div className="flex-1" />
              <button onClick={() => choose(r.id)} disabled={busy !== null}
                      className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg bg-action px-4 py-2 text-sm font-medium text-white hover:bg-action-hover disabled:opacity-60">
                {busy === r.id && <Loader2 className="h-4 w-4 animate-spin" />} Continue as {r.label}
              </button>
            </div>
          );
        })}
      </div>
    </Shell>
  );
}
