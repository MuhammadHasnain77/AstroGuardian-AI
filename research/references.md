# References & Data Sources

## Scientific & Medical Frameworks
1. **NASA Human Research Program (HRP):** Human Research Roadmap (HRR) - Cardiovascular, Behavioral Health, and Fatigue Risk Sectors.
2. **Canadian Space Agency (CSA):** Bio-Monitor physiological tracking standards for long-duration spaceflight.
3. **NASA Flight Medicine Protocols:** Standard operational guidelines for Crew Medical Officers (CMO) aboard the International Space Station (ISS).

## Software Frameworks & Libraries
* **Python Engine:** Pandas (data processing), NumPy (numerical analysis), Pytest (quality assurance).
* **Backend Integration:** FastAPI asynchronous web framework.
* **Frontend Dashboard:** React, Tailwind CSS, Lucide icons.
* **Data Simulation:** Custom generative scripts simulating zero-g physiological drift based on published space medicine baselines.

## Real Data Used by the App
* **NOAA Space Weather Prediction Center:** GOES integral proton flux, live JSON at `services.swpc.noaa.gov/json/goes/primary/` ([product page](https://www.spaceweather.gov/products/goes-proton-flux)); [NOAA Space Weather Scales](https://www.spaceweather.gov/noaa-scales-explanation).
* **NASA DONKI** (Space Weather Database Of Notifications, Knowledge, Information): solar energetic particle events, `api.nasa.gov/DONKI/SEP` ([CCMC DONKI](https://ccmc.gsfc.nasa.gov/tools/DONKI)).
* **NASA Open Science Data Repository:** SpaceX Inspiration4 [OSD-575](https://osdr.nasa.gov/bio/repo/data/studies/OSD-575) (comprehensive metabolic panel) and [OSD-569](https://osdr.nasa.gov/bio/repo/data/studies/OSD-569) (complete blood count); see [Inspiration4 data access through the NASA OSDR](https://www.nature.com/articles/s41526-024-00393-5), *npj Microgravity* 2024.

## Calibration Sources
* Barger L.K. et al. (2014). Prevalence of sleep deficiency and use of hypnotics in astronauts before, during, and after spaceflight. *Lancet Neurology* 13(9). [PMC4188436](https://pmc.ncbi.nlm.nih.gov/articles/PMC4188436)
* Berger T. et al. (2017). DOSIS & DOSIS 3D: radiation measurements with the DOSTEL instruments onboard the Columbus Laboratory of the ISS in the years 2009–2016. *J. Space Weather Space Clim.* 7, A8. [Link](https://www.swsc-journal.org/articles/swsc/full_html/2017/01/swsc160046/swsc160046.html)

## Restricted Data (not used)
* Individual astronaut medical and monitoring data are available only through an approved request to the [NASA Life Sciences Data Archive](https://nlsp.nasa.gov/explore/lsdahome).
