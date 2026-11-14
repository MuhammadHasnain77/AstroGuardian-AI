"""Deterministic action guidance mapped from findings.

Guidance follows the categories in research/space_health_risks.md and NASA
HRP risk areas. It is written for demonstration and must be validated by a
flight surgeon before operational use.
"""

SUMMARY = {
    "GREEN": "All indicators are within your personal baseline and safety limits. Continue scheduled operations.",
    "YELLOW": "Caution: one or more indicators have drifted from your normal. Follow the actions below and re-check.",
    "RED": "CRITICAL: a safety limit has been crossed. Stop non-essential tasks and notify the Crew Medical Officer now.",
    "UNKNOWN": "Status cannot be confirmed: required sensor data is missing. Check sensors and take a new reading.",
}

# (metric, severity) -> actions. "*" severity is the fallback for that metric.
_ACTIONS = {
    ("heart_rate", "RED"): [
        "Notify the Crew Medical Officer (CMO) immediately.",
        "Stop exertion and rest in a restrained, stable posture.",
        "Re-measure heart rate in 5 minutes and run an onboard ECG if available.",
    ],
    ("heart_rate", "*"): [
        "Rest for 15 minutes, hydrate, and re-measure resting heart rate.",
        "Review recent exercise load and countermeasure schedule for cardiovascular deconditioning.",
    ],
    ("spo2", "RED"): [
        "Notify the CMO immediately and begin the low-oxygen emergency checklist.",
        "Check cabin O2 / CO2 readings with the environmental control system.",
        "Re-seat the pulse oximeter and re-measure to rule out sensor error.",
    ],
    ("spo2", "*"): [
        "Re-seat the pulse oximeter and re-measure in 10 minutes.",
        "Check cabin CO2 levels and local ventilation (CO2 pockets form easily in microgravity).",
    ],
    ("temperature", "RED"): [
        "Notify the CMO immediately; start the onboard fever / hypothermia protocol.",
    ],
    ("temperature", "*"): [
        "Re-measure temperature in 30 minutes and log any symptoms (chills, fatigue, sore throat).",
        "Check local thermal environment and clothing layers.",
    ],
    ("blood_pressure_sys", "RED"): [
        "Notify the CMO immediately and re-measure blood pressure after 5 minutes of rest.",
    ],
    ("blood_pressure_sys", "*"): [
        "Re-measure blood pressure after 5 minutes of rest; avoid rapid posture changes.",
        "Increase fluid intake per fluid-shift countermeasure guidance.",
    ],
    ("blood_pressure_dia", "*"): [
        "Re-measure blood pressure after 5 minutes of rest.",
    ],
    ("sleep_hours", "*"): [
        "Protect your next sleep period: dim lights, use earplugs / eye mask, avoid screens 1 h before.",
        "Avoid scheduling safety-critical tasks during your next shift if fatigue persists.",
    ],
    ("fatigue", "RED"): [
        "Inform the CMO: you are not fit for safety-critical tasks (EVA, robotics, docking) until rested.",
        "Schedule a protected sleep period as soon as possible.",
    ],
    ("fatigue", "*"): [
        "Avoid safety-critical tasks this shift; ask the CMO to review your schedule.",
        "Take a short nap (20–30 min) if the timeline allows.",
    ],
    ("mood", "*"): [
        "Book a private psychological support conference at the next comms window.",
        "Schedule personal time and contact with family; tell the CMO if mood stays low.",
    ],
    ("exercise_minutes", "*"): [
        "Restore the daily exercise block (ARED resistance + treadmill/cycle) to protect bone and muscle.",
        "Ask mission control to protect exercise time in tomorrow's timeline.",
    ],
    ("radiation_msv", "RED"): [
        "Move to the designated radiation shelter area now and notify the CMO and mission control.",
    ],
    ("radiation_msv", "*"): [
        "Notify the CMO; ground radiation specialists should review upcoming EVA plans.",
    ],
    ("space_weather", "RED"): [
        "Go to the designated radiation shelter area now and stay there until mission control gives the all-clear.",
        "Abort or postpone any EVA in progress or planned.",
    ],
    ("space_weather", "*"): [
        "Postpone EVAs and stay in the more shielded modules until the storm subsides.",
        "Review the shelter plan in case the storm escalates to S4.",
    ],
    ("stress_level", "*"): [
        "Take a 10-minute break; use a guided breathing or relaxation exercise.",
        "Consider a private psychological support conference at the next comms window.",
    ],
}

_KIND_PREFIX = {"trend": "Early warning — "}


def _actions_for(metric, severity):
    return _ACTIONS.get((metric, severity)) or _ACTIONS.get((metric, "*"), [])


def get_recommendations(risk_level: str, findings: list) -> dict:
    """Return {"summary", "actions"}: one summary line plus de-duplicated steps."""
    actions = []
    if risk_level == "UNKNOWN" or any(f["kind"] == "missing" for f in findings):
        actions.append("Check that wearable sensors are attached and powered, then take a new reading.")
    for f in findings:
        if f["kind"] == "missing":
            f["actions"] = ["Check that wearable sensors are attached and powered, then take a new reading."]
            continue
        steps = _actions_for(f["metric"], f["severity"])
        # RED: every step matters. Otherwise only the most important step per
        # finding, so a YELLOW with many findings stays a short, usable list.
        chosen = steps if f["severity"] == "RED" else steps[:1]
        # Each finding carries its own steps, so the UI can show the problem
        # and what to do about it together.
        f["actions"] = list(chosen)
        for a in chosen:
            text = _KIND_PREFIX.get(f["kind"], "") + a
            if text not in actions:
                actions.append(text)
    if risk_level in ("YELLOW", "RED"):
        actions.append("Log symptoms in the crew portal; data will sync to ground flight surgeons at the next comms window.")
    return {"summary": SUMMARY[risk_level], "actions": actions}


def get_nasa_recommendation(risk_level: str, alerts: list | None = None) -> str:
    """Backwards-compatible plain-text summary."""
    return SUMMARY.get(risk_level, SUMMARY["UNKNOWN"])
