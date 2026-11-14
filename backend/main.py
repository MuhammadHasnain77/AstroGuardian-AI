"""AstroGuardian-AI API server.

Run from the repository root:
    uvicorn backend.main:app --reload
On Vercel, api/index.py imports `app` from here.
"""

import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

from ai import llm_explainer  # noqa: E402  (needs env loaded first)
from ai.risk_detection import daily  # noqa: E402

from . import auth, db  # noqa: E402
from .auth import User, current_user, require, require_view  # noqa: E402
from .service import evaluate_astronaut, record_evaluation, stale_hours  # noqa: E402

app = FastAPI(title="AstroGuardian-AI", version="2.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

_last_fresh_check = 0.0


@app.middleware("http")
async def prepare_storage(request: Request, call_next):
    """Lazy init (works on serverless, where startup hooks may not run) + demo freshness."""
    global _last_fresh_check
    if request.url.path.startswith("/api/") and request.url.path != "/api/health":
        db.ensure_ready()
        if os.getenv("DEMO_KEEP_FRESH", "true").lower() in ("1", "true", "yes") \
                and time.time() - _last_fresh_check > 600:
            _last_fresh_check = time.time()
            db.keep_demo_fresh()
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


# ------------------------------------------------------------------ models ---

class UnlockIn(BaseModel):
    password: str = Field(..., max_length=100)


class RoleIn(BaseModel):
    role: Literal["astronaut", "cmo", "ground"]
    astronaut_id: str | None = None


class ReadingIn(BaseModel):
    heart_rate: float | None = Field(None, ge=20, le=250)
    spo2: float | None = Field(None, ge=50, le=100)
    blood_pressure_sys: float | None = Field(None, ge=50, le=260)
    blood_pressure_dia: float | None = Field(None, ge=30, le=160)
    temperature: float | None = Field(None, ge=30, le=43)
    sleep_hours: float | None = Field(None, ge=0, le=24)
    stress_level: Literal["Low", "Medium", "High"] | None = None
    fatigue: int | None = Field(None, ge=1, le=7)
    mood: int | None = Field(None, ge=1, le=5)
    exercise_minutes: float | None = Field(None, ge=0, le=600)
    radiation_msv: float | None = Field(None, ge=0, le=1000)


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., max_length=4000)


class ChatIn(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000)
    history: list[ChatTurn] = []


class NoteIn(BaseModel):
    note: str = Field(..., min_length=1, max_length=1000)


# ---------------------------------------------------------------- helpers ---

def _astronaut(aid: str, user: User) -> dict:
    a = db.astronaut(aid)
    if not a:
        raise HTTPException(404, f"Unknown astronaut '{aid}'")
    require_view(aid, user)
    return a


def _alert_for(alert_id: int, user: User) -> dict:
    a = db.alert(alert_id)
    if not a or not user.can_view(a["astronaut_id"]):
        raise HTTPException(404, "Alert not found")
    return a


# ------------------------------------------------------------------- auth ---

@app.get("/api/health")
def health():
    return {"status": "ok", "time": datetime.now(timezone.utc).isoformat(timespec="seconds")}


@app.get("/api/auth/state")
def auth_state(request: Request):
    s = auth.session(request)
    out = {"unlocked": bool(s.get("gate")), "user": None}
    if out["unlocked"]:
        out["roles"] = [{"id": k, "label": v["label"], "description": v["description"]} for k, v in auth.ROLES.items()]
        out["astronauts"] = [{"id": a["id"], "name": a["name"], "role": a["role"]} for a in db.astronauts()]
        if s.get("role") in auth.ROLES:
            out["user"] = auth.User(s["role"], s.get("astronaut_id")).as_dict()
    return out


@app.post("/api/auth/unlock")
def unlock(body: UnlockIn, request: Request, response: Response):
    client = request.client.host if request.client else "unknown"
    if not auth.check_password(body.password, client):
        raise HTTPException(401, "Incorrect password.")
    auth.set_cookie(response, request, {"gate": True})
    return {"unlocked": True}


