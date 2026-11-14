"""Generate simulated crew telemetry (deterministic, seeded). Timestamps are UTC.

Three astronauts, one morning reading per day for 21 days:
  ASTRO_01  stable — should stay GREEN
  ASTRO_02  overworked: heart rate and blood pressure creep up, sleep falls,
            fatigue rises, mood dips and exercise gets skipped over the last
            week. Caught by personal baseline + pattern + trend rules before
            any fixed vital limit is crossed (YELLOW)
  ASTRO_03  stable, then an acute low-oxygen + tachycardia event on the
            final day (RED)

Calibration (published spaceflight figures, not invented numbers):
  sleep      baselines 6.1–6.6 h/night, around the 6.09 h ISS average measured
             over >4,200 in-flight nights (Barger et al., Lancet Neurology 2014;
             NASA schedules 8.5 h)
  radiation  ~0.65 mSv/day dose equivalent, as measured by DOSIS 3D in the ISS
             Columbus module (Berger et al., J. Space Weather Space Clim. 2017)
  exercise   ~150 min/day, NASA's scheduled ISS countermeasure time
Vitals (heart rate, SpO2, blood pressure, temperature) remain simulated: no
public dataset of astronaut in-flight vitals exists.

Run:  python data/generate_sample_data.py
"""

import csv
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np

DAYS = 21
START = datetime(2026, 11, 1, 8, 0, 0)
OUT = Path(__file__).resolve().parent / "sample_health_data.csv"
FIELDS = ["timestamp", "astronaut_id", "heart_rate", "spo2", "blood_pressure_sys", "blood_pressure_dia",
          "temperature", "sleep_hours", "stress_level", "fatigue", "mood", "exercise_minutes", "radiation_msv"]

CREW = {
    #            hr  spo2 sys dia  temp  sleep (h, around the 6.09 h ISS mean)
    "ASTRO_01": (64, 98, 118, 76, 36.6, 6.6),
    "ASTRO_02": (70, 98, 122, 80, 36.7, 6.1),
    "ASTRO_03": (66, 98, 116, 75, 36.6, 6.4),
}


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


ISS_DOSE_MSV_PER_DAY = 0.65   # DOSIS 3D, Columbus module


def stress_from(sleep, base_sleep, hr, base_hr):
    score = (base_sleep + 0.5 - sleep) + (hr - base_hr) / 8
    return "High" if score > 2.5 else "Medium" if score > 1.0 else "Low"


def main():
    rng = np.random.default_rng(42)
    rows = []
    for aid, (hr0, spo0, sys0, dia0, t0, sl0) in CREW.items():
        for d in range(DAYS):
            hr = hr0 + rng.normal(0, 2.0)
            spo2 = spo0 + rng.normal(0, 0.5)
            sys_ = sys0 + rng.normal(0, 3)
            dia = dia0 + rng.normal(0, 2)
            temp = t0 + rng.normal(0, 0.1)
            sleep = sl0 + rng.normal(0, 0.35)
            fatigue = 2.5 + rng.normal(0, 0.5)
            mood = 4.2 + rng.normal(0, 0.4)
            exercise = 150 + rng.normal(0, 12)
            radiation = ISS_DOSE_MSV_PER_DAY + rng.normal(0, 0.05)

            if aid == "ASTRO_02" and d >= DAYS - 8:          # gradual drift
                k = d - (DAYS - 8) + 1
                hr += 3.2 * k
                spo2 -= 0.25 * k
                sleep -= 0.22 * k
                sys_ += 0.8 * k
                fatigue += 0.35 * k
                mood -= 0.2 * k
                exercise -= 13 * k
            if aid == "ASTRO_03" and d == DAYS - 1:          # acute event
                hr, spo2, sys_, temp, sleep, fatigue = 121, 90, 134, 37.1, 5.6, 5

            rows.append({
                "timestamp": (START + timedelta(days=d)).strftime("%Y-%m-%d %H:%M:%S"),
                "astronaut_id": aid,
                "heart_rate": round(hr),
                "spo2": int(min(100, round(spo2))),
                "blood_pressure_sys": round(sys_),
                "blood_pressure_dia": round(dia),
                "temperature": round(temp, 1),
                "sleep_hours": round(max(0, sleep), 1),
                "stress_level": stress_from(sleep, sl0, hr, hr0),
                "fatigue": int(clamp(round(fatigue), 1, 7)),
                "mood": int(clamp(round(mood), 1, 5)),
                "exercise_minutes": int(clamp(round(exercise), 0, 240)),
                "radiation_msv": round(max(0, radiation), 2),
            })

    with OUT.open("w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(rows)
    print(f"wrote {len(rows)} rows -> {OUT}")


if __name__ == "__main__":
    main()
