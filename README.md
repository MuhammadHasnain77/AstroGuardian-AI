# 🚀 AstroGuardian-AI
### Intelligent Astronaut Health Monitoring & Early Warning System

> **Mission Statement:** To empower astronauts on long-duration space missions with intelligent, personalized, and reliable health monitoring, helping them recognize potential health risks and take timely action.

---

## 🌌 The Challenge & Context
During long-duration space missions, astronauts experience extreme physiological stressors that differ drastically from life on Earth—including **microgravity-induced bone and muscle loss, cardiovascular deconditioning, space radiation risks, isolation, and disrupted sleep cycles**. With limited access to real-time medical professionals, spacecraft require autonomous, reliable decision-support tools that operate **offline** without relying on continuous internet connectivity.

---

## ✨ Key Differentiators
1. **Personalized AI Baselines:** Detects health drift against each astronaut's own normal, not generic human thresholds.
2. **Predictive Risk Analysis:** Flags trends (heart rate creeping up, sleep steadily declining) *before* they cross a safety limit.
3. **Mental & Physical Tracking:** Vitals plus sleep debt, fatigue, mood, stress, exercise countermeasures and radiation dose.
4. **Real space data:** Live **NOAA solar radiation** feeding the alert engine, **real Inspiration4 crew blood tests** from NASA, and a simulator **calibrated to published ISS studies**.
5. **Explainable, sourced alerts:** **GREEN / YELLOW / RED** tiers (plus **UNKNOWN** when data is missing). Every alert shows its numbers, its action, and where its threshold comes from, and an LLM assistant explains it in plain language.
6. **Role-specific screens:** The astronaut sees *Today*, the Crew Medical Officer sees *Crew triage*, and the ground flight surgeon sees the *Comms window*.
7. **Offline-first:** The whole system runs on the spacecraft computer; alerts sync to ground when a comms window opens.

---

## 📡 Real data vs. simulated data

