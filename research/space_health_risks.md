# Scientific Rationale & NASA Human Research Program (HRP) Alignment

## Overview
AstroGuardian-AI utilizes simulated telemetry data that directly mirrors the physiological stressors documented by the **NASA Human Research Program (HRP)**. Because real-time telemetry from active International Space Station (ISS) crews is restricted, our simulation models real spaceflight adaptation hazards to test our predictive AI monitoring engine.

---

## Key Spaceflight Hazards Modelled in Our AI

### 1. Cardiovascular Deconditioning & Fluid Shifts
* **The Space Hazard:** In microgravity, body fluids shift upward toward the head, causing changes in blood volume and cardiac output. Upon returning to gravity or during high-stress EVA (extravehicular activity) operations, astronauts can experience cardiovascular drift and orthostatic intolerance.
* **How Our AI Detects It:** Our `ai/risk_detection.py` module tracks resting heart rate and blood pressure deviations against personalized baselines, flagging sudden upward drift or anomalous spikes that exceed safe adaptation thresholds.

### 2. Sleep Deprivation & Circadian Misalignment
* **The Space Hazard:** ISS astronauts experience 16 sunrises and sunsets every 24 hours, combined with high-stress workloads, ambient noise, and carbon dioxide variations. Sleep loss is one of the most critical risks to cognitive performance and mission safety.
* **How Our AI Detects It:** The monitoring engine flags reduced sleep durations (e.g., $< 5$ hours) and correlates sleep debt with fatigue-induced physiological stress.

### 3. Hypoxia & Atmospheric Monitoring
* **The Space Hazard:** Closed spacecraft environments require strict monitoring of oxygen (O₂) and cabin air composition to prevent subtle hypoxia or hypercapnia.
* **How Our AI Detects It:** Our SpO₂ tracking module triggers strict **YELLOW** and **RED** risk tiers if blood oxygen saturation drops below optimal space-operation norms ($< 95\%$ or $< 92\%$).

---

## References & Official Frameworks
* **NASA Human Research Roadmap (HRR):** Cardiovascular and Behavioral Health Risk Sectors.
* **Canadian Space Agency (CSA):** Bio-Monitor technology principles for non-intrusive physiological tracking in microgravity.
