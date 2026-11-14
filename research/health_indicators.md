# Tracked Spacecraft Health Indicators & Thresholds

AstroGuardian-AI monitors key physiological parameters tailored to microgravity adaptation and operational stress during space missions.

## 1. Cardiovascular Metrics
* **Heart Rate (HR):** 
  * *Normal Baseline:* Personalized mean $\pm$ standard deviation per astronaut.
  * *Warning Tier (YELLOW):* Deviation $> 15\%$ above baseline or acute spike $> 110$ BPM during resting phase.
  * *Critical Tier (RED):* Sustained tachycardia $> 130$ BPM or severe bradycardia $< 45$ BPM.
* **Blood Pressure (BP):**
  * *Systolic / Diastolic monitoring* to catch orthostatic intolerance risks caused by fluid shifts.

## 2. Respiratory & Oxygenation
* **Blood Oxygen Saturation ($SpO_2$):**
  * *Normal Range:* $95\% - 100\%$ in pressurized cabin environments.
  * *Warning Tier (YELLOW):* $92\% - 94\%$ (indicates potential cabin air quality fluctuation or mild hypoxia).
  * *Critical Tier (RED):* $< 92\%$ (triggers immediate emergency alert protocol).

## 3. Circadian & Recovery Metrics
* **Sleep Duration:** 
  * *Target:* $\ge 7$ hours per 24-hour cycle.
  * *Risk Flag:* $< 5$ hours triggers fatigue-induced cognitive impairment warnings per NASA HRP circadian guidelines.
* **Core Body Temperature:**
  * *Monitoring:* Tracks febrile responses or environmental thermal regulation anomalies ($> 37.8^\circ\text{C}$ or $< 35.5^\circ\text{C}$).

## 4. Space Weather (live)
* **Solar radiation storms:** the latest ≥10 MeV proton flux from NOAA's primary GOES satellite, on NOAA's S1–S5 scale. S1–S2 are shown but don't change alert tiers; S3 raises YELLOW (postpone EVAs) and S4+ raises RED (radiation shelter) for every crew member. NASA DONKI's solar-particle-event log provides context and a fallback.