@app.post("/api/auth/role")
def choose_role(body: RoleIn, request: Request, response: Response):
    if not auth.session(request).get("gate"):
        raise HTTPException(401, "Locked. Enter the access password.")
    aid = None
    if body.role == "astronaut":
        if not body.astronaut_id or not db.astronaut(body.astronaut_id):
            raise HTTPException(422, "Choose which astronaut you are.")
        aid = body.astronaut_id
    auth.set_cookie(response, request, {"gate": True, "role": body.role, "astronaut_id": aid})
    return auth.User(body.role, aid).as_dict()


@app.post("/api/auth/switch-role")
def switch_role(request: Request, response: Response):
    """Back to the role picker without re-entering the password."""
    if auth.session(request).get("gate"):
        auth.set_cookie(response, request, {"gate": True})
    return {"ok": True}


@app.post("/api/auth/logout")
def logout(response: Response):
    auth.clear_cookie(response)
    return {"ok": True}


# ------------------------------------------------------------------- data ---

@app.get("/api/config")
def get_config(user: User = Depends(current_user)):
    return {"llm": llm_explainer.public_config(), "stale_data_hours": stale_hours(),
            "unsynced_alerts": db.unsynced_count() if user.can("sync") else None,
            "database": "postgres" if db.is_postgres() else "sqlite"}


SERIES_METRICS = ("heart_rate", "spo2", "blood_pressure_sys", "temperature", "sleep_hours", "fatigue", "mood",
                  "exercise_minutes")


def _daily_series(aid: str, days: int = 14) -> dict:
    """Daily averages for the crew overview sparklines and trend small multiples."""
    df = db.readings_df(aid)
    out = {}
    for m in SERIES_METRICS:
        d = daily(df, m).tail(days)
        out[m] = [{"day": k.date().isoformat(), "value": round(float(v), 2)} for k, v in d.items()]
    return out


def _checked_in_today(aid: str) -> bool:
    df = db.readings_df(aid, limit=20)
    if df.empty:
        return False
    today = datetime.now(timezone.utc).date().isoformat()
    return bool(((df["source"] == "checkin") & df["timestamp"].astype(str).str.startswith(today)).any())


@app.get("/api/labs")
def get_labs(user: User = Depends(require("view_all_crew"))):
    """Real Inspiration4 crew blood tests (NASA OSDR OSD-575 / OSD-569), for the medical roles."""
    from . import labs
    return labs.load()


@app.get("/api/space-weather")
def get_space_weather(user: User = Depends(current_user)):
    """Live solar proton flux (NOAA) and recent SEP events (NASA DONKI), cached."""
    from . import space_weather
    return space_weather.snapshot()


@app.get("/api/crew")
def crew(user: User = Depends(current_user)):
    out = []
    for a in db.astronauts():
        if not user.can_view(a["id"]):
            continue
        ev = evaluate_astronaut(a["id"])
        alert = db.open_alert(a["id"])
        out.append({**a, "risk_level": ev["risk_level"], "summary": ev["summary"],
                    "top_finding": ev["findings"][0]["message"] if ev["findings"] else None,
                    "findings": [{k: f[k] for k in ("metric", "label", "severity", "kind", "message")} for f in ev["findings"]],
                    "finding_count": len(ev["findings"]),
                    "reading_timestamp": ev["reading_timestamp"], "current": ev["current"],
                    "baseline": ev["baseline"], "series": _daily_series(a["id"]),
                    "open_alert": alert})
    return out


@app.get("/api/astronauts/{aid}")
def astronaut_detail(aid: str, user: User = Depends(current_user)):
    a = _astronaut(aid, user)
    return {**a, "evaluation": evaluate_astronaut(aid), "open_alert": db.open_alert(aid),
            "checked_in_today": _checked_in_today(aid), "series": _daily_series(aid)}


