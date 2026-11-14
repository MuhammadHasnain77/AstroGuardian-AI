import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { SpaceWeatherPanel, SpaceWeatherStrip } from "../components/SpaceWeather.jsx";
import Labs from "../screens/Labs.jsx";
import { mockApi } from "./setup.js";

const series = (pfu) => ({ series: [{ t: "2026-11-14T10:00:00Z", pfu: 0.2 }, { t: "2026-11-14T11:00:00Z", pfu }] });

describe("space weather", () => {
  it("shows a quiet sun with its live source", () => {
    render(<SpaceWeatherStrip sw={{ source: "noaa", s_level: 0, s_text: "No radiation storm", proton_10mev_pfu: 0.23,
                                    source_label: "NOAA SWPC · GOES-18", observed_at: new Date().toISOString(), fresh: true, ...series(0.23) }} />);
    expect(screen.getByText("No radiation storm")).toBeInTheDocument();
    expect(screen.getByText(/0\.23 pfu · NOAA SWPC · GOES-18/)).toBeInTheDocument();
  });

  it("says so when no source is reachable, instead of showing nothing", () => {
    render(<SpaceWeatherStrip sw={{ source: "unavailable" }} />);
    expect(screen.getByText(/Space weather unavailable/)).toBeInTheDocument();
  });

  it("distinguishes 'no events' from 'event log unavailable'", () => {
    const base = { source: "noaa", s_level: 0, s_text: "No radiation storm", proton_10mev_pfu: 0.2, source_label: "NOAA", ...series(0.2) };
    const { unmount } = render(<SpaceWeatherPanel sw={{ ...base, events: [], events_available: true }} />);
    expect(screen.getByText("None reported.")).toBeInTheDocument();
    unmount();
    render(<SpaceWeatherPanel sw={{ ...base, events: [], events_available: false, errors: ["DONKI: HTTPStatusError"] }} />);
    expect(screen.getByText(/event log unavailable \(request limit reached; set NASA_API_KEY\)/)).toBeInTheDocument();
  });
});

const LABS = {
  mission: "SpaceX Inspiration4", crew: ["C001", "C003"], timepoints: [], pre_flight: [], notable_change_pct: 20,
  sources: [{ study: "OSD-575", name: "Metabolic panel", url: "https://osdr.nasa.gov/bio/repo/data/studies/OSD-575" }],
  note: "Real data from NASA OSDR.",
  analytes: [
    { id: "sodium", panel: "cmp", panel_name: "Metabolic panel", name: "Sodium", unit: "mmol/L", crew: {
      C001: { series: [], baseline: 140, r1: 141, change_pct: 0.7, range: [135, 146], r1_out_of_range: false, notable: false },
      C003: { series: [], baseline: 141, r1: 140, change_pct: -0.7, range: [135, 146], r1_out_of_range: false, notable: false } } },
    { id: "potassium", panel: "cmp", panel_name: "Metabolic panel", name: "Potassium", unit: "mmol/L", crew: {
      C001: { series: [], baseline: 4.2, r1: 4.1, change_pct: -2.4, range: [3.5, 5.3], r1_out_of_range: false, notable: false },
      C003: { series: [], baseline: 3.5, r1: 3.0, change_pct: -14.3, range: [3.5, 5.3], r1_out_of_range: true, notable: true } } },
  ],
};

describe("labs", () => {
  it("puts out-of-range results first and filters to notable", async () => {
    mockApi({ "GET /api/labs": LABS });
    render(<Labs />);
    await userEvent.click(await screen.findByRole("button", { name: "C003" }));
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("Potassium");
    expect(within(rows[0]).getByText("low")).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Only notable"));
    expect(screen.getAllByRole("row")).toHaveLength(2);
    expect(screen.getByRole("link", { name: /OSD-575/ })).toHaveAttribute("href", LABS.sources[0].url);
  });
});
