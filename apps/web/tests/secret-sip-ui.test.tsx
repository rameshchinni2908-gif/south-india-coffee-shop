import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SecretSipStart, SipRound } from "../src/features/secret-sip/SecretSipPage.js";
import type { SipState } from "../src/features/secret-sip/sip-contract.js";
import { theme } from "../src/theme.js";

const mocks = vi.hoisted(() => ({ create: vi.fn(), join: vi.fn(), health: vi.fn() }));
vi.mock("../src/features/secret-sip/sip-api.js", () => ({
  createSipRoom: mocks.create,
  joinSipRoom: mocks.join,
  pingSip: mocks.health,
  loadSipIdentity: () => null,
  saveSipIdentity: vi.fn(),
  forgetSipIdentity: vi.fn(),
}));
const fixture = (overrides: Partial<SipState> = {}): SipState => ({
  code: "ABCDE",
  round: 1,
  phase: "LOBBY",
  hostId: "one",
  youId: "one",
  serverNow: 1000,
  deadline: null,
  turnId: null,
  category: null,
  role: null,
  word: null,
  yourVote: null,
  result: null,
  players: ["one", "two", "three"].map((id, i) => ({
    id,
    seat: i + 1,
    connected: true,
    ready: false,
    score: 0,
    voted: false,
  })),
  ...overrides,
});
const wrap = (child: React.ReactNode) =>
  render(
    <ThemeProvider theme={theme}>
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
          })
        }
      >
        <MemoryRouter>{child}</MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  );
const round = (state: SipState, connected = true) => {
  const send = vi.fn();
  const view = wrap(
    <SipRound state={state} connected={connected} pending={false} send={send} seconds={12} />,
  );
  return { ...view, send };
};

describe("Secret Sip mobile interface", () => {
  beforeEach(() => {
    mocks.health.mockResolvedValue({ data: { enabled: true } });
    mocks.create.mockReset();
    mocks.join.mockReset();
  });
  it("shows rules and reports creation errors without losing the join controls", async () => {
    const user = userEvent.setup();
    mocks.create.mockRejectedValue(new Error("All tables are busy."));
    wrap(<SecretSipStart />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Create a table/ })).toBeEnabled(),
    );
    await user.click(screen.getByRole("button", { name: /Create a table/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("All tables are busy");
    expect(screen.getByLabelText("Got a table code?")).toBeInTheDocument();
  });
  it("validates and normalizes room codes before joining", async () => {
    const user = userEvent.setup();
    mocks.join.mockRejectedValue(new Error("This table has closed."));
    wrap(<SecretSipStart />);
    const joinButton = screen.getByRole("button", { name: /Join/ });
    expect(joinButton).toBeDisabled();
    await user.type(screen.getByLabelText("Got a table code?"), "abcde");
    await user.click(joinButton);
    expect(mocks.join).toHaveBeenCalledWith("ABCDE");
    expect(await screen.findByRole("alert")).toHaveTextContent("closed");
  });
  it("requires all players ready and disables game actions when disconnected", async () => {
    const t = round(fixture());
    expect(screen.getByRole("button", { name: /Deal secret roles/ })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "I’m ready" }));
    expect(t.send).toHaveBeenCalledWith({ type: "ready", ready: true, round: 1 });
    t.unmount();
    round(fixture(), false);
    expect(screen.getByRole("button", { name: "I’m ready" })).toBeDisabled();
  });
  it("keeps the private card out of the DOM until tapped and hides it on blur", async () => {
    round(
      fixture({
        phase: "REVEAL",
        role: "REGULAR",
        word: "Filter coffee",
        category: "Café favourites",
      }),
    );
    expect(screen.queryByText("Filter coffee")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reveal your secret role" }));
    expect(screen.getByText("Filter coffee")).toBeInTheDocument();
    fireEvent.blur(window);
    expect(screen.queryByText("Filter coffee")).not.toBeInTheDocument();
  });
  it("shows a bluffer only their role and category", async () => {
    round(fixture({ phase: "REVEAL", role: "BLUFFER", category: "Weekend plans" }));
    await userEvent.click(screen.getByRole("button", { name: "Reveal your secret role" }));
    expect(screen.getByText("You’re the bluffer.")).toBeInTheDocument();
    expect(screen.getByText(/Category: Weekend plans/)).toBeInTheDocument();
  });
  it("allows only the current player to advance their spoken clue", () => {
    const t = round(fixture({ phase: "CLUES", turnId: "two", role: "REGULAR", word: "Coffee" }));
    expect(screen.queryByRole("button", { name: /given my clue/ })).not.toBeInTheDocument();
    t.unmount();
    round(fixture({ phase: "CLUES", turnId: "one", role: "REGULAR", word: "Coffee" }));
    expect(screen.getByRole("button", { name: /given my clue/ })).toBeEnabled();
  });
  it("selects then locks a vote and cannot vote for yourself", async () => {
    const t = round(fixture({ phase: "VOTING", role: "REGULAR", word: "Coffee" }));
    expect(screen.getByRole("button", { name: "Lock my vote" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Cup 1" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cup 2" }));
    await userEvent.click(screen.getByRole("button", { name: "Lock my vote" }));
    expect(t.send).toHaveBeenCalledWith({ type: "vote", round: 1, targetId: "two" });
    t.unmount();
    round(fixture({ phase: "VOTING", role: "REGULAR", yourVote: "two" }));
    expect(screen.queryByRole("button", { name: "Lock my vote" })).not.toBeInTheDocument();
    expect(screen.getByText("Your vote is locked.")).toBeInTheDocument();
  });
  it("gives only the bluffer a last-guess form and submits their answer", async () => {
    const t = round(fixture({ phase: "GUESS", role: "BLUFFER" }));
    await userEvent.type(screen.getByLabelText("Your one final guess"), "kaapi");
    await userEvent.click(screen.getByRole("button", { name: "Make my final guess" }));
    expect(t.send).toHaveBeenCalledWith({ type: "guess", round: 1, word: "kaapi" });
    t.unmount();
    round(fixture({ phase: "GUESS", role: "REGULAR" }));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
  it("renders results and host rematch controls", async () => {
    const t = round(
      fixture({
        phase: "RESULTS",
        result: {
          winner: "TABLE",
          reason: "CAUGHT",
          word: "Idli",
          blufferId: "two",
          guess: null,
          votes: [],
        },
      }),
    );
    expect(screen.getByRole("heading", { name: "The table wins!" })).toBeInTheDocument();
    expect(screen.getByText("Idli")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Another round/ }));
    expect(t.send).toHaveBeenCalledWith({ type: "rematch", round: 1 });
  });
  it("has accessible start and voting screens", async () => {
    const start = wrap(<SecretSipStart />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Create a table/ })).toBeEnabled(),
    );
    expect(
      (await axe.run(start.container, { rules: { "color-contrast": { enabled: false } } }))
        .violations,
    ).toEqual([]);
    start.unmount();
    const vote = round(fixture({ phase: "VOTING", role: "REGULAR" }));
    expect(
      (await axe.run(vote.container, { rules: { "color-contrast": { enabled: false } } }))
        .violations,
    ).toEqual([]);
  });
});
