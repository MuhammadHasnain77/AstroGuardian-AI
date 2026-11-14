"""Real crew blood tests from NASA's Open Science Data Repository (OSDR).

SpaceX Inspiration4 (Sept 2021, 3-day orbital flight, 4 civilian crew C001–C004):
    OSD-575  Comprehensive metabolic panel (Quest Diagnostics)
             https://osdr.nasa.gov/bio/repo/data/studies/OSD-575
    OSD-569  Complete blood count
             https://osdr.nasa.gov/bio/repo/data/studies/OSD-569
Timepoints: L-92, L-44, L-3 (days before launch) and R+1, R+45, R+82, R+194
(days after return). There were no in-flight blood draws.

The CSVs are bundled in data/osdr/ (they're ~10 KB each and the app must work
offline). This is a REFERENCE dataset: these are not our simulated crew.
"""

import re
from functools import lru_cache
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
FILES = {
    "cmp": ("Metabolic panel", "OSD-575", ROOT / "data/osdr/OSD-575_LSDS-8_Comprehensive_Metabolic_Panel_CMP_TRANSFORMED.csv"),
    "cbc": ("Blood count", "OSD-569", ROOT / "data/osdr/OSD-569_LSDS-7_Complete_Blood_Count_CBC_TRANSFORMED.csv"),
}
TIMEPOINTS = ["L-92", "L-44", "L-3", "R+1", "R+45", "R+82", "R+194"]
PRE = TIMEPOINTS[:3]
NOTABLE_CHANGE_PCT = 20.0   # display rule for highlighting, not a clinical threshold

UNITS = {
    "gram_per_deciliter": "g/dL", "grams_per_deciliter": "g/dL", "units_per_liter": "U/L",
    "milligram_per_deciliter": "mg/dL", "millimol_per_liter": "mmol/L", "cells_per_microliter": "cells/µL",
    "percent": "%", "picogram": "pg", "femtoliter": "fL", "thousand_per_microliter": "×10³/µL",
    "million_per_microliter": "×10⁶/µL", "milliliter_per_minute_per_1.73_meter_squared": "mL/min/1.73m²", "": "",
}
NAMES = {
    "alt": "ALT", "ast": "AST", "urea_nitrogen_bun": "BUN", "bun_to_creatinine_ratio": "BUN/creatinine ratio",
    "egfr_non_african_american": "eGFR", "albumin_to_globulin_ratio": "Albumin/globulin ratio",
    "mch": "MCH", "mchc": "MCHC", "mcv": "MCV", "mpv": "MPV", "rdw": "RDW",
    "white_blood_cell_count": "White blood cells", "red_blood_cell_count": "Red blood cells",
    "platelet_count": "Platelets",
}
# Known metadata errors in the source files, corrected for display.
UNIT_FIXES = {"hemoglobin": ("g/dL", "Source file labels this 'percent'; values are g/dL.")}
# Race-based eGFR is no longer recommended (NKF-ASN 2021); show only the general eGFR.
SKIP = {"egfr_african_american"}


def _num(v):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return None if pd.isna(f) else f


DIFFERENTIALS = ("neutrophils", "lymphocytes", "monocytes", "eosinophils")


def _corrupt_cbc_rows(df: pd.DataFrame) -> dict:
    """Find blood-count draws whose columns don't agree with each other.

    Each absolute white-cell count should be ~ its percentage x total WBC.
    A draw failing that on 2+ cell types has misaligned columns (the source
    file has one such row: C003 L-92) and is excluded rather than trusted.
    """
    bad = {}
    wbc = next(c for c in df.columns if c.startswith("white_blood_cell_count_value"))
    for i, row in df.iterrows():
        misses = 0
        for cell in DIFFERENTIALS:
            pct = next((c for c in df.columns if c.startswith(f"{cell}_value")), None)
            ab = next((c for c in df.columns if c.startswith(f"absolute_{cell}_value")), None)
            p, a, w = _num(row.get(pct)), _num(row.get(ab)), _num(row.get(wbc))
            if None in (p, a, w):
                continue
            expected = p / 100 * w * 1000
            if abs(a - expected) > max(0.25 * expected, 100):
                misses += 1
        if misses >= 2:
            bad[i] = f"Blood count columns are inconsistent ({misses} white-cell counts don't match their percentages); draw excluded."
    return bad


