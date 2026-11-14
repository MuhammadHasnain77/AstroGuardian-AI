import math

import pandas as pd
import pytest

from ai.baseline import calculate_baseline
from ai.health_monitor import evaluate
from ai.recommendations import get_recommendations
from ai.risk_detection import detect_risk


def _history(n=10, hr=70, spo2=98, sleep=7.0, start="2026-11-01 08:00"):
    ts = pd.date_range(start, periods=n, freq="D")
    return pd.DataFrame({
        "timestamp": ts, "heart_rate": [hr + (i % 3) - 1 for i in range(n)],
        "spo2": [spo2] * n, "sleep_hours": [sleep + 0.1 * (i % 2) for i in range(n)],
        "temperature": [36.7] * n, "blood_pressure_sys": [120] * n, "blood_pressure_dia": [80] * n,
    })


# ---------------------------------------------------------------- baseline ---

def test_baseline_mean_and_reliability():
    b = calculate_baseline(_history(5))
    assert b["heart_rate"]["mean"] == pytest.approx(70.0, abs=0.5)
    assert b["heart_rate"]["reliable"] is True


def test_baseline_single_reading_has_no_nan_and_is_unreliable():
    # Regression: the original code produced std=NaN, which silently disabled HR checks.
    b = calculate_baseline(_history(1))
    assert not math.isnan(b["heart_rate"]["std"])
    assert b["heart_rate"]["reliable"] is False


def test_baseline_ignores_missing_values():
    h = _history(5)
    h.loc[2, "heart_rate"] = None
    assert calculate_baseline(h)["heart_rate"]["n"] == 4


# ---------------------------------------------------------- absolute rules ---

@pytest.mark.parametrize("hr,expected", [
    (70, "GREEN"), (112, "YELLOW"), (131, "RED"), (44, "RED"),
])
def test_heart_rate_tiers_match_research_doc(hr, expected):
    assert detect_risk({"heart_rate": hr, "spo2": 98})["risk_level"] == expected


@pytest.mark.parametrize("spo2,expected", [(98, "GREEN"), (95, "GREEN"), (94, "YELLOW"), (92, "YELLOW"), (91, "RED")])
def test_spo2_tiers(spo2, expected):
    assert detect_risk({"heart_rate": 70, "spo2": spo2})["risk_level"] == expected


def test_fever_and_hypertension_are_detected():
    # Regression: original engine returned GREEN for both.
    assert detect_risk({"heart_rate": 70, "spo2": 98, "temperature": 39.5})["risk_level"] == "RED"
    assert detect_risk({"heart_rate": 70, "spo2": 98, "blood_pressure_sys": 190,
                        "blood_pressure_dia": 125})["risk_level"] == "RED"


def test_sleep_and_stress():
    assert detect_risk({"heart_rate": 70, "spo2": 98, "sleep_hours": 4.5})["risk_level"] == "YELLOW"
    assert detect_risk({"heart_rate": 70, "spo2": 98, "sleep_hours": 2})["risk_level"] == "YELLOW"
    assert detect_risk({"heart_rate": 70, "spo2": 98, "stress_level": "High"})["risk_level"] == "YELLOW"


# ------------------------------------------------------------- fail-safes ---

def test_missing_required_vitals_is_unknown_not_green():
    # Regression: original engine substituted healthy defaults and returned GREEN.
    assert detect_risk({})["risk_level"] == "UNKNOWN"
    assert detect_risk({"heart_rate": 70})["risk_level"] == "UNKNOWN"
    assert detect_risk({"heart_rate": float("nan"), "spo2": 98})["risk_level"] == "UNKNOWN"


def test_missing_vital_does_not_hide_a_confirmed_red():
    assert detect_risk({"spo2": 88})["risk_level"] == "RED"


def test_stale_data_downgrades_green_to_unknown():
    h = _history(10)
    now = h["timestamp"].max() + pd.Timedelta(hours=72)
    r = evaluate(h, stale_after_hours=36, now=now)
    assert r["risk_level"] == "UNKNOWN"
    assert any("cannot be confirmed" in f["message"] for f in r["findings"])


def test_fresh_data_is_not_stale():
    h = _history(10)
    r = evaluate(h, stale_after_hours=36, now=h["timestamp"].max() + pd.Timedelta(hours=1))
    assert r["risk_level"] == "GREEN"