## 5. Behavioural Health & Countermeasures
* **Fatigue (Samn-Perelli 7-point scale):** self-reported each check-in. YELLOW at 6 ("extremely tired, very difficult to concentrate"), RED at 7 ("completely exhausted, unable to function effectively").
* **Mood (1–5 self-report):** YELLOW when ≤ 2 for 3 days in a row. A single bad day is not flagged.
* **Sleep debt:** YELLOW when the 3-day average is below 6 h, even if no single night is below 5 h.
* **Countermeasure exercise:** YELLOW when the 3-day average is below 75 min/day (half of the ~150 min/day ISS schedule), because bone and muscle loss accelerates without it.
* **Radiation:** cumulative career effective dose (prior missions + this mission's dosimeter readings). YELLOW at 80 % of the 600 mSv career limit, RED at 100 %. Any single day ≥ 250 mSv (solar-particle-event limit) is RED.

---

## Threshold Sources

Every alert in the app shows its source. Rows marked **Team rule** are choices this project made, anchored to the cited reference, and need review by a flight surgeon before operational use.

| Threshold | Value | Source |
|---|---|---|
| Heart rate YELLOW / RED | > 110 BPM / > 130 or < 45 BPM; > 15 % above personal baseline | This document (§1) |
| SpO₂ YELLOW / RED | < 95 % / < 92 % | This document (§2) |
| Temperature YELLOW | > 37.8 °C or < 35.5 °C | This document (§3). The 37.8 °C fever line matches Mayo Clinic: an oral temperature of *"100 F (37.8 C) or higher is generally considered to be a fever"* — [Mayo Clinic, Fever: symptoms & causes](https://www.mayoclinic.org/diseases-conditions/fever/symptoms-causes/syc-20352759) |
| Temperature RED (high) | ≥ 39.4 °C (103 °F) | Mayo Clinic, adults: *"Call your health care provider if your temperature is 103 F (39.4 C) or higher."* — [Mayo Clinic, Fever: symptoms & causes](https://www.mayoclinic.org/diseases-conditions/fever/symptoms-causes/syc-20352759) (verified via [Mayo-licensed copy](https://www.mymlc.com/health-information/diseases-and-conditions/f/fever2/), © MFMER). Treating "call a provider" as RED (notify the CMO) is a **team rule**; Harvard Health uses 104 °F |
| Temperature RED (low) | < 35.0 °C | Clinical definition of hypothermia — [MSD Manual](https://www.msdmanuals.com/professional/injuries-poisoning/cold-injury/hypothermia); [StatPearls](https://www.ncbi.nlm.nih.gov/books/NBK545239/) |
| Blood pressure YELLOW | ≥ 140 systolic or ≥ 90 diastolic (stage 2) | [2017 ACC/AHA High Blood Pressure Guideline](https://acc.org/Latest-in-Cardiology/Articles/2017/11/08/11/47/mon-5pm-bp-guideline-aha-2017) |
| Blood pressure RED | > 180 systolic or > 120 diastolic (hypertensive crisis) | 2017 ACC/AHA guideline (above) |
| Low blood pressure YELLOW | < 90 systolic | American Heart Association definition of low blood pressure (< 90/60 mmHg) |
| Sleep YELLOW | < 5 h | This document (§3) |
| Sleep debt YELLOW | 3-day average < 6 h | [Van Dongen et al., *Sleep* 2003](https://read.qxmd.com/read/12683469/the-cumulative-cost-of-additional-wakefulness-dose-response-effects-on-neurobehavioral-functions-and-sleep-physiology-from-chronic-sleep-restriction-and-total-sleep-deprivation): chronic ≤ 6 h/night produced cumulative cognitive deficits. 3-day window is a **team rule** |
| Fatigue YELLOW / RED | Samn-Perelli 6 / 7 | Scale descriptors — [IATA fatigue data protocol](https://www.iata.org/contentassets/5f976bb3ca2446f3a40e88b18dd61fbb/common-protocol-for-minimum-data-collection-variables-in-aviation-ops.pdf). Choice of cut-offs is a **team rule** |
| Low mood YELLOW | ≤ 2/5 for 3 days | **Team rule**, motivated by NASA HRP risk of adverse cognitive or behavioural conditions |
| Exercise YELLOW | 3-day average < 75 min/day | ~2.5 h/day ISS schedule — [NASA](https://www.nasa.gov/blogs/spacestation/2025/07/16/muscle-and-exercise-studies-to-maintain-crew-health-in-space/). 50 % / 3-day cut-off is a **team rule** |
| Radiation career limit | 600 mSv effective dose | NASA-STD-3001 Vol. 1 — [NASA radiation protection technical brief](https://www.nasa.gov/wp-content/uploads/2023/03/radiation-protection-technical-brief-ochmo.pdf). 80 % warning level is a **team rule** |
| Radiation event limit | 250 mSv per solar particle event | NASA-STD-3001 (as above) |
| Solar radiation storm YELLOW | NOAA S3 (≥10 MeV protons ≥ 1,000 pfu), live | [NOAA Space Weather Scales](https://www.spaceweather.gov/noaa-scales-explanation): S3 = "radiation hazard avoidance recommended for astronauts on EVA". Data: [NOAA SWPC GOES proton flux](https://www.spaceweather.gov/products/goes-proton-flux) |
| Solar radiation storm RED | NOAA S4+ (≥ 10,000 pfu), live | NOAA scale: S4 = "unavoidable radiation hazard to astronauts on EVA". Applied only to measurements less than 2 h old (**team rule**) |
| Personal baseline | \|z\| > 3 on one reading, or \|z\| > 2 on 2 of the last 3 days, over the previous 14 readings | **Team rule** (statistical; tuned to suppress single noisy readings) |
| Trend prediction | Linear fit on 7 daily averages, projected 3 days | **Team rule** |
| Stale data | Latest reading older than 36 h → UNKNOWN | **Team rule** |

---

## Simulator Calibration

The demo crew's telemetry is simulated (no public dataset of astronaut in-flight vitals exists), but these values are calibrated to published spaceflight measurements:

| Quantity | Simulated value | Source |
|---|---|---|
| Sleep per night | Baselines 6.1–6.6 h | 6.09 h mean on ISS over >4,200 in-flight nights; 8.5 h scheduled ([Barger et al., *Lancet Neurology* 2014](https://pmc.ncbi.nlm.nih.gov/articles/PMC4188436)) |
| Radiation dose | ~0.65 mSv/day | DOSIS 3D, ISS Columbus module, dose equivalent ~647 µSv/day ([Berger et al., *J. Space Weather Space Clim.* 2017](https://www.swsc-journal.org/articles/swsc/full_html/2017/01/swsc160046/swsc160046.html)) |
| Exercise | ~150 min/day | NASA's scheduled ISS countermeasure time ([NASA](https://www.nasa.gov/blogs/spacestation/2025/07/16/muscle-and-exercise-studies-to-maintain-crew-health-in-space/)) |
