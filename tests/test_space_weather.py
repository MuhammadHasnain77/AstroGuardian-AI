"""Live space weather (NOAA GOES protons + NASA DONKI), with the network mocked."""

from datetime import datetime, timedelta, timezone

import httpx
import pytest

from tests.conftest import login


def _noaa_payload(pfu_10, minutes_ago=5, pfu_100=0.2):
    t = (datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)).strftime("%Y-%m-%dT%H:%M:%SZ")
    t0 = (datetime.now(timezone.utc) - timedelta(minutes=minutes_ago + 65)).strftime("%Y-%m-%dT%H:%M:%SZ")
    return [
        {"time_tag": t0, "satellite": 18, "flux": 0.3, "energy": ">=10 MeV"},
        {"time_tag": t, "satellite": 18, "flux": pfu_10, "energy": ">=10 MeV"},
        {"time_tag": t, "satellite": 18, "flux": pfu_100, "energy": ">=100 MeV"},
        {"time_tag": t, "satellite": 18, "flux": 9.0, "energy": ">=1 MeV"},
    ]


DONKI = [{"sepID": "2024-05-11T02:00:00-SEP-001", "eventTime": "2024-05-11T02:00Z",
          "link": "https://ccmc.gsfc.nasa.gov/DONKI/view/SEP/1/1", "instruments": [{"displayName": "GOES-P"}]}]


@pytest.fixture
def live(client, monkeypatch):
    """Turn space weather on and route httpx.get to fakes. Returns a setter."""
    from backend import space_weather
    monkeypatch.setenv("SPACE_WEATHER", "live")
    space_weather.reset_memo()
    state = {"noaa": _noaa_payload(0.25), "noaa_fail": False, "donki_fail": False, "calls": []}

    def fake_get(url, timeout, params=None):
        state["calls"].append(url)
        req = httpx.Request("GET", url)
        if "swpc" in url:
            if state["noaa_fail"]:
                raise httpx.ConnectError("no route", request=req)
            return httpx.Response(200, json=state["noaa"], request=req)
        if state["donki_fail"]:
            raise httpx.ConnectError("no route", request=req)
        return httpx.Response(200, json=DONKI, request=req)

    monkeypatch.setattr(space_weather.httpx, "get", fake_get)

    def set_(**kw):
        state.update(kw)
        space_weather.reset_memo()
        # Force refetch by expiring the stored snapshot.
        from backend import db
        with db.connect() as c:
            c.execute("DELETE FROM meta WHERE key = 'space_weather'")
    return set_, state


@pytest.mark.parametrize("pfu,level", [(0.3, 0), (10, 1), (99, 1), (100, 2), (1000, 3), (10_000, 4), (100_000, 5)])
def test_noaa_s_scale(pfu, level):
    from backend.space_weather import s_level
    assert s_level(pfu) == level


def test_quiet_sun_changes_nothing(live, cmo):
    set_, _ = live
    set_(noaa=_noaa_payload(0.25))
    sw = cmo.get("/api/space-weather").json()
    assert sw["source"] == "noaa" and sw["s_level"] == 0 and sw["fresh"] is True
    assert sw["events"][0]["id"] == "2024-05-11T02:00:00-SEP-001"
    assert cmo.get("/api/astronauts/ASTRO_01").json()["evaluation"]["risk_level"] == "GREEN"


def test_s3_storm_is_yellow_for_every_crew_member(live, cmo):
    set_, _ = live
    set_(noaa=_noaa_payload(2500))
    ev = cmo.get("/api/astronauts/ASTRO_01").json()["evaluation"]
    sw = [f for f in ev["findings"] if f["metric"] == "space_weather"]
    assert ev["risk_level"] == "YELLOW" and sw[0]["severity"] == "YELLOW"
    assert sw[0]["source"] == "noaa_s_scale" and "S3" in sw[0]["message"]
    assert any("EVA" in a for a in ev["actions"])


def test_s4_storm_is_red_and_says_shelter(live, cmo):
    set_, _ = live
    set_(noaa=_noaa_payload(20_000))
    ev = cmo.get("/api/astronauts/ASTRO_01").json()["evaluation"]
    assert ev["risk_level"] == "RED"
    assert any("shelter" in a.lower() for a in ev["actions"])


def test_old_measurement_never_raises_an_alert(live, cmo):
    set_, _ = live
    set_(noaa=_noaa_payload(20_000, minutes_ago=180))
    sw = cmo.get("/api/space-weather").json()
    assert sw["fresh"] is False
    assert cmo.get("/api/astronauts/ASTRO_01").json()["evaluation"]["risk_level"] == "GREEN"


def test_noaa_outage_reuses_last_real_measurement(live, cmo):
    from backend import space_weather
    set_, state = live
    set_(noaa=_noaa_payload(1.5))
    assert cmo.get("/api/space-weather").json()["source"] == "noaa"
    state["noaa_fail"] = True
    sw = space_weather.snapshot(force=True)
    assert sw["source"] == "cache" and sw["proton_10mev_pfu"] == 1.5


def test_donki_fallback_gives_events_but_no_tier_change(live, cmo):
    set_, _ = live
    set_(noaa_fail=True)
    sw = cmo.get("/api/space-weather").json()
    assert sw["source"] == "donki" and sw["s_level"] is None and len(sw["events"]) == 1
    assert cmo.get("/api/astronauts/ASTRO_01").json()["evaluation"]["risk_level"] == "GREEN"


def test_everything_down_is_reported_not_crashed(live, cmo):
    set_, _ = live
    set_(noaa_fail=True, donki_fail=True)
    assert cmo.get("/api/space-weather").json()["source"] == "unavailable"
    assert cmo.get("/api/astronauts/ASTRO_01").status_code == 200


def test_snapshot_is_cached_between_requests(live, cmo):
    set_, state = live
    set_(noaa=_noaa_payload(0.25))
    for _ in range(3):
        cmo.get("/api/space-weather")
        cmo.get("/api/crew")
    assert sum("swpc" in u for u in state["calls"]) == 1


def test_space_weather_needs_login_and_works_for_every_role(client):
    assert client.get("/api/space-weather").status_code == 401
    login(client, "astronaut", "ASTRO_02")
    assert client.get("/api/space-weather").json()["source"] == "off"
