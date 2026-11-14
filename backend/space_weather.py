"""Live space weather: real solar proton flux from NOAA, with NASA DONKI as fallback.

    NOAA SWPC  GOES integral proton flux (5-minute data, primary GOES satellite)
               https://services.swpc.noaa.gov/json/goes/primary/integral-protons-1-day.json
    NASA DONKI Solar Energetic Particle (SEP) event log
               https://api.nasa.gov/DONKI/SEP

Network access never blocks health evaluation: the last good snapshot is
stored in the database and reused, and fetches have a short timeout. Set
SPACE_WEATHER=off to disable all network calls (tests, or a fully offline
spacecraft whose own dosimeters take over).
"""

import json
import os
import threading
import time
from datetime import datetime, timedelta, timezone

import httpx

from . import db

NOAA_URL = os.getenv("NOAA_PROTONS_URL",
                     "https://services.swpc.noaa.gov/json/goes/primary/integral-protons-1-day.json")
DONKI_URL = "https://api.nasa.gov/DONKI/SEP"
REFRESH_SECONDS = 300          # NOAA publishes 5-minute data
TIMEOUT = 4.0
META_KEY = "space_weather"

# NOAA Space Weather Scale for solar radiation storms: ≥10 MeV proton flux (pfu).
S_SCALE = [(100_000, 5), (10_000, 4), (1_000, 3), (100, 2), (10, 1)]
S_TEXT = {
    0: "No radiation storm",
    1: "Minor radiation storm (S1)",
    2: "Moderate radiation storm (S2)",
    3: "Strong radiation storm (S3): radiation hazard avoidance recommended for astronauts on EVA",
    4: "Severe radiation storm (S4): unavoidable radiation hazard to astronauts on EVA",
    5: "Extreme radiation storm (S5): unavoidable high radiation hazard to astronauts on EVA",
}

_lock = threading.Lock()
_memo: dict = {"at": 0.0, "value": None}


def s_level(pfu: float | None) -> int:
    if pfu is None:
        return 0
    for limit, level in S_SCALE:
        if pfu >= limit:
            return level
    return 0


def enabled() -> bool:
    return os.getenv("SPACE_WEATHER", "live").lower() not in ("off", "0", "false")


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ------------------------------------------------------------------- fetch ---

def fetch_noaa() -> dict:
    resp = httpx.get(NOAA_URL, timeout=TIMEOUT)
    resp.raise_for_status()
    rows = resp.json()
    p10 = [r for r in rows if r.get("energy") == ">=10 MeV" and r.get("flux") is not None]
    p100 = [r for r in rows if r.get("energy") == ">=100 MeV" and r.get("flux") is not None]
    if not p10:
        raise ValueError("no >=10 MeV data in NOAA response")
    p10.sort(key=lambda r: r["time_tag"])
    p100.sort(key=lambda r: r["time_tag"])
    # Hourly maxima keep the 24 h series small for the UI.
    hourly: dict[str, float] = {}
    for r in p10:
        hour = r["time_tag"][:13]
        hourly[hour] = max(hourly.get(hour, 0.0), float(r["flux"]))
    latest = p10[-1]
    peak = max(float(r["flux"]) for r in p10)
    return {
        "source": "noaa",
        "source_label": f"NOAA SWPC · GOES-{latest.get('satellite', '?')}",
        "observed_at": latest["time_tag"],
        "proton_10mev_pfu": round(float(latest["flux"]), 4),
        "proton_100mev_pfu": round(float(p100[-1]["flux"]), 4) if p100 else None,
        "peak_24h_pfu": round(peak, 4),
        "s_level": s_level(float(latest["flux"])),
        "peak_s_level": s_level(peak),
        "series": [{"t": f"{h}:00:00Z", "pfu": round(v, 4)} for h, v in sorted(hourly.items())],
    }


def fetch_donki(days: int = 30) -> list:
    start = (_now() - timedelta(days=days)).date().isoformat()
    resp = httpx.get(DONKI_URL, timeout=TIMEOUT,
                     params={"startDate": start, "endDate": _now().date().isoformat(),
                             "api_key": os.getenv("NASA_API_KEY", "DEMO_KEY")})
    resp.raise_for_status()
    events = resp.json() or []
    return [{"id": e.get("sepID"), "time": e.get("eventTime"), "link": e.get("link"),
             "instruments": [i.get("displayName") for i in e.get("instruments") or []]}
            for e in sorted(events, key=lambda e: e.get("eventTime") or "", reverse=True)[:10]]


