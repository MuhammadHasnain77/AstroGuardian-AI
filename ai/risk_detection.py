"""Deterministic, explainable risk detection.

This module alone decides the GREEN / YELLOW / RED / UNKNOWN tier. The LLM
layer only explains its output and can never change it.

Each check produces a *finding*:
    {metric, label, severity, kind, message, value, unit, source}
kind is one of:
    "absolute"  - crossed a fixed limit
    "baseline"  - unusual for THIS astronaut, and persistent (not one noisy reading)
    "pattern"   - a multi-day pattern (sleep debt, low mood, missed exercise, radiation)
    "trend"     - currently fine but projected to cross a limit soon
    "missing"   - required data absent, so we refuse to call it GREEN
`source` keys into thresholds.SOURCES so every alert can show where its rule
comes from.
"""

import math

import numpy as np
import pandas as pd

from . import thresholds as T

SEVERITY_ORDER = {"GREEN": 0, "UNKNOWN": 1, "YELLOW": 2, "RED": 3}

# How to collapse several readings on one day into one daily value.
_DAILY_AGG = {"exercise_minutes": "max", "radiation_msv": "max"}


def _num(value):
    """Return a float, or None for missing / non-numeric / NaN values."""
    if value is None:
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(f) else f


def _fmt(v):
    """Compact number formatting: 117.14 -> '117.1', 98.0 -> '98'."""
    return f"{v:.1f}".rstrip("0").rstrip(".")


def _finding(metric, severity, kind, message, value=None, source="team", **extra):
    return {
        "metric": metric,
        "label": T.METRIC_LABELS.get(metric, metric),
        "severity": severity,
        "kind": kind,
        "message": message,
        "value": value,
        "unit": T.METRIC_UNITS.get(metric, ""),
        "source": source,
        "source_text": T.SOURCES.get(source, source),
        **extra,
    }


def daily(series: pd.DataFrame | None, metric: str) -> pd.Series:
    """One value per calendar day (UTC), oldest first. Empty if unavailable."""
    if series is None or metric not in series.columns or "timestamp" not in series.columns:
        return pd.Series(dtype=float)
    t = pd.to_datetime(series["timestamp"], errors="coerce", utc=True)
    y = pd.to_numeric(series[metric], errors="coerce")
    df = pd.DataFrame({"day": t.dt.normalize(), "y": y}).dropna()
    if df.empty:
        return pd.Series(dtype=float)
    return df.groupby("day")["y"].agg(_DAILY_AGG.get(metric, "mean"))


# ---------------------------------------------------------------- absolute ---

