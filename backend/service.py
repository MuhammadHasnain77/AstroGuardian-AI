"""Evaluation + alert lifecycle, shared by the API and the seed script."""

import os

from ai.health_monitor import evaluate
from ai.risk_detection import SEVERITY_ORDER

from . import db


def stale_hours() -> float | None:
    v = float(os.getenv("STALE_DATA_HOURS", "36"))
    return v or None


def evaluate_astronaut(aid: str) -> dict:
    a = db.astronaut(aid) or {}
    from . import space_weather
    return evaluate(db.readings_df(aid), stale_after_hours=stale_hours(),
                    context={"prior_career_dose_msv": a.get("prior_career_dose_msv", 0),
                             "space_weather": space_weather.engine_context()},
                    carry_forward_hours=float(os.getenv("SENSOR_CARRY_HOURS", "12")))


def _metrics(findings: list) -> list:
    return sorted({f["metric"] for f in findings})


def record_evaluation(aid: str, ev: dict) -> dict:
    """Keep ONE open alert per astronaut instead of a new row per reading.

    - GREEN                         -> resolve the open alert (if any)
    - no open alert                 -> open a new one
    - tier escalates, or a metric
      appears that wasn't flagged   -> close the old one as 'superseded', open a new one
                                       (new problems must be seen and acknowledged again)
    - otherwise (same / fewer issues, or de-escalation)
                                    -> update the open alert in place, count the occurrence
    Returns {"alert_id", "action"} where action is opened|updated|resolved|none.
    """
    level, findings = ev["risk_level"], ev["findings"]
    current = db.open_alert(aid)

    if level == "GREEN":
        if current:
            db.close_alert(current["id"], "resolved")
            return {"alert_id": current["id"], "action": "resolved"}
        return {"alert_id": None, "action": "none"}

    metrics = _metrics(findings)
    if current is None:
        return {"alert_id": db.create_alert(aid, level, findings, metrics), "action": "opened"}

    escalated = SEVERITY_ORDER[level] > SEVERITY_ORDER[current["risk_level"]]
    new_metric = bool(set(metrics) - set(current["metrics"]))
    if escalated or new_metric:
        db.close_alert(current["id"], "superseded")
        return {"alert_id": db.create_alert(aid, level, findings, metrics), "action": "opened"}

    changed = level != current["risk_level"] or metrics != current["metrics"]
    db.touch_alert(current["id"], level, findings, metrics, changed)
    return {"alert_id": current["id"], "action": "updated"}
