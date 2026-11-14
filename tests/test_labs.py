"""Real Inspiration4 labs bundled from NASA OSDR."""

from backend import labs


def test_dataset_shape():
    d = labs.load()
    assert d["crew"] == ["C001", "C002", "C003", "C004"]
    assert d["timepoints"] == ["L-92", "L-44", "L-3", "R+1", "R+45", "R+82", "R+194"]
    panels = {a["panel"] for a in d["analytes"]}
    assert panels == {"cmp", "cbc"} and len(d["analytes"]) >= 35


def test_baseline_and_change_are_computed_from_preflight_draws():
    a = next(x for x in labs.load()["analytes"] if x["id"] == "glucose")["crew"]["C001"]
    pre = [p["value"] for p in a["series"][:3]]
    assert a["baseline"] == round(sum(pre) / 3, 3)
    assert a["change_pct"] == round((a["r1"] - a["baseline"]) / a["baseline"] * 100, 1)
    assert a["range"][0] < a["range"][1]


def test_corrupted_source_row_is_detected_and_excluded():
    d = labs.load()
    assert [(e["crew"], e["timepoint"]) for e in d["excluded"]] == [("C003", "L-92")]
    mpv = next(a for a in d["analytes"] if a["id"] == "mpv")["crew"]["C003"]
    assert next(p for p in mpv["series"] if p["tp"] == "L-92")["value"] is None
    assert 9 < mpv["baseline"] < 12          # not dragged to ~117 by the bad row


def test_source_metadata_errors_are_corrected():
    d = {a["id"]: a for a in labs.load()["analytes"]}
    assert d["hemoglobin"]["unit"] == "g/dL" and d["hemoglobin"]["unit_note"]
    assert "egfr_african_american" not in d and d["egfr_non_african_american"]["name"] == "eGFR"


def test_labs_are_for_medical_roles_only(client):
    from tests.conftest import login
    login(client, "astronaut", "ASTRO_02")
    assert client.get("/api/labs").status_code == 403
    client.post("/api/auth/switch-role")
    client.post("/api/auth/role", json={"role": "ground"})
    body = client.get("/api/labs").json()
    assert body["sources"][0]["url"].startswith("https://osdr.nasa.gov/")
