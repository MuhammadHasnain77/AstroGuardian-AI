"""Storage: SQLite (default, offline/onboard) or Postgres (e.g. Neon on Vercel).

    DATABASE_URL unset         -> SQLite file at ASTRO_DB_PATH (default backend/astroguardian.db)
    DATABASE_URL=postgres://.. -> Postgres via psycopg 3

All SQL here is written once with `?` placeholders and runs on both engines.
All timestamps are stored as ISO-8601 UTC strings.
"""

import json
import os
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
SAMPLE_CSV = ROOT / "data" / "sample_health_data.csv"
SCHEMA_VERSION = "3"

READING_COLS = ["timestamp", "astronaut_id", "heart_rate", "spo2", "blood_pressure_sys", "blood_pressure_dia",
                "temperature", "sleep_hours", "stress_level", "fatigue", "mood", "exercise_minutes",
                "radiation_msv", "source"]

CREW = [
    # id, name, role, prior career radiation dose (mSv) from earlier missions
    ("ASTRO_01", "Cmdr. Elena Vasquez", "Commander", 310.0),
    ("ASTRO_02", "Dr. Kenji Mori", "Flight Engineer", 95.0),
    ("ASTRO_03", "Amara Okafor", "Mission Specialist", 0.0),
]

_SCHEMA = """
CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT
);
CREATE TABLE IF NOT EXISTS astronauts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    prior_career_dose_msv REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS readings (
    id {PK},
    timestamp TEXT NOT NULL,
    astronaut_id TEXT NOT NULL REFERENCES astronauts(id),
    heart_rate REAL, spo2 REAL,
    blood_pressure_sys REAL, blood_pressure_dia REAL,
    temperature REAL, sleep_hours REAL,
    stress_level TEXT,
    fatigue REAL, mood REAL, exercise_minutes REAL, radiation_msv REAL,
    source TEXT NOT NULL DEFAULT 'sensor'
);
CREATE INDEX IF NOT EXISTS idx_readings_astro_ts ON readings(astronaut_id, timestamp);
CREATE TABLE IF NOT EXISTS alerts (
    id {PK},
    astronaut_id TEXT NOT NULL REFERENCES astronauts(id),
    risk_level TEXT NOT NULL,
    findings TEXT NOT NULL,
    metrics TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    opened_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    resolved_at TEXT,
    occurrences INTEGER NOT NULL DEFAULT 1,
    acknowledged_by TEXT,
    acknowledged_at TEXT,
    ground_note TEXT,
    ground_note_at TEXT,
    synced INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_alerts_astro ON alerts(astronaut_id, status);
"""


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _url() -> str:
    return os.getenv("DATABASE_URL", "").strip()


def is_postgres() -> bool:
    return _url().startswith(("postgres://", "postgresql://"))


def sqlite_path() -> Path:
    return Path(os.getenv("ASTRO_DB_PATH", ROOT / "backend" / "astroguardian.db"))


class _Conn:
    """Tiny adapter so the same `?`-style SQL runs on sqlite3 and psycopg."""

    def __init__(self):
        self.pg = is_postgres()
        if self.pg:
            import psycopg
            from psycopg.rows import dict_row
            self.raw = psycopg.connect(_url(), row_factory=dict_row, connect_timeout=10)
        else:
            path = sqlite_path()
            path.parent.mkdir(parents=True, exist_ok=True)
            self.raw = sqlite3.connect(path)
            self.raw.row_factory = sqlite3.Row
            self.raw.execute("PRAGMA foreign_keys = ON")

    def _sql(self, sql: str) -> str:
        return sql.replace("?", "%s") if self.pg else sql

    def execute(self, sql, params=()):
        cur = self.raw.cursor()
        cur.execute(self._sql(sql), tuple(params))
        return cur

    def executemany(self, sql, rows):
        cur = self.raw.cursor()
        cur.executemany(self._sql(sql), [tuple(r) for r in rows])
        return cur

    def all(self, sql, params=()):
        return [dict(r) for r in self.execute(sql, params).fetchall()]

    def one(self, sql, params=()):
        r = self.execute(sql, params).fetchone()
        return dict(r) if r else None

    def scalar(self, sql, params=()):
        r = self.execute(sql, params).fetchone()
        if r is None:
            return None
        return next(iter(dict(r).values()))

    def script(self, sql: str):
        if self.pg:
            self.raw.execute(sql)
        else:
            self.raw.executescript(sql)


@contextmanager
def connect():
    conn = _Conn()
    try:
        yield conn
        conn.raw.commit()
    except Exception:
        conn.raw.rollback()
        raise
    finally:
        conn.raw.close()


# ------------------------------------------------------------------ setup ---

_ready = False
_ready_lock = threading.Lock()