@app.get("/api/astronauts/{aid}/readings")
def astronaut_readings(aid: str, limit: int = 30, user: User = Depends(current_user)):
    _astronaut(aid, user)
    df = db.readings_df(aid, limit=max(1, min(limit, 500)))
    return df.astype(object).where(df.notna(), None).to_dict(orient="records")


@app.post("/api/astronauts/{aid}/readings", status_code=201)
def add_reading(aid: str, reading: ReadingIn, user: User = Depends(current_user)):
    """Ingest a new reading (astronaut check-in or CMO entry), re-evaluate, update the alert."""
    _astronaut(aid, user)
    own = aid == user.astronaut_id
    if not (user.can("submit_any_reading") or (own and user.can("submit_own_reading"))):
        raise HTTPException(403, "Your role can't log readings for this astronaut.")
    data = reading.model_dump()
    if all(v is None for v in data.values()):
        raise HTTPException(422, "Reading contains no values")
    data["astronaut_id"] = aid
    data["timestamp"] = db.now_iso()
    data["source"] = "checkin" if user.role == "astronaut" else "manual"
    reading_id = db.insert_reading(data)
    ev = evaluate_astronaut(aid)
    result = record_evaluation(aid, ev)
    return {"reading_id": reading_id, "alert": result, "evaluation": ev}


@app.post("/api/astronauts/{aid}/explain")
def explain(aid: str, user: User = Depends(require("use_assistant"))):
    a = _astronaut(aid, user)
    return llm_explainer.explain(evaluate_astronaut(aid), a["name"])


@app.post("/api/astronauts/{aid}/chat")
def chat(aid: str, body: ChatIn, user: User = Depends(require("use_assistant"))):
    a = _astronaut(aid, user)
    return llm_explainer.answer(evaluate_astronaut(aid), a["name"], body.question,
                                [t.model_dump() for t in body.history])


# ----------------------------------------------------------------- alerts ---

@app.get("/api/alerts")
def list_alerts(limit: int = 100, user: User = Depends(current_user)):
    ids = user.visible_ids([a["id"] for a in db.astronauts()])
    return db.alerts(ids, max(1, min(limit, 500)))


@app.post("/api/alerts/{alert_id}/acknowledge")
def ack_alert(alert_id: int, user: User = Depends(require("acknowledge_alert"))):
    _alert_for(alert_id, user)
    db.acknowledge_alert(alert_id, user.label)
    return {"ok": True}


@app.post("/api/alerts/{alert_id}/note")
def ground_note(alert_id: int, body: NoteIn, user: User = Depends(require("ground_note"))):
    _alert_for(alert_id, user)
    db.set_ground_note(alert_id, body.note.strip())
    return {"ok": True}


@app.get("/api/sync/export")
def sync_export(user: User = Depends(require("sync"))):
    """Package for the ground team, sent when a comms window opens."""
    return {
        "exported_at": db.now_iso(),
        "crew": [{**a, "evaluation": evaluate_astronaut(a["id"])} for a in db.astronauts()],
        "alerts": db.alerts(limit=500),
    }


@app.post("/api/sync/complete")
def sync_complete(user: User = Depends(require("sync"))):
    return {"synced_alerts": db.mark_synced()}


# ------------------------------------------------- built frontend (optional) ---
# After `npm run build`, the API also serves the dashboard so the whole system
# runs from one local process aboard the spacecraft. (On Vercel, the CDN
# serves frontend/dist instead and this block is inactive.)

DIST = ROOT / "frontend" / "dist"
if DIST.exists() and not os.getenv("VERCEL"):
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith("api/"):
            raise HTTPException(404)
        f = (DIST / path).resolve()
        if path and f.is_file() and DIST.resolve() in f.parents:
            return FileResponse(f)
        return FileResponse(DIST / "index.html")