# ---------------------------------------------------- personal baseline ---

def test_personal_baseline_flags_drift_below_absolute_limit():
    # 95 BPM is fine by absolute limits but ~35% above this astronaut's 70.
    b = calculate_baseline(_history(10))
    r = detect_risk({"heart_rate": 95, "spo2": 98}, b)
    assert r["risk_level"] == "YELLOW"
    assert r["findings"][0]["kind"] == "baseline"


def test_same_value_is_normal_for_a_different_astronaut():
    b = calculate_baseline(_history(10, hr=92))
    assert detect_risk({"heart_rate": 95, "spo2": 98}, b)["risk_level"] == "GREEN"


def test_unreliable_baseline_is_ignored():
    b = calculate_baseline(_history(2))
    assert detect_risk({"heart_rate": 95, "spo2": 98}, b)["risk_level"] == "GREEN"


def test_current_reading_is_excluded_from_baseline():
    h = _history(10)
    spike = h.iloc[[-1]].copy()
    spike["timestamp"] = h["timestamp"].max() + pd.Timedelta(days=1)
    spike["heart_rate"] = 100
    r = evaluate(pd.concat([h, spike]))
    assert r["baseline"]["heart_rate"]["mean"] == pytest.approx(70, abs=1)
    assert r["risk_level"] == "YELLOW"


def test_no_duplicate_baseline_finding_when_absolute_already_fired():
    b = calculate_baseline(_history(10))
    r = detect_risk({"heart_rate": 135, "spo2": 98}, b)
    assert [f["kind"] for f in r["findings"] if f["metric"] == "heart_rate"] == ["absolute"]


# ------------------------------------------------------------ prediction ---

def test_trend_predicts_sleep_decline_before_threshold():
    h = _history(7)
    # Every night above 5 h and 3-day average above 6 h (no sleep-debt flag), but falling fast.
    h["sleep_hours"] = [8.4, 7.9, 7.4, 6.9, 6.5, 6.1, 6.0]
    r = evaluate(h)
    trend = [f for f in r["findings"] if f["kind"] == "trend"]
    assert trend and trend[0]["metric"] == "sleep_hours"
    assert r["risk_level"] == "YELLOW"


def test_improving_trend_is_not_flagged():
    h = _history(7)
    h["sleep_hours"] = [6.0, 6.1, 6.5, 6.9, 7.4, 7.9, 8.4]
    assert not [f for f in evaluate(h)["findings"] if f["kind"] == "trend"]


# --------------------------------------------------------- recommendations ---

def test_recommendations_are_specific_and_deduplicated():
    r = detect_risk({"heart_rate": 70, "spo2": 90, "sleep_hours": 4})
    rec = get_recommendations(r["risk_level"], r["findings"])
    assert rec["summary"].startswith("CRITICAL")
    assert any("CMO" in a for a in rec["actions"])
    assert len(rec["actions"]) == len(set(rec["actions"]))


def test_unknown_status_tells_crew_to_check_sensors():
    rec = get_recommendations("UNKNOWN", detect_risk({})["findings"])
    assert any("sensor" in a.lower() for a in rec["actions"])


def test_same_day_readings_do_not_create_false_trend():
    # Regression: a reading 1 h after the morning one with +5 mmHg used to be
    # extrapolated as ~+120 mmHg/day.
    h = _history(10)
    extra = h.iloc[[-1]].copy()
    extra["timestamp"] = h["timestamp"].max() + pd.Timedelta(hours=1)
    extra["blood_pressure_sys"] = 125
    r = evaluate(pd.concat([h, extra]))
    assert not [f for f in r["findings"] if f["kind"] == "trend"]


# --------------------------------------------- persistence (alert noise) ---

def _with_sys(values):
    h = _history(len(values))
    h["blood_pressure_sys"] = values
    return h


def test_moderate_single_day_deviation_is_not_flagged():
    # Baseline 120 (std floor 5); 132 mmHg is z≈2.4 — moderate — on ONE day only -> noise.
    r = evaluate(_with_sys([120] * 10 + [132]))
    assert not [f for f in r["findings"] if f["metric"] == "blood_pressure_sys"]


