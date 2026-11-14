import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

# API tests run against SQLite always, and against Postgres too when
# TEST_DATABASE_URL is set (CI does this with a Postgres service container).
_BACKENDS = ["sqlite"] + (["postgres"] if os.getenv("TEST_DATABASE_URL") else [])


@pytest.fixture(params=_BACKENDS)
def client(request, tmp_path, monkeypatch):
    """Unauthenticated API client on a fresh, seeded database. LLM disabled."""
    monkeypatch.setenv("LLM_PROVIDER", "off")
    monkeypatch.setenv("SPACE_WEATHER", "off")   # no network in tests; see test_space_weather.py
    monkeypatch.setenv("SECRET_KEY", "test-secret")
    monkeypatch.setenv("DEMO_PASSWORD", "NASA")
    if request.param == "postgres":
        monkeypatch.setenv("DATABASE_URL", os.environ["TEST_DATABASE_URL"])
    else:
        monkeypatch.delenv("DATABASE_URL", raising=False)
        monkeypatch.setenv("ASTRO_DB_PATH", str(tmp_path / "test.db"))

    from fastapi.testclient import TestClient

    from backend import auth, db, main

    auth._failures.clear()
    from backend import space_weather
    space_weather.reset_memo()
    db.init_db(seed=True, reset=True)
    db.reset_ready_flag()
    with TestClient(main.app) as c:
        yield c
    db.reset_ready_flag()


def login(client, role, astronaut_id=None):
    assert client.post("/api/auth/unlock", json={"password": "NASA"}).status_code == 200
    r = client.post("/api/auth/role", json={"role": role, "astronaut_id": astronaut_id})
    assert r.status_code == 200, r.text
    return client


@pytest.fixture
def cmo(client):
    return login(client, "cmo")


@pytest.fixture
def ground(client):
    return login(client, "ground")


@pytest.fixture
def astro2(client):
    return login(client, "astronaut", "ASTRO_02")