def auto_seed_enabled() -> bool:
    default = "false" if is_postgres() else "true"
    return os.getenv("AUTO_SEED", default).lower() in ("1", "true", "yes")


def ensure_ready():
    """Create schema once per process; seed demo data when allowed. Cheap after the first call."""
    global _ready
    if _ready:
        return
    with _ready_lock:
        if _ready:
            return
        init_db(seed=auto_seed_enabled())
        _ready = True


def reset_ready_flag():
    global _ready
    _ready = False


def init_db(seed: bool = True, reset: bool = False):
    with connect() as c:
        if reset:
            c.script("DROP TABLE IF EXISTS alerts; DROP TABLE IF EXISTS readings; "
                     "DROP TABLE IF EXISTS astronauts; DROP TABLE IF EXISTS meta;")
        elif _schema_outdated(c):
            if not seed:
                raise RuntimeError("Database schema is outdated. Run: python -m backend.seed --reset")
            c.script("DROP TABLE IF EXISTS alerts; DROP TABLE IF EXISTS readings; "
                     "DROP TABLE IF EXISTS astronauts; DROP TABLE IF EXISTS meta;")
        pk = "SERIAL PRIMARY KEY" if c.pg else "INTEGER PRIMARY KEY AUTOINCREMENT"
        c.script(_SCHEMA.replace("{PK}", pk))
        c.execute("INSERT INTO meta (key, value) VALUES ('schema_version', ?) "
                  "ON CONFLICT (key) DO UPDATE SET value = excluded.value", (SCHEMA_VERSION,))
        if c.scalar("SELECT COUNT(*) AS n FROM astronauts") == 0:
            c.executemany("INSERT INTO astronauts (id, name, role, prior_career_dose_msv) VALUES (?, ?, ?, ?)", CREW)
        seeded = False
        if seed and c.scalar("SELECT COUNT(*) AS n FROM readings") == 0 and SAMPLE_CSV.exists():
            _seed_readings(c)
            seeded = True
    if seeded:
        from .service import record_evaluation, evaluate_astronaut
        for a in astronauts():
            record_evaluation(a["id"], evaluate_astronaut(a["id"]))


def _schema_outdated(c) -> bool:
    try:
        v = c.scalar("SELECT value FROM meta WHERE key = 'schema_version'")
    except Exception:
        c.raw.rollback()
        # No meta table: outdated only if an older schema left other tables behind.
        try:
            c.scalar("SELECT COUNT(*) AS n FROM readings")
            return True
        except Exception:
            c.raw.rollback()
            return False
    return v != SCHEMA_VERSION


def _seed_readings(c):
    """Load the simulated CSV, shifted so its last day is today (UTC)."""
    df = pd.read_csv(SAMPLE_CSV)
    ts = pd.to_datetime(df["timestamp"], utc=True)
    now = pd.Timestamp.now(tz="UTC")
    target = now.normalize() + (ts.max() - ts.max().normalize())   # today, same time of day
    if target > now:
        target -= pd.Timedelta(days=1)
    df["timestamp"] = (ts + (target - ts.max())).map(lambda t: t.isoformat(timespec="seconds"))
    df["source"] = "sensor"
    for col in READING_COLS:
        if col not in df.columns:
            df[col] = None
    rows = df[READING_COLS].astype(object).where(df[READING_COLS].notna(), None).values.tolist()
    c.executemany(f"INSERT INTO readings ({','.join(READING_COLS)}) VALUES ({','.join('?' * len(READING_COLS))})",
                  rows)


def keep_demo_fresh(max_age_hours: float = 20.0) -> int:
    """Shift ALL readings and alerts forward by whole days if the newest reading is old.

    Keeps a hosted demo from turning UNKNOWN (stale) a day after seeding. The
    relative timeline is preserved. Disable with DEMO_KEEP_FRESH=false (flight).
    Returns the number of days shifted.
    """
    with connect() as c:
        newest = c.scalar("SELECT MAX(timestamp) AS m FROM readings")
        if not newest:
            return 0
        age = datetime.now(timezone.utc) - datetime.fromisoformat(newest)
        if age < timedelta(hours=max_age_hours):
            return 0
        days = age.days if age.days >= 1 else 1
        delta = timedelta(days=days)

        def shift(v):
            return None if v is None else (datetime.fromisoformat(v) + delta).isoformat(timespec="seconds")

        for r in c.all("SELECT id, timestamp FROM readings"):
            c.execute("UPDATE readings SET timestamp = ? WHERE id = ?", (shift(r["timestamp"]), r["id"]))
        cols = ("opened_at", "last_seen_at", "resolved_at", "acknowledged_at", "ground_note_at")
        for r in c.all(f"SELECT id, {', '.join(cols)} FROM alerts"):
            c.execute(f"UPDATE alerts SET {', '.join(f'{k} = ?' for k in cols)} WHERE id = ?",
                      [shift(r[k]) for k in cols] + [r["id"]])
        return days