# ---------------------------------------------------------------- snapshot ---

def _annotate(snap: dict) -> dict:
    """Add derived fields that depend on the current time."""
    out = dict(snap)
    obs = out.get("observed_at")
    age_min = None
    if obs:
        age_min = (_now() - datetime.fromisoformat(obs.replace("Z", "+00:00"))).total_seconds() / 60
    out["age_minutes"] = None if age_min is None else round(age_min)
    # Only fresh measurements may change anyone's alert tier.
    out["fresh"] = age_min is not None and age_min <= 120
    out["s_text"] = S_TEXT.get(out.get("s_level") or 0)
    recent = [e for e in out.get("events") or []
              if e.get("time") and _now() - datetime.fromisoformat(e["time"].replace("Z", "+00:00")) < timedelta(hours=24)]
    out["sep_event_last_24h"] = bool(recent)
    # Distinguish "no events" from "couldn't fetch the event log".
    out["events_available"] = bool(out.get("events_fetched_at"))
    return out


def _store(snap: dict):
    with db.connect() as c:
        c.execute("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
                  (META_KEY, json.dumps(snap)))


def _load() -> dict | None:
    with db.connect() as c:
        raw = c.scalar("SELECT value FROM meta WHERE key = ?", (META_KEY,))
    return json.loads(raw) if raw else None


def refresh() -> dict:
    """Fetch now. NOAA first; DONKI for the event log, and as fallback when NOAA fails."""
    snap, errors = None, []
    try:
        snap = fetch_noaa()
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
        errors.append(f"NOAA: {type(exc).__name__}")
    previous = _load()
    # DONKI's free key allows ~30 requests/hour: refresh the event log hourly,
    # or immediately when NOAA is down and it's the only source.
    events, events_at = None, (previous or {}).get("events_fetched_at")
    stale_events = not events_at or (_now() - datetime.fromisoformat(events_at)).total_seconds() > 3600
    if stale_events or snap is None:
        try:
            events = fetch_donki()
            events_at = _now().isoformat(timespec="seconds")
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
            errors.append(f"DONKI: {type(exc).__name__}")

    if snap is None:
        if previous:                                # keep the last real measurement
            snap = {**previous, "source": "cache"}
        elif events is not None:                   # DONKI only: events, no intensity
            snap = {"source": "donki", "source_label": "NASA DONKI (NOAA unavailable)", "observed_at": None,
                    "proton_10mev_pfu": None, "proton_100mev_pfu": None, "peak_24h_pfu": None,
                    "s_level": None, "peak_s_level": None, "series": []}
        else:
            return {"source": "unavailable", "errors": errors}
    snap["events"] = events if events is not None else (previous or {}).get("events", [])
    snap["events_fetched_at"] = events_at
    snap["fetched_at"] = _now().isoformat(timespec="seconds")
    snap["errors"] = errors
    if snap["source"] in ("noaa", "donki"):
        _store(snap)
    return snap


def snapshot(force: bool = False) -> dict:
    """Current space weather. Cheap: memoised in-process, refreshed at most every 5 minutes."""
    if not enabled():
        return {"source": "off", "s_level": None, "fresh": False}
    with _lock:
        if not force and _memo["value"] is not None and time.time() - _memo["at"] < REFRESH_SECONDS:
            return _annotate(_memo["value"])
        stored = None if force else _load()
        if stored and stored.get("fetched_at") and \
                (_now() - datetime.fromisoformat(stored["fetched_at"])).total_seconds() < REFRESH_SECONDS:
            value = stored
        else:
            value = refresh()
        _memo.update(at=time.time(), value=value)
        return _annotate(value)


def engine_context() -> dict | None:
    """The minimal, fresh-only view the health engine needs."""
    s = snapshot()
    if s.get("source") in ("off", "unavailable") or not s.get("fresh") or s.get("s_level") is None:
        return None
    return {"s_level": s["s_level"], "proton_10mev_pfu": s["proton_10mev_pfu"],
            "observed_at": s["observed_at"], "source_label": s["source_label"]}


def reset_memo():
    _memo.update(at=0.0, value=None)
