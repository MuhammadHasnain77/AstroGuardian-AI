import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import AlertsLog from "../components/AlertsLog.jsx";
import CheckIn from "../components/CheckIn.jsx";
import { headline, StatusBadge } from "../components/Status.jsx";
import GroundInbox from "../screens/GroundInbox.jsx";
import Triage from "../screens/Triage.jsx";
import { mockApi } from "./setup.js";

const users = {
  astronaut: { role: "astronaut", astronaut_id: "ASTRO_03", permissions: ["use_assistant", "submit_own_reading"] },
  cmo: { role: "cmo", permissions: ["view_all_crew", "acknowledge_alert", "submit_any_reading", "use_assistant"] },
  ground: { role: "ground", permissions: ["view_all_crew", "ground_note", "sync", "use_assistant"] },
};
const ALERT = {
  id: 7, astronaut_id: "ASTRO_03", astronaut_name: "Amara Okafor", risk_level: "RED", status: "open",
  opened_at: "2026-11-14T08:00:00+00:00", last_seen_at: "2026-11-14T09:00:00+00:00", occurrences: 3,
  findings: [{ message: "SpO2 90% is below the 92% critical limit." }], acknowledged: false,
  acknowledged_by: null, ground_note: null, synced: false,
};
const CREW = [
  { id: "ASTRO_01", name: "Elena Vasquez", role: "Commander", risk_level: "GREEN", findings: [], current: { heart_rate: 64 },
    series: {}, baseline: {}, open_alert: null, reading_timestamp: "2026-11-14T08:00:00+00:00" },
  { id: "ASTRO_03", name: "Amara Okafor", role: "Mission Specialist", risk_level: "RED",
    findings: [{ metric: "spo2", kind: "absolute", severity: "RED", label: "Blood oxygen (SpO2)" }],
    current: { heart_rate: 121, spo2: 90 }, series: {}, baseline: {}, open_alert: ALERT,
    reading_timestamp: "2026-11-14T08:00:00+00:00" },
];

describe("alert history", () => {
  it("CMO can acknowledge from history", async () => {
    mockApi({ "GET /api/alerts": [ALERT] });
    render(<AlertsLog user={users.cmo} onOpen={() => {}} />);
    expect(await screen.findByRole("button", { name: "Acknowledge" })).toBeInTheDocument();
    expect(screen.getByText(/seen 3×/)).toBeInTheDocument();
  });

  it("astronaut and ground get a read-only history", async () => {
    for (const role of ["astronaut", "ground"]) {
      mockApi({ "GET /api/alerts": [ALERT] });
      const { unmount } = render(<AlertsLog user={users[role]} onOpen={() => {}} />);
      await screen.findByText(/Awaiting CMO acknowledgement/);
      expect(screen.queryByRole("button", { name: "Acknowledge" })).not.toBeInTheDocument();
      unmount();
    }
  });
});

describe("CMO triage", () => {
  it("puts unacknowledged alerts in a queue, most urgent crew first", async () => {
    const calls = mockApi({ "POST /api/alerts/7/acknowledge": { ok: true } });
    let changed = 0;
    render(<Triage crew={CREW} user={users.cmo} onOpen={() => {}} onClose={() => {}} onChanged={() => changed++} />);
    const queue = screen.getByRole("region", { name: /waiting for your acknowledgement/i });
    expect(within(queue).getByText("Amara Okafor")).toBeInTheDocument();
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("Amara Okafor");
    await userEvent.click(within(queue).getByRole("button", { name: "Acknowledge" }));
    await waitFor(() => expect(changed).toBe(1));
    expect(calls.at(-1).key).toBe("POST /api/alerts/7/acknowledge");
  });
});

describe("ground comms window", () => {
  it("lists new updates with an advice box and marks the window reviewed", async () => {
    const calls = mockApi({
      "GET /api/alerts": [ALERT],
      "POST /api/alerts/7/note": { ok: true },
      "POST /api/sync/complete": { synced_alerts: 1 },
    });
    render(<GroundInbox crew={CREW} user={users.ground} onOpen={() => {}} onClose={() => {}} onChanged={() => {}} />);
    expect(await screen.findByText(/1 update from the spacecraft/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Advice to the crew"), "Rest and recheck SpO2 hourly");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => expect(calls.some((c) => c.key === "POST /api/alerts/7/note")).toBe(true));
    await userEvent.click(screen.getByRole("button", { name: /mark window reviewed/i }));
    await waitFor(() => expect(calls.some((c) => c.key === "POST /api/sync/complete")).toBe(true));
    expect(screen.queryByRole("button", { name: "Acknowledge" })).not.toBeInTheDocument();
  });
});

describe("astronaut check-in", () => {
  it("asks only self-report questions; sensor values are behind the demo link", async () => {
    const calls = mockApi({ "POST /api/astronauts/ASTRO_03/readings": { ok: true } });
    let saved = false;
    render(<CheckIn astronautId="ASTRO_03" current={{ heart_rate: 70, spo2: 98 }} onSaved={() => { saved = true; }} />);
    expect(screen.queryByLabelText(/Heart rate/)).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/Hours slept/), "6.5");
    await userEvent.click(screen.getByText("A little tired"));
    await userEvent.click(screen.getByRole("button", { name: /submit check-in/i }));
    await waitFor(() => expect(saved).toBe(true));
    expect(calls[0].body).toMatchObject({ sleep_hours: 6.5, fatigue: 4 });
    expect(calls[0].body).not.toHaveProperty("heart_rate");

    await userEvent.click(screen.getByRole("button", { name: /enter sensor values manually/i }));
    expect(screen.getByLabelText(/Heart rate/)).toBeInTheDocument();
  });
});

describe("status", () => {
  it.each([["GREEN", "Nominal"], ["YELLOW", "Caution"], ["RED", "Critical"], ["UNKNOWN", "Unknown"]])(
    "%s is labelled in text, not colour alone", (level, label) => {
      render(<StatusBadge level={level} />);
      expect(screen.getByText(level)).toBeInTheDocument();
      expect(screen.getByText(`· ${label}`)).toBeInTheDocument();
    });

  it("summarises findings in one line", () => {
    expect(headline([])).toMatch(/within your normal/);
    expect(headline([
      { metric: "fatigue", kind: "absolute" }, { metric: "sleep_hours", kind: "pattern" },
      { metric: "heart_rate", kind: "baseline" }, { metric: "mood", kind: "pattern" },
    ])).toBe("Fatigue, sleep debt and 2 more");
  });
});
