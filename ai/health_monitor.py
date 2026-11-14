"""Full analysis pipeline: baseline -> risk detection -> recommendations.

All timestamps are handled as UTC. Naive timestamps are assumed to be UTC.
"""

import pandas as pd

from . import thresholds as T
from .baseline import calculate_baseline
from .recommendations import get_recommendations
from .risk_detection import career_dose, detect_risk


def _utc(value):
    ts = pd.to_datetime(value, errors="coerce", utc=True)
    return ts


def evaluate(readings: pd.DataFrame, current: dict | None = None,
             stale_after_hours: float | None = None, now: pd.Timestamp | None = None,
             context: dict | None = None, carry_forward_hours: float | None = None) -> dict:
    """Evaluate one astronaut.

    readings - that astronaut's readings, any order, with a `timestamp` column.
    current  - reading to evaluate. If None, the most recent reading in
               `readings` is used and everything before it is history.
    stale_after_hours - if set and the evaluated reading is older than this,
               a GREEN status is downgraded to UNKNOWN (fail safe: old data
               cannot prove the astronaut is fine right now).
    context  - astronaut facts, e.g. {"prior_career_dose_msv": 120.0}
    carry_forward_hours - if set, a metric missing from the latest reading
               takes its most recent value from the last N hours. Sensors and
               self-reports arrive as separate rows; without this a check-in
               with only sleep/mood would look like a sensor dropout. Values
               older than N hours are NOT carried, so real dropouts still show.
    """
    df = readings.copy()
    if "timestamp" not in df.columns:
        df["timestamp"] = pd.Series(dtype="datetime64[ns, UTC]")
    df["timestamp"] = _utc(df["timestamp"])
    df = df.sort_values("timestamp").reset_index(drop=True)

    if current is None:
        if df.empty:
            return _no_data(context)
        current = df.iloc[-1].to_dict()
        history = df.iloc[:-1]
        if carry_forward_hours:
            current = _carry_forward(current, history, carry_forward_hours)
    else:
        history = df
        current = dict(current)
        current.setdefault("timestamp", pd.Timestamp.now(tz="UTC"))
    current["timestamp"] = _utc(current["timestamp"])

    baseline = calculate_baseline(history, T.BASELINE_WINDOW)
    series = pd.concat([history, pd.DataFrame([current])], ignore_index=True)
    risk = detect_risk(current, baseline, series, context)

    ts = current["timestamp"]
    if stale_after_hours:
        now = _utc(now) if now is not None else pd.Timestamp.now(tz="UTC")
        age_h = None if pd.isna(ts) else (now - ts).total_seconds() / 3600
        if age_h is None or age_h > stale_after_hours:
            age_txt = "unknown age" if age_h is None else f"{age_h:.0f} h old"
            risk["findings"].insert(0, {
                "metric": "timestamp", "label": "Data freshness", "severity": "UNKNOWN", "kind": "missing",
                "message": f"Latest reading is {age_txt} (limit {stale_after_hours:g} h) — current status cannot be confirmed.",
                "value": None, "unit": "", "source": "team", "source_text": T.SOURCES["team"]})
            if risk["risk_level"] == "GREEN":
                risk["risk_level"] = "UNKNOWN"

    rec = get_recommendations(risk["risk_level"], risk["findings"])
    return {
        "risk_level": risk["risk_level"],
        "findings": risk["findings"],
        "summary": rec["summary"],
        "actions": rec["actions"],
        "baseline": baseline,
        "current": {k: _clean(v) for k, v in current.items() if k != "timestamp"},
        "reading_timestamp": None if pd.isna(ts) else ts.isoformat(),
        "history_count": int(len(history)),
        "radiation": {"career_dose_msv": career_dose(series, context),
                      "limit_msv": T.RADIATION_CAREER_LIMIT_MSV},
    }


def _carry_forward(current: dict, history: pd.DataFrame, hours: float) -> dict:
    ts = current.get("timestamp")
    if history.empty or pd.isna(ts):
        return current
    recent = history[history["timestamp"] >= ts - pd.Timedelta(hours=hours)]
    out = dict(current)
    for m in list(T.NUMERIC_METRICS) + ["stress_level"]:
        if m in recent.columns and _clean(out.get(m)) is None:
            vals = recent[m].dropna()
            if not vals.empty:
                out[m] = vals.iloc[-1]
    return out


def _clean(v):
    if v is None:
        return None
    try:
        if pd.isna(v):
            return None
    except (TypeError, ValueError):
        pass
    if hasattr(v, "item"):
        return v.item()
    return v


def _no_data(context=None):
    rec = get_recommendations("UNKNOWN", [])
    return {
        "risk_level": "UNKNOWN",
        "findings": [{"metric": "heart_rate", "label": "Data", "severity": "UNKNOWN", "kind": "missing",
                      "message": "No readings recorded for this astronaut yet.", "value": None, "unit": "",
                      "source": "team", "source_text": T.SOURCES["team"]}],
        "summary": rec["summary"], "actions": rec["actions"], "baseline": {},
        "current": {}, "reading_timestamp": None, "history_count": 0,
        "radiation": {"career_dose_msv": career_dose(None, context), "limit_msv": T.RADIATION_CAREER_LIMIT_MSV},
    }


class AstroHealthMonitor:
    """Convenience wrapper around a CSV of readings for many astronauts."""

    def __init__(self, csv_path: str):
        self.df = pd.read_csv(csv_path)

    def evaluate_astronaut(self, astronaut_id: str, current_reading: dict | None = None,
                           context: dict | None = None) -> dict:
        rows = self.df[self.df["astronaut_id"] == astronaut_id]
        result = evaluate(rows, current_reading, context=context)
        result["astronaut_id"] = astronaut_id
        return result


if __name__ == "__main__":
    import json
    import sys
    from pathlib import Path

    csv = Path(__file__).resolve().parent.parent / "data" / "sample_health_data.csv"
    monitor = AstroHealthMonitor(str(csv))
    for aid in sys.argv[1:] or sorted(monitor.df["astronaut_id"].unique()):
        r = monitor.evaluate_astronaut(aid)
        print(json.dumps({k: r[k] for k in ("astronaut_id", "risk_level")}))
        for f in r["findings"]:
            print(f"   [{f['severity']}/{f['kind']}] {f['message']}  <{f['source']}>")