def _absolute_checks(r: dict) -> list:
    out = []
    hr = _num(r.get("heart_rate"))
    if hr is not None:
        if hr > T.HR_RED_ABOVE:
            out.append(_finding("heart_rate", "RED", "absolute",
                                f"Heart rate {hr:.0f} BPM is above the {T.HR_RED_ABOVE} BPM tachycardia limit.",
                                hr, "team_doc", limit=T.HR_RED_ABOVE))
        elif hr < T.HR_RED_BELOW:
            out.append(_finding("heart_rate", "RED", "absolute",
                                f"Heart rate {hr:.0f} BPM is below the {T.HR_RED_BELOW} BPM bradycardia limit.",
                                hr, "team_doc", limit=T.HR_RED_BELOW))
        elif hr > T.HR_YELLOW_ABOVE:
            out.append(_finding("heart_rate", "YELLOW", "absolute",
                                f"Resting heart rate {hr:.0f} BPM is above {T.HR_YELLOW_ABOVE} BPM.",
                                hr, "team_doc", limit=T.HR_YELLOW_ABOVE))

    spo2 = _num(r.get("spo2"))
    if spo2 is not None:
        if spo2 < T.SPO2_RED_BELOW:
            out.append(_finding("spo2", "RED", "absolute",
                                f"SpO2 {spo2:.0f}% is below the {T.SPO2_RED_BELOW}% critical limit.",
                                spo2, "team_doc", limit=T.SPO2_RED_BELOW))
        elif spo2 < T.SPO2_YELLOW_BELOW:
            out.append(_finding("spo2", "YELLOW", "absolute",
                                f"SpO2 {spo2:.0f}% is below the {T.SPO2_YELLOW_BELOW}% normal cabin range.",
                                spo2, "team_doc", limit=T.SPO2_YELLOW_BELOW))

    temp = _num(r.get("temperature"))
    if temp is not None:
        if temp >= T.TEMP_RED_ABOVE:
            out.append(_finding("temperature", "RED", "absolute",
                                f"Core temperature {temp:.1f}°C is a high fever (≥{T.TEMP_RED_ABOVE}°C).",
                                temp, "high_fever"))
        elif temp < T.TEMP_RED_BELOW:
            out.append(_finding("temperature", "RED", "absolute",
                                f"Core temperature {temp:.1f}°C indicates hypothermia (<{T.TEMP_RED_BELOW}°C).",
                                temp, "hypothermia"))
        elif temp > T.TEMP_YELLOW_ABOVE:
            out.append(_finding("temperature", "YELLOW", "absolute",
                                f"Core temperature {temp:.1f}°C suggests a febrile response (>{T.TEMP_YELLOW_ABOVE}°C).",
                                temp, "fever", limit=T.TEMP_YELLOW_ABOVE))
        elif temp < T.TEMP_YELLOW_BELOW:
            out.append(_finding("temperature", "YELLOW", "absolute",
                                f"Core temperature {temp:.1f}°C is low (<{T.TEMP_YELLOW_BELOW}°C).",
                                temp, "team_doc", limit=T.TEMP_YELLOW_BELOW))

    sys_ = _num(r.get("blood_pressure_sys"))
    dia = _num(r.get("blood_pressure_dia"))
    if sys_ is not None or dia is not None:
        bp_txt = (f"{sys_:.0f}/{dia:.0f}" if sys_ is not None and dia is not None
                  else f"{(sys_ if sys_ is not None else dia):.0f}")
        if (sys_ is not None and sys_ > T.BP_SYS_RED_ABOVE) or (dia is not None and dia > T.BP_DIA_RED_ABOVE):
            out.append(_finding("blood_pressure_sys", "RED", "absolute",
                                f"Blood pressure {bp_txt} mmHg is in the hypertensive-crisis range.",
                                sys_, "acc_aha_2017"))
        elif (sys_ is not None and sys_ >= T.BP_SYS_YELLOW_ABOVE) or (dia is not None and dia >= T.BP_DIA_YELLOW_ABOVE):
            out.append(_finding("blood_pressure_sys", "YELLOW", "absolute",
                                f"Blood pressure {bp_txt} mmHg is in the stage-2 hypertension range.",
                                sys_, "acc_aha_2017"))
        elif sys_ is not None and sys_ < T.BP_SYS_YELLOW_BELOW:
            out.append(_finding("blood_pressure_sys", "YELLOW", "absolute",
                                f"Systolic pressure {sys_:.0f} mmHg is low — orthostatic intolerance risk.",
                                sys_, "aha_low_bp"))

    sleep = _num(r.get("sleep_hours"))
    if sleep is not None and sleep < T.SLEEP_YELLOW_BELOW:
        out.append(_finding("sleep_hours", "YELLOW", "absolute",
                            f"Only {sleep:.1f} h of sleep — below the {T.SLEEP_YELLOW_BELOW:.0f} h fatigue threshold.",
                            sleep, "team_doc", limit=T.SLEEP_YELLOW_BELOW))

    fatigue = _num(r.get("fatigue"))
    if fatigue is not None:
        if fatigue >= T.FATIGUE_RED_AT:
            out.append(_finding("fatigue", "RED", "absolute",
                                "Fatigue 7/7 — completely exhausted, unable to function effectively. "
                                "Not fit for safety-critical tasks.", fatigue, "samn_perelli"))
        elif fatigue >= T.FATIGUE_YELLOW_AT:
            out.append(_finding("fatigue", "YELLOW", "absolute",
                                f"Fatigue {fatigue:.0f}/7 — extremely tired, very difficult to concentrate.",
                                fatigue, "samn_perelli"))

    stress = r.get("stress_level")
    if isinstance(stress, str) and stress.strip().lower() == "high":
        out.append(_finding("stress_level", "YELLOW", "absolute", "Astronaut reported HIGH stress.",
                            "High", "nasa_hrp_bmed"))

    dose = _num(r.get("radiation_msv"))
    if dose is not None and dose >= T.RADIATION_EVENT_LIMIT_MSV:
        out.append(_finding("radiation_msv", "RED", "absolute",
                            f"Daily radiation dose {_fmt(dose)} mSv reached the {T.RADIATION_EVENT_LIMIT_MSV} mSv "
                            "solar-particle-event limit. Shelter now.", dose, "nasa_std_3001"))
    return out