# --------------------------------------------------------------- queries ---

def astronauts():
    with connect() as c:
        return c.all("SELECT * FROM astronauts ORDER BY id")


def astronaut(aid: str):
    with connect() as c:
        return c.one("SELECT * FROM astronauts WHERE id = ?", (aid,))


def readings_df(aid: str, limit: int | None = None) -> pd.DataFrame:
    q = "SELECT * FROM readings WHERE astronaut_id = ? ORDER BY timestamp DESC, id DESC"
    params = [aid]
    if limit:
        q += " LIMIT ?"
        params.append(limit)
    with connect() as c:
        rows = c.all(q, params)
    df = pd.DataFrame(rows, columns=["id"] + READING_COLS) if not rows else pd.DataFrame(rows)
    return df.iloc[::-1].reset_index(drop=True)


def insert_reading(data: dict) -> int:
    cols = [c for c in READING_COLS if c in data]
    with connect() as c:
        return c.scalar(f"INSERT INTO readings ({','.join(cols)}) VALUES ({','.join('?' * len(cols))}) RETURNING id",
                        [data[k] for k in cols])


# ----------------------------------------------------------------- alerts ---

def _alert_row(r):
    r = dict(r)
    r["findings"] = json.loads(r["findings"])
    r["metrics"] = json.loads(r["metrics"])
    r["synced"] = bool(r["synced"])
    r["acknowledged"] = r["acknowledged_by"] is not None
    return r


def open_alert(aid: str):
    with connect() as c:
        r = c.one("SELECT * FROM alerts WHERE astronaut_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1", (aid,))
    return _alert_row(r) if r else None


def create_alert(aid: str, risk_level: str, findings: list, metrics: list) -> int:
    t = now_iso()
    with connect() as c:
        return c.scalar(
            "INSERT INTO alerts (astronaut_id, risk_level, findings, metrics, opened_at, last_seen_at) "
            "VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
            (aid, risk_level, json.dumps(findings), json.dumps(metrics), t, t))


def touch_alert(alert_id: int, risk_level: str, findings: list, metrics: list, changed: bool):
    """Same problem seen again: bump the counter; if details changed, mark for re-sync."""
    with connect() as c:
        c.execute("UPDATE alerts SET risk_level = ?, findings = ?, metrics = ?, last_seen_at = ?, "
                  "occurrences = occurrences + 1" + (", synced = 0" if changed else "") + " WHERE id = ?",
                  (risk_level, json.dumps(findings), json.dumps(metrics), now_iso(), alert_id))


def close_alert(alert_id: int, status: str):
    with connect() as c:
        c.execute("UPDATE alerts SET status = ?, resolved_at = ?, synced = 0 WHERE id = ?",
                  (status, now_iso(), alert_id))


def alerts(astronaut_ids: list | None = None, limit: int = 100):
    q = "SELECT a.*, s.name AS astronaut_name FROM alerts a JOIN astronauts s ON s.id = a.astronaut_id"
    params = []
    if astronaut_ids is not None:
        if not astronaut_ids:
            return []
        q += f" WHERE a.astronaut_id IN ({','.join('?' * len(astronaut_ids))})"
        params += list(astronaut_ids)
    q += " ORDER BY CASE a.status WHEN 'open' THEN 0 ELSE 1 END, a.last_seen_at DESC, a.id DESC LIMIT ?"
    params.append(limit)
    with connect() as c:
        return [_alert_row(r) for r in c.all(q, params)]


def alert(alert_id: int):
    with connect() as c:
        r = c.one("SELECT * FROM alerts WHERE id = ?", (alert_id,))
    return _alert_row(r) if r else None


def acknowledge_alert(alert_id: int, by: str) -> bool:
    with connect() as c:
        return c.execute("UPDATE alerts SET acknowledged_by = ?, acknowledged_at = ? WHERE id = ?",
                         (by, now_iso(), alert_id)).rowcount > 0


def set_ground_note(alert_id: int, note: str) -> bool:
    with connect() as c:
        return c.execute("UPDATE alerts SET ground_note = ?, ground_note_at = ?, synced = 0 WHERE id = ?",
                         (note, now_iso(), alert_id)).rowcount > 0


def mark_synced() -> int:
    with connect() as c:
        return c.execute("UPDATE alerts SET synced = 1 WHERE synced = 0").rowcount


def unsynced_count() -> int:
    with connect() as c:
        return c.scalar("SELECT COUNT(*) AS n FROM alerts WHERE synced = 0")
