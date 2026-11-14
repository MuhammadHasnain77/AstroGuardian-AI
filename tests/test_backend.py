import httpx

from ai import llm_explainer


def test_health(client):
    assert client.get("/api/health").json()["status"] == "ok"


def test_crew_overview_seeded_with_expected_statuses(cmo):
    crew = {a["id"]: a for a in cmo.get("/api/crew").json()}
    assert crew["ASTRO_01"]["risk_level"] == "GREEN"
    assert crew["ASTRO_02"]["risk_level"] == "YELLOW"
    assert crew["ASTRO_03"]["risk_level"] == "RED"


def test_initial_alerts_logged(cmo):
    levels = {a["astronaut_id"]: a["risk_level"] for a in cmo.get("/api/alerts").json()}
    assert levels == {"ASTRO_02": "YELLOW", "ASTRO_03": "RED"}


def test_unknown_astronaut_404(cmo):
    assert cmo.get("/api/astronauts/NOPE").status_code == 404


def test_readings_returned_oldest_first(cmo):
    rows = cmo.get("/api/astronauts/ASTRO_01/readings?limit=5").json()
    assert len(rows) == 5
    assert rows[0]["timestamp"] < rows[-1]["timestamp"]
    assert {"fatigue", "mood", "exercise_minutes", "radiation_msv"} <= rows[0].keys()


def test_timestamps_are_utc(cmo):
    ts = cmo.get("/api/astronauts/ASTRO_01/readings?limit=1").json()[0]["timestamp"]
    assert ts.endswith("+00:00")


def test_post_reading_validation(cmo):
    url = "/api/astronauts/ASTRO_01/readings"
    assert cmo.post(url, json={"spo2": 140}).status_code == 422
    assert cmo.post(url, json={}).status_code == 422
    assert cmo.post(url, json={"stress_level": "Extreme"}).status_code == 422
    assert cmo.post(url, json={"fatigue": 8}).status_code == 422
    assert cmo.post(url, json={"mood": 0}).status_code == 422


def test_evaluation_includes_sources_and_radiation(cmo):
    ev = cmo.get("/api/astronauts/ASTRO_03").json()["evaluation"]
    assert all(f["source_text"] for f in ev["findings"])
    assert ev["radiation"]["limit_msv"] == 600
    assert ev["radiation"]["career_dose_msv"] > 0


# ------------------------------------------------------- alert lifecycle ---

def _post(c, aid, **reading):
    return c.post(f"/api/astronauts/{aid}/readings", json=reading).json()


def test_repeated_problem_updates_one_alert(cmo):
    first = _post(cmo, "ASTRO_03", heart_rate=120, spo2=90)["alert"]
    for _ in range(3):
        again = _post(cmo, "ASTRO_03", heart_rate=120, spo2=90)["alert"]
        assert again == {"alert_id": first["alert_id"], "action": "updated"}
    alerts = [a for a in cmo.get("/api/alerts").json() if a["astronaut_id"] == "ASTRO_03"]
    assert len(alerts) == 1 and alerts[0]["occurrences"] >= 4


def test_escalation_opens_new_alert_and_supersedes_old(cmo):
    old = cmo.get("/api/astronauts/ASTRO_02").json()["open_alert"]
    assert old["risk_level"] == "YELLOW"
    r = _post(cmo, "ASTRO_02", heart_rate=95, spo2=90)
    assert r["evaluation"]["risk_level"] == "RED"
    assert r["alert"]["action"] == "opened" and r["alert"]["alert_id"] != old["id"]
    statuses = {a["id"]: a["status"] for a in cmo.get("/api/alerts").json()}
    assert statuses[old["id"]] == "superseded"


def test_back_to_green_resolves_alert(cmo):
    r = _post(cmo, "ASTRO_01", heart_rate=95, spo2=93)   # ASTRO_01 normally ~64 BPM
    assert r["alert"]["action"] == "opened"
    r = _post(cmo, "ASTRO_01", heart_rate=64, spo2=98, sleep_hours=7.4)
    assert r["evaluation"]["risk_level"] == "GREEN" and r["alert"]["action"] == "resolved"
    assert cmo.get("/api/astronauts/ASTRO_01").json()["open_alert"] is None


def test_acknowledge_and_unknown_alert(cmo):
    alert_id = cmo.get("/api/alerts").json()[0]["id"]
    assert cmo.post(f"/api/alerts/{alert_id}/acknowledge").json() == {"ok": True}
    assert cmo.post("/api/alerts/99999/acknowledge").status_code == 404