# ---------------------------------------------------------------- baseline ---

def _baseline_checks(r: dict, baseline: dict, series: pd.DataFrame | None) -> list:
    """Personal-baseline anomalies that are strong or persistent.

    A reading is flagged when it is very unusual (|z| > BASELINE_Z_STRONG) or
    moderately unusual (|z| > BASELINE_Z_YELLOW) on at least BASELINE_PERSIST
    of the last 3 days. This stops one noisy measurement from raising an alert.
    """
    out = []
    for metric, b in baseline.items():
        if not b.get("reliable"):
            continue
        value = _num(r.get(metric))
        if value is None:
            continue
        direction = T.BASELINE_BAD_DIRECTION.get(metric, 0)   # 0 = both directions matter

        def bad_z(v):
            z = (v - b["mean"]) / b["std"]
            return z * direction if direction else abs(z)

        z_now = bad_z(value)
        if z_now <= T.BASELINE_Z_YELLOW:
            continue
        if metric == "heart_rate" and value <= b["mean"] * (1 + T.HR_BASELINE_PCT):
            continue  # team doc: HR must also be >15 % above personal baseline

        if z_now <= T.BASELINE_Z_STRONG:
            # Moderate deviation: require it on 2 of the last 3 days (today counts once).
            days = daily(series, metric).tail(3).copy()
            if len(days) > 0:
                days.iloc[-1] = value
            if sum(bad_z(v) > T.BASELINE_Z_YELLOW for v in days) < T.BASELINE_PERSIST:
                continue

        signed_z = (value - b["mean"]) / b["std"]
        word = "high" if signed_z > 0 else "low"
        unit = T.METRIC_UNITS.get(metric, "")
        if metric == "heart_rate":
            msg = (f"Heart rate {value:.0f} BPM is {(value / b['mean'] - 1) * 100:.0f}% above this "
                   f"astronaut's normal ({b['mean']:.0f} BPM).")
        else:
            sep = "" if unit.startswith(("/", "%")) else " "
            msg = (f"{T.METRIC_LABELS[metric]} {_fmt(value)}{sep}{unit} is unusually {word} for this astronaut "
                   f"(normal {_fmt(b['mean'])}).")
        out.append(_finding(metric, "YELLOW", "baseline", msg, value, "personal",
                            baseline_mean=b["mean"], z_score=round(signed_z, 2)))
    return out


# ----------------------------------------------------------------- pattern ---