Public data on individual astronauts' in-flight vitals doesn't exist: NASA releases it only through approved research requests ([NASA Life Sciences Portal](https://nlsp.nasa.gov/explore/lsdahome)), for medical privacy. AstroGuardian uses real data wherever it is public, and says plainly where it isn't.

| What | Status | Source |
|---|---|---|
| **Solar radiation storms** | ✅ **Real, live** (every 5 min) | [NOAA SWPC GOES proton flux](https://www.spaceweather.gov/products/goes-proton-flux): `services.swpc.noaa.gov/json/goes/primary/integral-protons-1-day.json` |
| **Solar particle event history** | ✅ **Real** (fallback and context) | [NASA DONKI SEP API](https://ccmc.gsfc.nasa.gov/tools/DONKI): `api.nasa.gov/DONKI/SEP` |
| **Crew blood tests** | ✅ **Real** (reference crew, bundled) | NASA OSDR, SpaceX Inspiration4: [OSD-575](https://osdr.nasa.gov/bio/repo/data/studies/OSD-575) metabolic panel and [OSD-569](https://osdr.nasa.gov/bio/repo/data/studies/OSD-569) blood count |
| **Sleep** | 🟡 Simulated, **calibrated** | Baselines around the 6.09 h ISS average from >4,200 in-flight nights ([Barger et al., *Lancet Neurology* 2014](https://pmc.ncbi.nlm.nih.gov/articles/PMC4188436)) |
| **Daily radiation dose** | 🟡 Simulated, **calibrated** | ~0.65 mSv/day, as measured by DOSIS 3D in the ISS Columbus module ([Berger et al. 2017](https://www.swsc-journal.org/articles/swsc/full_html/2017/01/swsc160046/swsc160046.html)) |
| **Exercise** | 🟡 Simulated, **calibrated** | ~150 min/day, NASA's scheduled ISS countermeasure time |
| Heart rate, SpO₂, blood pressure, temperature, fatigue, mood | ⚪ Simulated | No public in-flight dataset exists |

### How the real data is used
- **Live space weather → alerts.** The latest ≥10 MeV proton flux is mapped to the [NOAA solar radiation storm scale](https://www.spaceweather.gov/noaa-scales-explanation). For astronauts, NOAA describes **S3** as "radiation hazard avoidance recommended … on EVA", so it raises **YELLOW** (postpone EVAs). **S4+** is "unavoidable radiation hazard … on EVA", so it raises **RED** (go to the radiation shelter). This applies to every crew member, whatever their vitals.
- **Never a single point of failure:**
  - **Network calls never block the health check.** The last good reading is cached in the database, and every fetch has a 4-second timeout.
  - **Outages are handled:** if NOAA is down, the cached reading is used, and DONKI supplies the event log.
  - **Old data never raises an alert:** a reading older than 2 hours can't change anyone's status.
  - In flight, this feed is relayed from the ground at comms windows, and the spacecraft's own dosimeters cover the gaps.
- **Labs.** For each Inspiration4 crew member, every test from the day after return (R+1) is compared with their own pre-flight baseline (mean of 3 draws), and the CMO and ground team see out-of-range results first. The source files contain errors, which are handled explicitly:
  - **A corrupted row is detected and excluded.** C003's L-92 blood count has shifted columns, found automatically with a check that white-cell counts agree with their percentages.
  - **A wrong unit is corrected.** Hemoglobin is labelled "percent" in the file but is in g/dL.
  - **A race-based measure is dropped.** The file's race-based eGFR is omitted, in line with current kidney-function guidance.

---

## 🧠 How the AI Works — Two Layers

```text
 Sensors / check-ins      NOAA live solar protons
          │                        │
          ▼                        ▼
┌────────────────────────────────────────┐      ┌─────────────────────────────────┐
│ LAYER 1 — Analysis Engine               │      │ LAYER 2 — Language Assistant    │
│ ai/baseline.py · ai/risk_detection.py   │ ───► │ ai/llm_explainer.py             │
│ ai/recommendations.py · ai/thresholds.py│      │ GPT-OSS-20B                     │
│ • personal baselines (z-score)          │      │ • explains the result           │
│ • sourced safety limits                 │      │ • answers crew questions        │
│ • multi-day patterns                    │      │ • CANNOT change the alert tier  │
│ • 3-day trend prediction                │      └─────────────────────────────────┘
│ • live space-weather rule               │
│ • DECIDES GREEN/YELLOW/RED              │
└────────────────────────────────────────┘
```

**Layer 1: analysis engine (always local, deterministic).** Pandas + NumPy. For every reading it:
- builds a **personal baseline** from the astronaut's previous 14 readings. The current reading is excluded, so an anomaly can't hide itself;
- checks **fixed safety limits**, each with a cited source ([threshold sources table](research/health_indicators.md#threshold-sources));
- flags readings that are **unusual for this astronaut**, but only when the deviation is strong (z > 3) or **persistent** (z > 2 on 2 of the last 3 days);
- detects **multi-day patterns**: sleep debt, sustained low mood, skipped exercise, and cumulative radiation against NASA's 600 mSv career limit;
- fits a **trend line** over the last 7 daily averages and warns if a vital is projected to cross a limit within 3 days;
- applies the **live NOAA solar radiation storm level** to the whole crew;
- **fails safe:** missing vitals, or data older than 36 h, produce **UNKNOWN**, never GREEN. Sensor values are carried forward for up to 12 h, so a self-report check-in isn't mistaken for a sensor dropout.

Only this layer sets the alert tier.

**Layer 2: language assistant (LLM).** Turns Layer 1's output into plain language and answers follow-up questions ("Why is my sleep flagged?"). It receives the already-computed tier, findings and actions, and is instructed never to change them. If the LLM is unreachable, the app falls back to template text.

### 🛰️ LLM deployment: demo vs. flight

| | **Hackathon demo** (default) | **Flight configuration** |
|---|---|---|
| Model | **GPT-OSS-20B** (OpenAI open-weight, Apache 2.0) | **The same GPT-OSS-20B** weights |
| Runs on | Groq cloud API | Onboard spacecraft computer (Ollama / llama.cpp / vLLM) |
| Internet needed | Yes | **No** |
| Setting | `LLM_PROVIDER=groq` | `LLM_PROVIDER=local` |

> ⚠️ **The Groq API is used *purely for demonstration purposes*.** It lets judges and teammates run the assistant on any laptop without downloading a ~14 GB model or owning a GPU. Once the astronaut leaves Earth, the identical open-weight model runs **locally on the spacecraft**, with no internet connection.

Why this is a credible path to flight:
- **Same model, not a substitute.** GPT-OSS-20B runs within about 16 GB of memory on a single GPU or edge device.
- **Same code.** Groq and local servers such as Ollama share the OpenAI-compatible Chat Completions API; switching is one environment variable.
- **Safety doesn't depend on the LLM.** Every alert, finding and action is computed by Layer 1, with or without the assistant.

To try the flight configuration locally:
```bash
ollama pull gpt-oss:20b
```
Then set `LLM_PROVIDER=local` in `.env`.

---

## 🔐 Access, Roles & Screens

The demo is behind a shared password, **`NASA`**, to keep bots out. After entering it, pick a role. Permissions are enforced by the API, not just hidden in the UI.

| | Astronaut | Crew Medical Officer | Ground Flight Surgeon |
|---|:-:|:-:|:-:|
| Home screen | **Today** | **Crew triage** | **Comms window** |
| Own status, readings, alerts | ✅ | ✅ | ✅ |
| Other astronauts | ❌ | ✅ | ✅ |
| Log data | own daily check-in | full readings for anyone | ❌ (read-only) |
| AI assistant | own data | anyone | anyone |
| Acknowledge alerts | ❌ | ✅ | ❌ |
| Advice to the crew | ❌ | ❌ | ✅ (crew sees it) |
| Mark comms window reviewed | ❌ | ❌ | ✅ |
| Live space weather | strip | strip | full panel + event log |
| Inspiration4 Labs | ❌ | ✅ | ✅ |

- **Astronaut, Today:** status with one main action (today's check-in), advice from the ground, problems that each come with their own action, a "Why?" chart and "Ask AI", reading tiles split into sensors and check-ins, and Trends and History tabs. The check-in asks only what a person can report; sensor values sit behind an "Enter manually (demo)" link.
- **CMO, Crew triage:** a queue of alerts waiting for acknowledgement, then the crew table sorted by urgency with 14-day trends. Selecting a crew member opens a side panel to acknowledge, log a reading or ask the AI.
- **Ground, Comms window:** updates since the last review, each with an advice box, plus the space-weather panel and crew trend charts.

> The password is a bot filter for a public demo, **not real authentication**: anyone who knows it can choose any role. A flight system would use individual crew credentials.

---

## 🛠️ Technology Stack
* **Frontend:** React + Tailwind CSS + Recharts (Vite); screens load after login
* **Backend & API:** Python + FastAPI
* **AI & Data Analysis:** Pandas + NumPy (Layer 1), GPT-OSS-20B via an OpenAI-compatible API (Layer 2)
* **Real data:** NOAA SWPC and NASA DONKI (live, via `httpx`), NASA OSDR CSVs (bundled in `data/osdr/`)
* **Database & Storage:** SQLite (local / onboard) or Postgres (Neon, for the hosted demo), chosen by `DATABASE_URL`
* **Offline:** a service worker caches the app and the last data
* **Quality Assurance:** Pytest (engine, API, roles, scenarios, space weather, labs, on SQLite and Postgres), Vitest + Testing Library, GitHub Actions CI

---

## ▶️ Running It

Prerequisites: Python 3.10+, Node.js 18+.

**1. Backend**

From the repository root, install the Python dependencies:
```bash
pip install -r backend/requirements.txt
```

Create your env file:
```bash
cp .env.example .env
```

Optionally fill in:
- `GROQ_API_KEY`, for live AI answers (free at console.groq.com).
- `NASA_API_KEY`, for the DONKI event log (free at api.nasa.gov). The shared `DEMO_KEY` runs out quickly.

Start the API:
```bash
uvicorn backend.main:app --reload
```
The API runs at http://localhost:8000 (interactive docs at `/docs`). With no `DATABASE_URL`, it uses SQLite: on first request it creates `backend/astroguardian.db` and seeds 21 days of calibrated simulated telemetry for three astronauts, shifted so the latest reading is today. Live space weather needs internet access; set `SPACE_WEATHER=off` to run fully offline.

**2. Frontend** (second terminal)
```bash
cd frontend && npm install && npm run dev
```
Open http://localhost:5173 and enter the password `NASA`.

**Single-process mode (as it would run aboard):** run `npm run build` in `frontend/`, then start only the backend. It serves the dashboard (with offline support) at http://localhost:8000.

**Tests**

Backend:
```bash
python -m pytest
```

Frontend:
```bash
cd frontend && npm test
```

The tests never touch the network: NOAA and DONKI are mocked. To also run the API tests against Postgres, set `TEST_DATABASE_URL` to a throwaway database. CI does this automatically.

**Demo data stays fresh:** with `DEMO_KEEP_FRESH=true` (default), if the newest reading is more than 20 h old, the whole timeline shifts forward by whole days. To start over completely:
```bash
python -m backend.seed --reset
```
To regenerate the simulated CSV, run `python data/generate_sample_data.py`.

---

## ☁️ Deploying to Vercel (Hobby) + Neon

Vercel serves the built React app from its CDN and runs FastAPI as a Python function (`api/index.py`). Its filesystem isn't persistent, so the hosted demo stores data in Neon Postgres.

1. Create a free project at [neon.tech](https://neon.tech) and copy its connection string (`postgresql://…?sslmode=require`).
2. Create the tables and demo data in Neon, from your machine:
   ```bash
   DATABASE_URL="postgresql://…" python -m backend.seed
   ```
3. Import the GitHub repo in Vercel with **Framework Preset: Other** and **Root Directory: the repository root**. `vercel.json` sets the build. Under **Settings → Environment Variables** add:
   - `DATABASE_URL`: the Neon string
   - `SECRET_KEY`: a random string, from `python -c "import secrets; print(secrets.token_hex(32))"`
   - `GROQ_API_KEY`: your Groq key
   - `NASA_API_KEY`: your NASA key, for the DONKI event log
   - optional: `DEMO_PASSWORD`
4. Deploy.

Notes:
- Vercel Hobby is for non-commercial use.
- Neon's free compute sleeps after 5 minutes idle, so the first request after a pause takes a moment. Open the app a minute before you present.
- Hosting is for the demo only. In flight, the same FastAPI app runs on the spacecraft computer with SQLite, just as the LLM moves from Groq to an onboard model.

### Demo crew
| Astronaut | Scenario | Expected status |
|---|---|---|
| ASTRO_01 · Cmdr. Elena Vasquez | Stable | 🟢 GREEN |
| ASTRO_02 · Dr. Kenji Mori | Overworked: heart rate creeping up, short sleep, rising fatigue, skipped exercise over a week. Caught by personal-baseline and multi-day-pattern rules | 🟡 YELLOW |
| ASTRO_03 · Amara Okafor | Acute event: SpO₂ 90%, HR 121 | 🔴 RED |

A real solar radiation storm of S3 or above would turn the whole crew YELLOW or RED automatically.

---

## 📂 Repository Structure
```text
AstroGuardian-AI/
├── api/                  # Vercel entry point (imports the FastAPI app)
├── frontend/             # React app: screens/ (Triage, GroundInbox, Labs), components/, service worker, Vitest tests
├── backend/              # FastAPI routes (main.py), roles (auth.py), alert lifecycle (service.py),
│                         #   storage (db.py), seed (seed.py), live space weather (space_weather.py),
│                         #   Inspiration4 labs (labs.py)
├── ai/                   # Layer 1 engine (baseline, risk_detection, recommendations, thresholds)
│                         #   + Layer 2 LLM assistant (llm_explainer.py)
├── data/                 # Calibrated simulated telemetry + generator; osdr/ = real NASA OSDR lab CSVs
├── research/             # Thresholds with sources, references, NASA HRP risk rationale
├── tests/                # Pytest: engine, API, roles, scenarios, space weather, labs
├── .github/workflows/    # CI: pytest on SQLite + Postgres, frontend tests and build
└── docs/                 # System architecture and user guide
```
## 👥 Team

* **Muhammad Hasnain**
* **Atta Ur Rehman**
* **Abu Bakr Armaghan Mansoor**
* **Mustafa Israr**
* **Shuraim141**
* **Abdul Rehman Javed**

---

## ⚠️ Disclaimer
AstroGuardian-AI is a hackathon prototype for decision support, not a medical device. Thresholds labelled **team rule** in the [sources table](research/health_indicators.md#threshold-sources) are this project's choices and need review by a flight surgeon. Crew vitals are simulated (calibrated where published figures exist). Space weather and Inspiration4 labs are real data used as described above.