def test_sync_export_and_complete(ground):
    export = ground.get("/api/sync/export").json()
    assert len(export["crew"]) == 3
    assert ground.post("/api/sync/complete").json()["synced_alerts"] == 2
    assert ground.get("/api/config").json()["unsynced_alerts"] == 0


# ------------------------------------------------------- demo freshness ---

def test_keep_demo_fresh_shifts_timeline(cmo):
    from datetime import datetime, timedelta, timezone

    from backend import db

    with db.connect() as c:
        for r in c.all("SELECT id, timestamp FROM readings"):
            old = (datetime.fromisoformat(r["timestamp"]) - timedelta(days=5)).isoformat(timespec="seconds")
            c.execute("UPDATE readings SET timestamp = ? WHERE id = ?", (old, r["id"]))
    assert db.keep_demo_fresh() == 5
    with db.connect() as c:
        newest = datetime.fromisoformat(c.scalar("SELECT MAX(timestamp) AS m FROM readings"))
    assert datetime.now(timezone.utc) - newest < timedelta(days=1)
    assert db.keep_demo_fresh() == 0


# ------------------------------------------------------------- LLM layer ---

def test_explain_falls_back_when_llm_disabled(cmo):
    body = cmo.post("/api/astronauts/ASTRO_03/explain").json()
    assert body["source"] == "fallback"
    assert "RED" in body["text"]


def test_explain_uses_llm_and_never_changes_tier(cmo, monkeypatch):
    captured = {}

    def fake_post(url, headers, json, timeout):
        captured.update(url=url, headers=headers, body=json)
        return httpx.Response(200, json={"choices": [{"message": {"content": "Stay calm. Contact the CMO."}}]},
                              request=httpx.Request("POST", url))

    monkeypatch.setenv("LLM_PROVIDER", "groq")
    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    monkeypatch.setattr(llm_explainer.httpx, "post", fake_post)

    body = cmo.post("/api/astronauts/ASTRO_03/explain").json()
    assert body == {"text": "Stay calm. Contact the CMO.", "source": "llm",
                    "provider": "groq", "model": "openai/gpt-oss-20b"}
    assert captured["url"] == "https://api.groq.com/openai/v1/chat/completions"
    assert captured["headers"]["Authorization"] == "Bearer test-key"
    assert '"risk_level": "RED"' in captured["body"]["messages"][1]["content"]
    assert cmo.get("/api/astronauts/ASTRO_03").json()["evaluation"]["risk_level"] == "RED"


def test_local_provider_needs_no_key(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "local")
    monkeypatch.delenv("LLM_BASE_URL", raising=False)
    cfg = llm_explainer.config()
    assert cfg["enabled"] and cfg["base_url"] == "http://localhost:11434/v1" and cfg["model"] == "gpt-oss:20b"


def test_llm_network_error_falls_back(cmo, monkeypatch):
    def boom(*a, **k):
        raise httpx.ConnectError("no route to Earth")

    monkeypatch.setenv("LLM_PROVIDER", "groq")
    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    monkeypatch.setattr(llm_explainer.httpx, "post", boom)
    body = cmo.post("/api/astronauts/ASTRO_02/explain").json()
    assert body["source"] == "fallback" and body["error"] == "ConnectError"
    chat = cmo.post("/api/astronauts/ASTRO_02/chat", json={"question": "Why yellow?"}).json()
    assert chat["source"] == "fallback"


# ------------------------------------------------ role-screen data shapes ---

def test_each_finding_carries_its_own_actions(cmo):
    ev = cmo.get("/api/astronauts/ASTRO_02").json()["evaluation"]
    assert ev["findings"] and all(f["actions"] for f in ev["findings"])


def test_checked_in_today_flag(astro2):
    assert astro2.get("/api/astronauts/ASTRO_02").json()["checked_in_today"] is False
    astro2.post("/api/astronauts/ASTRO_02/readings", json={"sleep_hours": 7, "mood": 4, "fatigue": 3})
    assert astro2.get("/api/astronauts/ASTRO_02").json()["checked_in_today"] is True


def test_crew_includes_daily_series_and_open_alert(cmo):
    crew = {a["id"]: a for a in cmo.get("/api/crew").json()}
    hr = crew["ASTRO_02"]["series"]["heart_rate"]
    assert 7 <= len(hr) <= 14 and hr[0]["day"] < hr[-1]["day"]
    assert crew["ASTRO_03"]["open_alert"]["risk_level"] == "RED"
    assert crew["ASTRO_01"]["open_alert"] is None