@lru_cache(maxsize=1)
def load() -> dict:
    crew = set()
    analytes = []
    excluded = []
    for panel, (panel_name, study, path) in FILES.items():
        df = pd.read_csv(path, encoding="utf-8-sig")
        df["crew"] = df["Sample Name"].str.extract(r"^(C\d{3})")
        df["tp"] = df["Sample Name"].str.extract(r"_(L-\d+|R\+\d+)")
        crew.update(df["crew"].dropna())
        if panel == "cbc":
            for i, reason in _corrupt_cbc_rows(df).items():
                excluded.append({"crew": df.at[i, "crew"], "timepoint": df.at[i, "tp"], "panel": panel_name,
                                 "study": study, "reason": reason})
                df = df.drop(index=i)
        for col in [c for c in df.columns if "_value" in c]:
            base, unit_raw = col.split("_value", 1)
            if base in SKIP:
                continue
            unit_raw = unit_raw.lstrip("_")
            unit, note = UNITS.get(unit_raw, unit_raw), None
            if base in UNIT_FIXES:
                unit, note = UNIT_FIXES[base]
            lo_col = next((c for c in df.columns if c.startswith(f"{base}_range_min")), None)
            hi_col = next((c for c in df.columns if c.startswith(f"{base}_range_max")), None)
            per_crew = {}
            for cid, rows in df.groupby("crew"):
                by_tp = {r["tp"]: r for _, r in rows.iterrows()}
                series = [{"tp": tp, "value": _num(by_tp[tp][col]) if tp in by_tp else None} for tp in TIMEPOINTS]
                pre = [p["value"] for p in series if p["tp"] in PRE and p["value"] is not None]
                baseline = round(sum(pre) / len(pre), 3) if pre else None
                r1 = next((p["value"] for p in series if p["tp"] == "R+1"), None)
                ref = by_tp.get("R+1", next(iter(by_tp.values())))
                lo, hi = (_num(ref[lo_col]) if lo_col else None), (_num(ref[hi_col]) if hi_col else None)
                change = round((r1 - baseline) / baseline * 100, 1) if r1 is not None and baseline else None
                out_of_range = r1 is not None and ((lo is not None and r1 < lo) or (hi is not None and r1 > hi))
                per_crew[cid] = {
                    "series": series, "baseline": baseline, "r1": r1, "change_pct": change,
                    "range": [lo, hi], "r1_out_of_range": bool(out_of_range),
                    "notable": bool(out_of_range or (change is not None and abs(change) >= NOTABLE_CHANGE_PCT)),
                }
            analytes.append({
                "id": base, "panel": panel, "panel_name": panel_name, "study": study,
                "name": NAMES.get(base, re.sub(r"_", " ", base).capitalize()),
                "unit": unit, "unit_note": note, "crew": per_crew,
            })
    return {
        "mission": "SpaceX Inspiration4 (2021, 3 days in orbit)",
        "crew": sorted(crew),
        "timepoints": TIMEPOINTS,
        "pre_flight": PRE,
        "notable_change_pct": NOTABLE_CHANGE_PCT,
        "sources": [{"study": s, "name": n, "url": f"https://osdr.nasa.gov/bio/repo/data/studies/{s}"}
                    for _, (n, s, _) in FILES.items()],
        "note": "Real data from NASA OSDR. Pre-flight baseline = mean of L-92, L-44 and L-3. "
                "Blood was drawn before launch and after return only. These are not the simulated crew.",
        "analytes": analytes,
        "excluded": excluded,
    }
