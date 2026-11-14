import { Bell, CloudOff, FlaskConical, LogOut, Repeat, Satellite, ShieldCheck, Stethoscope, WifiOff } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { api, clearApiCache, on } from "./api.js";
import { Gate, RolePicker } from "./components/Access.jsx";
import { IconButton } from "./components/ui.jsx";

// Screens (and the chart library they pull in) load only after login, so the
// password and role screens stay small.
const AlertsLog = lazy(() => import("./components/AlertsLog.jsx"));
const AstronautView = lazy(() => import("./components/AstronautView.jsx"));
const GroundInbox = lazy(() => import("./screens/GroundInbox.jsx"));
const Triage = lazy(() => import("./screens/Triage.jsx"));
const Labs = lazy(() => import("./screens/Labs.jsx"));

// Minimal hash router: #/   #/crew/ID   #/alerts
function useRoute() {
  const parse = () => window.location.hash.replace(/^#\/?/, "").split("/");
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const onHash = () => setRoute(parse());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return [route, (path) => { window.location.hash = `/${path}`; }];
}

export default function App() {
  const [auth, setAuth] = useState(null); // {unlocked, user, roles, astronauts}
  const [authError, setAuthError] = useState(null);

  const loadAuth = useCallback(async () => {
    try {
      setAuth(await api.authState());
      setAuthError(null);
    } catch (e) {
      setAuthError(e.message);
    }
  }, []);

  useEffect(() => {
    loadAuth();
    return on("unauthorized", loadAuth);
  }, [loadAuth]);

  async function leave(fn) {
    await fn().catch(() => {});
    await clearApiCache();
    window.location.hash = "/";
    loadAuth();
  }

  if (!auth) {
    return (
      <div className="flex min-h-screen items-center justify-center text-ink-3">
        {authError ? <span className="flex items-center gap-2"><WifiOff className="h-4 w-4" /> {authError}</span> : "Loading…"}
      </div>
    );
  }
  if (!auth.unlocked) return <Gate onUnlocked={loadAuth} />;
  if (!auth.user) return <RolePicker state={auth} onChosen={loadAuth} onLock={() => leave(api.logout)} />;
  return <Shell user={auth.user} onSwitchRole={() => leave(api.switchRole)} onLock={() => leave(api.logout)} />;
}

const NAV = {
  astronaut: [],
  cmo: [["", "Triage", Stethoscope], ["labs", "Labs", FlaskConical], ["alerts", "Alert history", Bell]],
  ground: [["", "Comms window", Satellite], ["labs", "Labs", FlaskConical], ["alerts", "Alert history", Bell]],
};

function Shell({ user, onSwitchRole, onLock }) {
  const [route, go] = useRoute();
  const [crew, setCrew] = useState([]);
  const [config, setConfig] = useState(null);
  const [offline, setOffline] = useState(false);
  const [cachedAt, setCachedAt] = useState(null);
  const [tick, setTick] = useState(0);

  useEffect(() => on("cache", setCachedAt), []);

  const refresh = useCallback(async () => {
    try {
      const [c, cfg] = await Promise.all([api.crew(), api.config()]);
      setCrew(c);
      setConfig(cfg);
      setOffline(false);
      setTick((t) => t + 1);
    } catch (e) {
      if (e.status === 0) setOffline(true);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 30000);
    return () => clearInterval(t);
  }, [refresh]);

  const [page, param] = route;
  const llm = config?.llm;
  // Old links (#/astronaut/ID) still work.
  const openId = (page === "crew" || page === "astronaut") ? param : null;
  const home = page !== "alerts" && page !== "labs";

  let content;
  if (user.role === "astronaut") {
    content = <AstronautView key={user.astronaut_id} id={user.astronaut_id} user={user} llm={llm} pulse={tick} onChanged={refresh} />;
  } else if (page === "labs") {
    content = <Labs />;
  } else if (page === "alerts") {
    content = <AlertsLog user={user} onOpen={(id) => go(`crew/${id}`)} onChanged={refresh} />;
  } else {
    const Screen = user.role === "cmo" ? Triage : GroundInbox;
    content = <Screen crew={crew} user={user} llm={llm} openId={openId} onChanged={refresh} pulse={tick}
                      onOpen={(id) => go(`crew/${id}`)} onClose={() => go("")} />;
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-line bg-surface-0/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-1.5">
          <button onClick={() => go("")} className="flex h-11 items-center gap-2 text-lg font-semibold">
            <ShieldCheck className="h-6 w-6 text-series" aria-hidden /> AstroGuardian
          </button>
          <nav aria-label="Main" className="flex items-center gap-1 text-sm">
            {NAV[user.role].map(([path, label, Icon]) => {
              const active = path === "" ? home : page === path;
              return (
                <button key={label} onClick={() => go(path)} aria-current={active ? "page" : undefined}
                        className={`flex h-11 items-center gap-1.5 rounded-lg px-3 ${active ? "bg-surface-2 text-ink-1" : "text-ink-2 hover:text-ink-1"}`}>
                  <Icon className="h-4 w-4" aria-hidden /> {label}
                  {path === "" && user.role === "ground" && config?.unsynced_alerts ? (
                    <span className="rounded-full bg-action px-1.5 text-xs text-white" aria-label={`${config.unsynced_alerts} new`}>
                      {config.unsynced_alerts}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <span className="hidden rounded-full bg-surface-2 px-3 py-1 text-xs text-ink-2 sm:inline" data-testid="role-chip">
              {user.role_label}{user.astronaut_id ? ` · ${user.astronaut_id}` : ""}
            </span>
            <IconButton icon={Repeat} label="Switch role" onClick={onSwitchRole} />
            <IconButton icon={LogOut} label="Lock" onClick={onLock} />
          </div>
        </div>
        {llm?.demo_mode && (
          <p className="border-t border-line bg-surface-1 px-4 py-1.5 text-center text-xs text-ink-3">
            Demo: the AI assistant calls {llm.model} through the Groq API. In flight the same open-weight model runs
            onboard with no internet. Health alerts are always computed locally.
            {!llm.enabled && " (No GROQ_API_KEY set, so answers are templates.)"}
          </p>
        )}
      </header>

      <main className={`mx-auto px-4 py-6 ${user.role === "astronaut" ? "max-w-4xl" : "max-w-6xl"}`}>
        {cachedAt && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-status-warning/15 px-4 py-3 text-sm ring-1 ring-status-warning/50">
            <CloudOff className="h-4 w-4 shrink-0 text-status-warning" aria-hidden />
            Offline. Showing data saved {new Date(cachedAt).toLocaleString()}. New readings can't be saved until the
            connection is back.
          </div>
        )}
        {offline && !cachedAt && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-status-critical/15 px-4 py-3 text-sm ring-1 ring-status-critical/50">
            <WifiOff className="h-4 w-4 text-status-critical" aria-hidden /> Can't reach the onboard AstroGuardian server. What you see may be out of date.
          </div>
        )}
        <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-surface-1" aria-busy="true" aria-label="Loading" />}>
          {content}
        </Suspense>
      </main>

      <footer className={`mx-auto px-4 pb-8 text-xs text-ink-3 ${user.role === "astronaut" ? "max-w-4xl" : "max-w-6xl"}`}>
        Decision support only, not a medical diagnosis. Always follow the Crew Medical Officer and flight surgeon.
      </footer>
    </div>
  );
}