def test_moderate_deviation_on_two_days_is_flagged():
    r = evaluate(_with_sys([120] * 9 + [132, 132]))
    assert [f for f in r["findings"] if f["kind"] == "baseline" and f["metric"] == "blood_pressure_sys"]


def test_strong_single_deviation_is_flagged_immediately():
    r = evaluate(_with_sys([120] * 10 + [138]))     # z≈3.6, below the 140 absolute limit
    assert [f for f in r["findings"] if f["kind"] == "baseline" and f["metric"] == "blood_pressure_sys"]


# ------------------------------------------- behavioural & countermeasures ---

def test_fatigue_tiers_follow_samn_perelli():
    assert detect_risk({"heart_rate": 70, "spo2": 98, "fatigue": 5})["risk_level"] == "GREEN"
    assert detect_risk({"heart_rate": 70, "spo2": 98, "fatigue": 6})["risk_level"] == "YELLOW"
    assert detect_risk({"heart_rate": 70, "spo2": 98, "fatigue": 7})["risk_level"] == "RED"


def test_sustained_low_mood_flagged_but_one_bad_day_is_not():
    h = _history(10)
    h["mood"] = [4, 4, 4, 4, 4, 4, 4, 4, 4, 2]
    assert not [f for f in evaluate(h)["findings"] if f["kind"] == "pattern" and f["metric"] == "mood"]
    h["mood"] = [4, 4, 4, 4, 4, 4, 4, 2, 2, 1]
    assert [f for f in evaluate(h)["findings"] if f["kind"] == "pattern" and f["metric"] == "mood"]


def test_sleep_debt_pattern():
    h = _history(10)
    h["sleep_hours"] = [7.2] * 7 + [5.6, 5.8, 5.5]       # each night above 5 h, average < 6 h
    f = [f for f in evaluate(h)["findings"] if f["kind"] == "pattern" and f["metric"] == "sleep_hours"]
    assert f and f[0]["source"] == "van_dongen_2003"


def test_missed_exercise_pattern():
    h = _history(10)
    h["exercise_minutes"] = [150] * 7 + [40, 60, 30]
    assert [f for f in evaluate(h)["findings"] if f["metric"] == "exercise_minutes"]


def test_radiation_career_limit():
    h = _history(10)
    h["radiation_msv"] = [0.5] * 10
    assert evaluate(h, context={"prior_career_dose_msv": 100})["risk_level"] == "GREEN"
    assert evaluate(h, context={"prior_career_dose_msv": 480})["risk_level"] == "YELLOW"   # 485 >= 80 %
    assert evaluate(h, context={"prior_career_dose_msv": 600})["risk_level"] == "RED"
    assert evaluate(h, context={"prior_career_dose_msv": 100})["radiation"]["career_dose_msv"] == 105


def test_solar_particle_event_is_red():
    assert detect_risk({"heart_rate": 70, "spo2": 98, "radiation_msv": 250})["risk_level"] == "RED"


# --------------------------------------------------------------- sources ---

def test_every_finding_cites_a_source():
    from ai.thresholds import SOURCES
    h = _history(10)
    h["sleep_hours"] = [7.2] * 7 + [5.6, 5.8, 5.5]
    cur = {"heart_rate": 135, "spo2": 91, "temperature": 39.6, "blood_pressure_sys": 185,
           "fatigue": 7, "stress_level": "High"}
    r = detect_risk(cur, calculate_baseline(h), h)
    assert r["findings"] and all(f["source"] in SOURCES for f in r["findings"])


def test_bp_and_temperature_use_cited_limits():
    assert detect_risk({"heart_rate": 70, "spo2": 98, "blood_pressure_sys": 180})["risk_level"] == "YELLOW"  # crisis is > 180
    assert detect_risk({"heart_rate": 70, "spo2": 98, "blood_pressure_sys": 181})["risk_level"] == "RED"
    assert detect_risk({"heart_rate": 70, "spo2": 98, "temperature": 39.3})["risk_level"] == "YELLOW"
    assert detect_risk({"heart_rate": 70, "spo2": 98, "temperature": 39.4})["risk_level"] == "RED"
    assert detect_risk({"heart_rate": 70, "spo2": 98, "temperature": 34.9})["risk_level"] == "RED"
