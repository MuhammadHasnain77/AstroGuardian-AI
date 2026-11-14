"""Alert thresholds used by the AstroGuardian-AI engine.

Every number has an entry in SOURCES. "team" sources are rules this project
chose (anchored to the cited reference) and are labelled as such in the UI
so nobody mistakes them for clinical standards. See
research/health_indicators.md for the full table with links.
"""

# Vitals that must be present for the engine to issue any status at all.
REQUIRED_VITALS = ("heart_rate", "spo2")

NUMERIC_METRICS = (
    "heart_rate", "spo2", "blood_pressure_sys", "blood_pressure_dia", "temperature",
    "sleep_hours", "fatigue", "mood", "exercise_minutes", "radiation_msv",
)

METRIC_LABELS = {
    "heart_rate": "Resting heart rate",
    "spo2": "Blood oxygen (SpO2)",
    "blood_pressure_sys": "Systolic blood pressure",
    "blood_pressure_dia": "Diastolic blood pressure",
    "temperature": "Core temperature",
    "sleep_hours": "Sleep duration",
    "stress_level": "Reported stress",
    "fatigue": "Fatigue (Samn-Perelli)",
    "mood": "Mood",
    "exercise_minutes": "Countermeasure exercise",
    "radiation_msv": "Radiation dose",
    "timestamp": "Data freshness",
    "space_weather": "Solar radiation storm",
}

METRIC_UNITS = {
    "heart_rate": "BPM", "spo2": "%", "blood_pressure_sys": "mmHg", "blood_pressure_dia": "mmHg",
    "temperature": "°C", "sleep_hours": "h", "fatigue": "/7", "mood": "/5",
    "exercise_minutes": "min", "radiation_msv": "mSv",
}

# ------------------------------------------------------------------ sources ---
SOURCES = {
    "team_doc": "AstroGuardian research/health_indicators.md (team research)",
    "acc_aha_2017": "2017 ACC/AHA High Blood Pressure Guideline",
    "aha_low_bp": "American Heart Association — low blood pressure (<90/60 mmHg)",
    "hypothermia": "Clinical definition of hypothermia: core temperature <35 °C (MSD Manual; StatPearls)",
    "high_fever": "Mayo Clinic, Fever: adults should call a provider at 103 °F (39.4 °C) or higher",
    "fever": "Mayo Clinic, Fever: oral temperature of 100 °F (37.8 °C) or higher is generally a fever",
    "van_dongen_2003": "Van Dongen et al., Sleep 2003 — chronic ≤6 h sleep causes cumulative deficits",
    "samn_perelli": "Samn-Perelli 7-point fatigue scale (6 = extremely tired, 7 = completely exhausted)",
    "nasa_std_3001": "NASA-STD-3001 Vol. 1 — career effective dose limit 600 mSv; 250 mSv per solar particle event",
    "nasa_exercise": "NASA: ISS crew are scheduled ~2.5 h/day of exercise to protect bone and muscle",
    "nasa_hrp_bmed": "NASA HRP risk of adverse cognitive or behavioral conditions",
    "personal": "Personal baseline: z-score vs. this astronaut's previous readings",
    "trend": "Linear trend on daily averages, projected 3 days ahead",
    "team": "Team rule — needs flight-surgeon review",
    "noaa_s_scale": "NOAA Space Weather Scale, solar radiation storms (S3: hazard avoidance recommended for astronauts on EVA; S4+: unavoidable hazard)",
}

# --- Heart rate (team_doc) ---
HR_YELLOW_ABOVE = 110
HR_RED_ABOVE = 130
HR_RED_BELOW = 45
HR_BASELINE_PCT = 0.15

# --- SpO2 (team_doc) ---
SPO2_YELLOW_BELOW = 95
SPO2_RED_BELOW = 92

# --- Temperature ---
TEMP_YELLOW_ABOVE = 37.8       # team_doc; matches Mayo Clinic fever definition
TEMP_YELLOW_BELOW = 35.5       # team_doc
TEMP_RED_ABOVE = 39.4          # high_fever
TEMP_RED_BELOW = 35.0          # hypothermia

# --- Blood pressure ---
BP_SYS_YELLOW_ABOVE = 140      # acc_aha_2017 stage 2
BP_DIA_YELLOW_ABOVE = 90       # acc_aha_2017 stage 2
BP_SYS_RED_ABOVE = 180         # acc_aha_2017 hypertensive crisis (> 180)
BP_DIA_RED_ABOVE = 120         # acc_aha_2017 hypertensive crisis (> 120)
BP_SYS_YELLOW_BELOW = 90       # aha_low_bp

# --- Sleep ---
SLEEP_YELLOW_BELOW = 5.0       # team_doc
SLEEP_DEBT_DAYS = 3            # team (window length)
SLEEP_DEBT_AVG_BELOW = 6.0     # van_dongen_2003

# --- Fatigue: Samn-Perelli 1..7 ---
FATIGUE_YELLOW_AT = 6
FATIGUE_RED_AT = 7

# --- Mood: self-report 1 (very low) .. 5 (very good) ---
MOOD_LOW_AT_OR_BELOW = 2       # team
MOOD_LOW_DAYS = 3              # team: sustained, not a single bad day

# --- Exercise countermeasure ---
EXERCISE_SCHEDULED_MIN = 150   # nasa_exercise
EXERCISE_DAYS = 3              # team
EXERCISE_AVG_BELOW = 75        # team: < 50 % of scheduled over 3 days

# --- Radiation ---
RADIATION_CAREER_LIMIT_MSV = 600     # nasa_std_3001
RADIATION_CAREER_YELLOW_FRAC = 0.8   # team: warn at 80 % of limit
RADIATION_EVENT_LIMIT_MSV = 250      # nasa_std_3001 (per solar particle event)

# --- Space weather (live NOAA GOES proton flux, ≥10 MeV) ---
SOLAR_STORM_YELLOW_S = 3       # noaa_s_scale: avoid EVA
SOLAR_STORM_RED_S = 4          # noaa_s_scale: unavoidable hazard on EVA -> shelter

# --- Personal baseline ---
BASELINE_WINDOW = 14
BASELINE_MIN_READINGS = 3
BASELINE_Z_YELLOW = 2.0        # needs persistence (see below)
BASELINE_Z_STRONG = 3.0        # single reading this far out is enough
BASELINE_PERSIST = 2           # z > BASELINE_Z_YELLOW in 2 of the last 3 days
MIN_STD = {
    "heart_rate": 2.0, "spo2": 0.5, "blood_pressure_sys": 5.0, "blood_pressure_dia": 3.0,
    "temperature": 0.2, "sleep_hours": 0.4, "fatigue": 0.5, "mood": 0.5,
    "exercise_minutes": 10.0, "radiation_msv": 0.1,
}
# Metrics where only one direction is concerning (+1 = high is bad, -1 = low is bad).
BASELINE_BAD_DIRECTION = {
    "heart_rate": +1, "spo2": -1, "sleep_hours": -1, "fatigue": +1, "mood": -1,
    "exercise_minutes": -1, "radiation_msv": +1,
}

# --- Predictive trend ---
TREND_WINDOW = 7
TREND_MIN_READINGS = 5
TREND_HORIZON_DAYS = 3