def _pattern_checks(series: pd.DataFrame | None, context: dict) -> list:
    out = []

    sleep = daily(series, "sleep_hours").tail(T.SLEEP_DEBT_DAYS)
    if len(sleep) == T.SLEEP_DEBT_DAYS and sleep.mean() < T.SLEEP_DEBT_AVG_BELOW:
        out.append(_finding("sleep_hours", "YELLOW", "pattern",
                            f"Sleep debt: averaged {sleep.mean():.1f} h over the last {T.SLEEP_DEBT_DAYS} days "
                            f"(below {T.SLEEP_DEBT_AVG_BELOW:.0f} h). Performance deficits accumulate.",
                            round(float(sleep.mean()), 2), "van_dongen_2003"))

    mood = daily(series, "mood").tail(T.MOOD_LOW_DAYS)
    if len(mood) == T.MOOD_LOW_DAYS and (mood <= T.MOOD_LOW_AT_OR_BELOW).all():
        out.append(_finding("mood", "YELLOW", "pattern",
                            f"Low mood (≤{T.MOOD_LOW_AT_OR_BELOW}/5) reported for {T.MOOD_LOW_DAYS} days in a row.",
                            float(mood.iloc[-1]), "nasa_hrp_bmed"))

    ex = daily(series, "exercise_minutes").tail(T.EXERCISE_DAYS)
    if len(ex) == T.EXERCISE_DAYS and ex.mean() < T.EXERCISE_AVG_BELOW:
        out.append(_finding("exercise_minutes", "YELLOW", "pattern",
                            f"Exercise averaged {ex.mean():.0f} min/day over {T.EXERCISE_DAYS} days — under half of the "
                            f"~{T.EXERCISE_SCHEDULED_MIN} min/day that protects bone and muscle.",
                            round(float(ex.mean()), 1), "nasa_exercise"))

    rad = daily(series, "radiation_msv")
    prior = _num((context or {}).get("prior_career_dose_msv")) or 0.0
    career = prior + float(rad.sum())
    limit = T.RADIATION_CAREER_LIMIT_MSV
    if career >= limit:
        out.append(_finding("radiation_msv", "RED", "pattern",
                            f"Career radiation dose {_fmt(career)} mSv has reached the {limit} mSv NASA limit.",
                            round(career, 1), "nasa_std_3001"))
    elif career >= limit * T.RADIATION_CAREER_YELLOW_FRAC:
        out.append(_finding("radiation_msv", "YELLOW", "pattern",
                            f"Career radiation dose {_fmt(career)} mSv is {career / limit:.0%} of the {limit} mSv NASA limit.",
                            round(career, 1), "nasa_std_3001"))
    return out


# ------------------------------------------------------------- environment ---

def _environment_checks(context: dict) -> list:
    """Live space weather applies to every crew member, whatever their vitals."""
    sw = (context or {}).get("space_weather")
    if not sw or sw.get("s_level") is None:
        return []
    level, pfu = sw["s_level"], sw.get("proton_10mev_pfu")
    flux = f"≥10 MeV proton flux {pfu:,.0f} pfu ({sw.get('source_label', 'NOAA')})" if pfu is not None else "NOAA"
    if level >= T.SOLAR_STORM_RED_S:
        return [_finding("space_weather", "RED", "environment",
                         f"Severe solar radiation storm (S{level}) in progress: {flux}.", level, "noaa_s_scale")]
    if level >= T.SOLAR_STORM_YELLOW_S:
        return [_finding("space_weather", "YELLOW", "environment",
                         f"Strong solar radiation storm (S{level}) in progress: {flux}.", level, "noaa_s_scale")]
    return []


# ------------------------------------------------------------------- trend ---

# (metric, direction that is bad, limit to project against, source of limit)
_TREND_RULES = (
    ("heart_rate", +1, T.HR_YELLOW_ABOVE),
    ("spo2", -1, T.SPO2_YELLOW_BELOW),
    ("sleep_hours", -1, T.SLEEP_YELLOW_BELOW),
    ("blood_pressure_sys", +1, T.BP_SYS_YELLOW_ABOVE),
    ("temperature", +1, T.TEMP_YELLOW_ABOVE),
    ("fatigue", +1, T.FATIGUE_YELLOW_AT),
)


