"""Password gate, role choice, and per-role permissions (enforced server-side)."""

import pytest

from tests.conftest import login


def test_everything_locked_without_password(client):
    for path in ("/api/crew", "/api/alerts", "/api/config", "/api/astronauts/ASTRO_01"):
        assert client.get(path).status_code == 401
    assert client.get("/api/health").status_code == 200


def test_wrong_password_rejected(client):
    assert client.post("/api/auth/unlock", json={"password": "SpaceX"}).status_code == 401
    assert client.get("/api/auth/state").json() == {"unlocked": False, "user": None}


def test_password_is_case_insensitive(client):
    assert client.post("/api/auth/unlock", json={"password": " nasa "}).status_code == 200


def test_password_attempts_are_throttled(client):
    for _ in range(10):
        client.post("/api/auth/unlock", json={"password": "bad"})
    assert client.post("/api/auth/unlock", json={"password": "NASA"}).status_code == 429


def test_unlocked_but_no_role_is_still_blocked(client):
    client.post("/api/auth/unlock", json={"password": "NASA"})
    state = client.get("/api/auth/state").json()
    assert state["unlocked"] and state["user"] is None
    assert {r["id"] for r in state["roles"]} == {"astronaut", "cmo", "ground"}
    assert client.get("/api/crew").status_code == 401


def test_role_requires_password_first(client):
    assert client.post("/api/auth/role", json={"role": "cmo"}).status_code == 401


def test_astronaut_role_requires_identity(client):
    client.post("/api/auth/unlock", json={"password": "NASA"})
    assert client.post("/api/auth/role", json={"role": "astronaut"}).status_code == 422
    assert client.post("/api/auth/role", json={"role": "astronaut", "astronaut_id": "NOPE"}).status_code == 422


def test_forged_cookie_rejected(client):
    client.cookies.set("ag_session", "eyJnYXRlIjp0cnVlLCJyb2xlIjoiY21vIn0.deadbeef")
    assert client.get("/api/crew").status_code == 401


def test_switch_role_keeps_gate_and_logout_clears_it(client):
    login(client, "cmo")
    client.post("/api/auth/switch-role")
    assert client.get("/api/auth/state").json()["unlocked"] is True
    assert client.get("/api/crew").status_code == 401
    client.post("/api/auth/logout")
    assert client.get("/api/auth/state").json()["unlocked"] is False


# ---------------------------------------------------------- astronaut role ---

def test_astronaut_sees_only_self(astro2):
    assert [a["id"] for a in astro2.get("/api/crew").json()] == ["ASTRO_02"]
    assert astro2.get("/api/astronauts/ASTRO_02").status_code == 200
    assert astro2.get("/api/astronauts/ASTRO_03").status_code == 403
    assert astro2.get("/api/astronauts/ASTRO_03/readings").status_code == 403
    assert astro2.post("/api/astronauts/ASTRO_03/explain").status_code == 403
    assert {a["astronaut_id"] for a in astro2.get("/api/alerts").json()} == {"ASTRO_02"}


def test_astronaut_can_check_in_for_self_only(astro2):
    r = astro2.post("/api/astronauts/ASTRO_02/readings", json={"heart_rate": 70, "spo2": 98, "mood": 4})
    assert r.status_code == 201
    assert astro2.post("/api/astronauts/ASTRO_01/readings", json={"heart_rate": 70}).status_code == 403


def test_astronaut_cannot_acknowledge_note_or_sync(astro2):
    alert_id = astro2.get("/api/alerts").json()[0]["id"]
    assert astro2.post(f"/api/alerts/{alert_id}/acknowledge").status_code == 403
    assert astro2.post(f"/api/alerts/{alert_id}/note", json={"note": "x"}).status_code == 403
    assert astro2.get("/api/sync/export").status_code == 403
    assert astro2.get("/api/config").json()["unsynced_alerts"] is None


# ---------------------------------------------------------------- CMO role ---

def test_cmo_sees_all_and_logs_for_anyone(cmo):
    assert len(cmo.get("/api/crew").json()) == 3
    assert cmo.post("/api/astronauts/ASTRO_01/readings", json={"heart_rate": 66, "spo2": 98}).status_code == 201


def test_cmo_acknowledges_but_cannot_sync_or_note(cmo):
    alert_id = cmo.get("/api/alerts").json()[0]["id"]
    assert cmo.post(f"/api/alerts/{alert_id}/acknowledge").status_code == 200
    a = next(a for a in cmo.get("/api/alerts").json() if a["id"] == alert_id)
    assert a["acknowledged"] and a["acknowledged_by"] == "Crew Medical Officer"
    assert cmo.post(f"/api/alerts/{alert_id}/note", json={"note": "x"}).status_code == 403
    assert cmo.post("/api/sync/complete").status_code == 403


# ------------------------------------------------------------- ground role ---

def test_ground_is_read_only_for_vitals(ground):
    assert len(ground.get("/api/crew").json()) == 3
    assert ground.post("/api/astronauts/ASTRO_01/readings", json={"heart_rate": 66}).status_code == 403


def test_ground_adds_notes_and_syncs_but_cannot_acknowledge(ground):
    alert_id = ground.get("/api/alerts").json()[0]["id"]
    assert ground.post(f"/api/alerts/{alert_id}/note", json={"note": "Increase fluids, recheck in 2 h"}).status_code == 200
    assert ground.post(f"/api/alerts/{alert_id}/acknowledge").status_code == 403
    assert ground.get("/api/sync/export").status_code == 200
    assert ground.post("/api/sync/complete").json()["synced_alerts"] >= 1


@pytest.mark.parametrize("role,aid", [("astronaut", "ASTRO_02"), ("cmo", None), ("ground", None)])
def test_permissions_listed_in_state(client, role, aid):
    login(client, role, aid)
    user = client.get("/api/auth/state").json()["user"]
    assert user["role"] == role and user["astronaut_id"] == aid
    assert ("acknowledge_alert" in user["permissions"]) == (role == "cmo")
    assert ("sync" in user["permissions"]) == (role == "ground")
