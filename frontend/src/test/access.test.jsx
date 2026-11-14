import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import App from "../App.jsx";
import { RolePicker } from "../components/Access.jsx";
import { mockApi } from "./setup.js";

const STATE = {
  user: null,
  roles: [
    { id: "astronaut", label: "Astronaut", description: "Own data" },
    { id: "cmo", label: "Crew Medical Officer", description: "Whole crew" },
    { id: "ground", label: "Ground Flight Surgeon", description: "From Earth" },
  ],
  astronauts: [{ id: "ASTRO_02", name: "Dr. Kenji Mori", role: "Flight Engineer" }],
};

describe("access", () => {
  it("opens straight on the role picker, with no password", async () => {
    mockApi({ "GET /api/auth/state": STATE });
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Choose your role" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
  });

  it("requires choosing which astronaut before continuing as one", async () => {
    const calls = mockApi({ "POST /api/auth/role": { role: "astronaut" } });
    const onChosen = vi.fn();
    render(<RolePicker state={STATE} onChosen={onChosen} />);
    await userEvent.click(screen.getByRole("button", { name: /continue as astronaut/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/which astronaut/i);
    expect(calls).toHaveLength(0);

    await userEvent.selectOptions(screen.getByLabelText("I am"), "ASTRO_02");
    await userEvent.click(screen.getByRole("button", { name: /continue as astronaut/i }));
    await waitFor(() => expect(onChosen).toHaveBeenCalled());
    expect(calls[0].body).toEqual({ role: "astronaut", astronaut_id: "ASTRO_02" });
  });

  it("lists what each role can and cannot do", () => {
    render(<RolePicker state={STATE} onChosen={() => {}} />);
    const item = (text) => screen.getByText(text).closest("li");
    expect(within(item("Other astronauts' data")).getByRole("img", { name: "Cannot" })).toBeInTheDocument();
    expect(within(item("Run ground sync")).getByRole("img", { name: "Can" })).toBeInTheDocument();
    expect(within(item("Log readings")).getByRole("img", { name: "Cannot" })).toBeInTheDocument();
  });
});