def _trend_checks(series: pd.DataFrame | None, already_flagged: set) -> list:
    """Fit a line to recent DAILY averages and project TREND_HORIZON_DAYS ahead.

    Averaging per day first matters: two readings an hour apart would
    otherwise turn a small change into a huge per-day slope.
    """
    out = []
    for metric, bad_dir, limit in _TREND_RULES:
        if metric in already_flagged:
            continue
        d = daily(series, metric).tail(T.TREND_WINDOW)
        if len(d) < T.TREND_MIN_READINGS:
            continue
        x = ((d.index - d.index[0]).total_seconds() / 86400.0).to_numpy()
        yv = d.to_numpy()
        slope, intercept = np.polyfit(x, yv, 1)
        if slope * bad_dir <= 0:
            continue
        projected = slope * (x[-1] + T.TREND_HORIZON_DAYS) + intercept
        if (projected > limit) if bad_dir > 0 else (projected < limit):
            unit = T.METRIC_UNITS[metric]
            out.append(_finding(metric, "YELLOW", "trend",
                                f"{T.METRIC_LABELS[metric]} is trending {'up' if bad_dir > 0 else 'down'} "
                                f"({slope:+.2f} {unit}/day) and is projected to reach {projected:.1f} {unit} "
                                f"within {T.TREND_HORIZON_DAYS} days (limit {limit} {unit}).",
                                float(yv[-1]), "trend", slope_per_day=round(float(slope), 3),
                                projected=round(float(projected), 2), limit=limit))
    return out


# ------------------------------------------------------------------ public ---

def career_dose(series: pd.DataFrame | None, context: dict | None) -> float:
    prior = _num((context or {}).get("prior_career_dose_msv")) or 0.0
    return round(prior + float(daily(series, "radiation_msv").sum()), 2)


def detect_risk(current: dict, baseline: dict | None = None,
                series: pd.DataFrame | None = None, context: dict | None = None) -> dict:
    """Evaluate one reading.

    current  - the reading being evaluated (dict of metric -> value)
    baseline - output of calculate_baseline() over PRIOR readings
    series   - prior readings + current (needed for multi-day rules and trends)
    context  - astronaut facts, e.g. {"prior_career_dose_msv": 120}

    Returns {"risk_level", "findings", "alerts"}.
    """
    baseline = baseline or {}
    findings = []

    missing = [m for m in T.REQUIRED_VITALS if _num(current.get(m)) is None]
    for m in missing:
        findings.append(_finding(m, "UNKNOWN", "missing",
                                 f"No valid {T.METRIC_LABELS[m].lower()} reading — status cannot be confirmed."))

    findings += _absolute_checks(current)
    findings += _environment_checks(context or {})
    seen = {f["metric"] for f in findings}
    findings += [f for f in _pattern_checks(series, context or {}) if f["metric"] not in seen]
    seen = {f["metric"] for f in findings}
    findings += [f for f in _baseline_checks(current, baseline, series) if f["metric"] not in seen]
    seen = {f["metric"] for f in findings}
    findings += _trend_checks(series, seen)

    level = "GREEN"
    for f in findings:
        if SEVERITY_ORDER[f["severity"]] > SEVERITY_ORDER[level]:
            level = f["severity"]
    if missing and level == "GREEN":
        level = "UNKNOWN"

    # Most severe first; within a tier: missing data, measured limits, multi-day
    # patterns, personal drift, predictions; self-reported stress last.
    kind_rank = {"missing": 0, "environment": 1, "absolute": 1, "pattern": 2, "baseline": 3, "trend": 4}
    findings.sort(key=lambda f: (-SEVERITY_ORDER[f["severity"]], f["metric"] == "stress_level",
                                 kind_rank.get(f["kind"], 9)))
    return {"risk_level": level, "findings": findings, "alerts": [f["message"] for f in findings]}
