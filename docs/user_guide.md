# User Guide

## Getting in
Enter the access password **NASA**, then choose a role. Each role lands on its own home screen. Use the ⇄ icon in the header to switch role, and the exit icon to lock the app.

| Status | Meaning | What to do |
|---|---|---|
| 🟢 GREEN · Nominal | Within your personal normal and safety limits | Continue operations |
| 🟡 YELLOW · Caution | Drift from your normal, a multi-day pattern, or a predicted problem | Follow the actions on each item and re-check |
| 🔴 RED · Critical | A safety limit was crossed | Stop non-essential tasks, notify the CMO now |
| ⚪ UNKNOWN | Required data missing or too old | Check sensors, take a new reading |

## Astronaut: Today
- **Status, at the top.** A one-line reason and one main button: **Start today's check-in** (or **Update check-in** once done). **Explain my status** opens the AI assistant.
- **Space weather**, live from NOAA: the current solar radiation storm level and ≥10 MeV proton flux. A strong (S3) storm turns everyone's status YELLOW (postpone EVAs); a severe one (S4+) turns it RED (go to the radiation shelter).
- **Advice from the ground flight surgeon**, pinned under the status when there is any.
- **Needs attention.** Each problem shows what was found and, directly under it, what to do.
  - **Why?** expands the chart for that measure, your normal, and where the rule comes from.
  - **Ask AI about this** opens the assistant already asking about that problem.
- **Your readings.** Today's value next to your normal, with a 14-day trend. Tiles are split into *wearable sensors* and *your check-ins*. Tap a tile for its full chart.
- **Career radiation dose**, against NASA's 600 mSv limit.
- **Tabs:** *Trends* has full charts and a table; *History* has your past alerts.

**Daily check-in.** Only what you can report yourself: hours slept, exercise minutes, fatigue (Samn-Perelli 1–7, each with its description), mood and stress. Sensor values arrive from the wearable. For demos, **Enter sensor values manually (demo)** reveals those fields.

## Crew Medical Officer: Crew triage
- **Space weather** strip, live from NOAA.
- **Waiting for your acknowledgement:** new or worsened alerts, with **Review** and **Acknowledge**.
- **Crew table:** most urgent first, with the main issue, heart rate, SpO₂ and sleep, plus 14-day trends against each person's normal band.
- Select a crew member to open their view in a **side panel**, where you can acknowledge, **Log reading** (full vitals) and ask the AI. The table stays behind it.
- **Labs** and **Alert history** are in the header.

## Ground flight surgeon: Comms window
- **New since last review:** everything that arrived from the spacecraft, with findings and an **Advice to the crew** box on each open alert. The crew sees your advice on their Today screen.
- **Mark window reviewed** when you're done; the count in the header clears.
- **Space weather:** the live solar radiation level, a 24-hour proton flux chart (log scale, with NOAA's S1/S3/S4 storm levels marked), and NASA DONKI's list of solar particle events from the last 30 days.
- **Crew trends:** heart rate, SpO₂, sleep and fatigue for all crew on shared charts, for comparison.
- Select a name to open that crew member's view (read-only vitals).

## Labs (CMO and ground)
Real blood tests from the four SpaceX Inspiration4 crew members (NASA OSDR studies OSD-575 and OSD-569). These are a reference crew, not the simulated astronauts.
- Pick a crew member (C001–C004) and a panel (metabolic or blood count).
- Each test shows the lab's reference range, the person's **pre-flight baseline** (mean of 3 draws), the value **the day after return**, the change, and a mini-chart of all 7 draws from 92 days before launch to 194 days after.
- Results outside the reference range are listed first and marked high or low; changes of 20% or more are highlighted. Tick **Only notable** to hide the rest.
- A draw that fails the data-quality check is excluded, with a note below the table.

## About the data
Space weather and labs are real. Crew vitals are simulated, because no public in-flight astronaut vitals exist; sleep, radiation dose and exercise are calibrated to published ISS figures. See the README's "Real data vs. simulated data" section.

## Offline
If the server can't be reached, the app keeps showing the last data it saw, with a banner giving the time. Check-ins can't be saved offline: you'll see an error rather than losing them silently.
