import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as ApiClientModule from "../src/lib/api-client.js";

import { CartProvider } from "../src/features/cart/CartProvider.js";
import {
  STORAGE_PLAYER_ID,
  STORAGE_SEEN_HOW_TO,
  type GameRoomState,
  type RaceResult,
} from "../src/features/kaapi-karts/game-contract.js";
import { KaapiKartsStartPage } from "../src/features/kaapi-karts/KaapiKartsStartPage.js";
import { LobbyPage } from "../src/features/kaapi-karts/LobbyPage.js";
import { RaceHud } from "../src/features/kaapi-karts/RaceHud.js";
import { ResultsPage } from "../src/features/kaapi-karts/ResultsPage.js";
import { theme } from "../src/theme.js";

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  socketHolder: { socket: null as unknown },
}));

vi.mock("../src/lib/api-client.js", async () => {
  const actual = await vi.importActual<typeof ApiClientModule>("../src/lib/api-client.js");

  return { ...actual, apiGet: mocks.apiGet, apiPost: mocks.apiPost };
});

vi.mock("socket.io-client", () => ({
  io: vi.fn(() => mocks.socketHolder.socket),
}));

const { ApiClientError } = await import("../src/lib/api-client.js");

type Listener = (...args: never[]) => void;

class FakeGameSocket {
  public connected = false;
  public readonly emitted: Array<{ event: string; args: unknown[] }> = [];
  public helloResponse: unknown = null;
  private readonly listeners = new Map<string, Set<Listener>>();

  public on(event: string, listener: Listener): this {
    const existing = this.listeners.get(event) ?? new Set<Listener>();
    existing.add(listener);
    this.listeners.set(event, existing);

    return this;
  }

  public off(event: string, listener: Listener): this {
    this.listeners.get(event)?.delete(listener);

    return this;
  }

  public removeAllListeners(): this {
    this.listeners.clear();

    return this;
  }

  public connect(): this {
    this.connected = true;

    return this;
  }

  public disconnect(): this {
    this.connected = false;

    return this;
  }

  public emit(event: string, ...args: unknown[]): this {
    this.emitted.push({ event, args });

    if (event === "time:ping" && typeof args[0] === "function") {
      (args[0] as (serverNow: number) => void)(Date.now());
    }

    if (event === "room:hello" && typeof args[1] === "function") {
      (args[1] as (response: unknown) => void)(
        this.helloResponse ?? {
          ok: false,
          error: { code: "ROOM_NOT_FOUND", message: "No such room" },
        },
      );
    }

    return this;
  }

  public trigger(event: string, ...args: unknown[]): void {
    for (const listener of Array.from(this.listeners.get(event) ?? [])) {
      (listener as (...values: unknown[]) => void)(...args);
    }
  }
}

const HOST_ID = "a1b2c3d4e5f60718293a4b5c6d7e8f90";
const GUEST_ID = "0123456789abcdef0123456789abcdef";
const ROOM_CODE = "KAPX";

const okResponse = <TData,>(data: TData) => ({
  success: true,
  data,
  meta: {},
  error: null,
});

const buildRoom = (overrides: Partial<GameRoomState> = {}): GameRoomState => ({
  code: ROOM_CODE,
  status: "LOBBY",
  trackId: "kaapi-circuit",
  hostPlayerId: HOST_ID,
  players: [
    {
      playerId: HOST_ID,
      carNumber: 7,
      colour: "maroon",
      emoji: "☕",
      isReady: true,
      isConnected: true,
      isHost: true,
    },
    {
      playerId: GUEST_ID,
      carNumber: 12,
      colour: "amber",
      emoji: null,
      isReady: false,
      isConnected: true,
      isHost: false,
    },
  ],
  raceStartsAt: null,
  raceEndsAt: null,
  serverTime: "2026-09-07T10:00:00.000Z",
  ...overrides,
});

const buildResult = (): RaceResult => ({
  roomCode: ROOM_CODE,
  trackId: "kaapi-circuit",
  finishedAt: "2026-09-07T10:04:00.000Z",
  standings: [
    {
      carNumber: 7,
      colour: "maroon",
      emoji: "☕",
      rank: 1,
      finishMs: 104_500,
      lapsCompleted: 3,
      progress: 3,
      disconnected: false,
      suspect: false,
    },
    {
      carNumber: 12,
      colour: "amber",
      emoji: null,
      rank: 2,
      finishMs: null,
      lapsCompleted: 2,
      progress: 2.4,
      disconnected: true,
      suspect: false,
    },
  ],
  payerCarNumber: 12,
});

const stubReducedMotion = (reduce: boolean) => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: reduce && query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
};

const renderAt = (path: string, routePath: string, element: ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });

  return render(
    <ThemeProvider theme={theme}>
      <QueryClientProvider client={queryClient}>
        <CartProvider>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path={routePath} element={element} />
              <Route path="*" element={<div data-testid="navigated-away" />} />
            </Routes>
          </MemoryRouter>
        </CartProvider>
      </QueryClientProvider>
    </ThemeProvider>,
  );
};

const renderStartPage = () =>
  renderAt("/games/kaapi-karts", "/games/kaapi-karts", <KaapiKartsStartPage />);

const renderLobby = () =>
  renderAt(
    `/games/kaapi-karts/lobby/${ROOM_CODE}`,
    "/games/kaapi-karts/lobby/:code",
    <LobbyPage />,
  );

const renderResults = () =>
  renderAt(
    `/games/kaapi-karts/results/${ROOM_CODE}`,
    "/games/kaapi-karts/results/:code",
    <ResultsPage />,
  );

const currentSocket = (): FakeGameSocket => mocks.socketHolder.socket as FakeGameSocket;

const connectWith = async (room: GameRoomState) => {
  const socket = currentSocket();
  socket.helloResponse = { ok: true, state: room };

  await act(async () => {
    socket.trigger("connect");
    await Promise.resolve();
  });
};

const expectNoAutomatedViolations = async (target: HTMLElement) => {
  const results = await axe.run(target, {
    rules: { "color-contrast": { enabled: false } },
  });

  expect(
    results.violations.map((violation) => ({
      id: violation.id,
      help: violation.help,
      targets: violation.nodes.flatMap((node) => node.target),
    })),
  ).toEqual([]);
};

describe("Kaapi Karts UI", () => {
  beforeEach(() => {
    stubReducedMotion(false);
    mocks.socketHolder.socket = new FakeGameSocket();
    mocks.apiGet.mockReset();
    mocks.apiPost.mockReset();
    mocks.apiGet.mockImplementation((path: string) => {
      if (path.includes("/api/game/rooms/")) {
        return Promise.resolve(okResponse({ room: buildRoom() }));
      }

      if (path.includes("/api/game/results/")) {
        return Promise.resolve(okResponse({ result: buildResult() }));
      }

      return Promise.resolve(okResponse({ enabled: true }));
    });
    mocks.apiPost.mockResolvedValue(
      okResponse({ playerId: HOST_ID, carNumber: 7, colour: "maroon", room: buildRoom() }),
    );
  });

  describe("how to play", () => {
    it("opens automatically on the first visit", async () => {
      renderStartPage();

      const dialog = await screen.findByRole("dialog", { name: /Kaapi Karts in three cards/i });
      expect(
        within(dialog).getByRole("heading", { name: "Hold left or right to steer" }),
      ).toBeInTheDocument();
    });

    it("stays closed once the player has seen it", async () => {
      window.localStorage.setItem(STORAGE_SEEN_HOW_TO, "true");
      renderStartPage();

      await screen.findByRole("heading", { name: "Create a room" });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("can be reopened and records that it was seen", async () => {
      window.localStorage.setItem(STORAGE_SEEN_HOW_TO, "true");
      const user = userEvent.setup();
      renderStartPage();

      await user.click(await screen.findByRole("button", { name: "How to play" }));
      const dialog = await screen.findByRole("dialog");

      await user.click(within(dialog).getByRole("button", { name: "Next" }));
      await user.click(
        within(dialog).getByRole("heading", { name: "Hit the glowing pads for a boost" }),
      );
      await user.click(within(dialog).getByRole("button", { name: "Next" }));
      await user.click(within(dialog).getByRole("button", { name: "Got it" }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(window.localStorage.getItem(STORAGE_SEEN_HOW_TO)).toBe("true");
    });

    it("renders the reduced-motion path without a slide transition", async () => {
      stubReducedMotion(true);
      renderStartPage();

      const carousel = await screen.findByTestId("how-to-carousel");
      expect(carousel).toHaveAttribute("data-motion", "reduced");
    });
  });

  describe("join errors", () => {
    it.each([
      ["ROOM_NOT_FOUND", 404, /No race room with that code/i],
      ["ROOM_FULL", 409, /already has six karts/i],
      ["ROOM_IN_PROGRESS", 409, /race has already started/i],
    ])("renders the %s message", async (code, status, expected) => {
      window.localStorage.setItem(STORAGE_SEEN_HOW_TO, "true");
      mocks.apiPost.mockRejectedValue(new ApiClientError(status, code, "Server said no"));
      const user = userEvent.setup();
      renderStartPage();

      await user.type(await screen.findByLabelText("Room code"), ROOM_CODE);
      await user.click(screen.getByRole("button", { name: "Join room" }));

      expect(await screen.findByText(expected)).toBeInTheDocument();
    });

    it("normalises a typed code to the unambiguous alphabet", async () => {
      window.localStorage.setItem(STORAGE_SEEN_HOW_TO, "true");
      const user = userEvent.setup();
      renderStartPage();

      const input = await screen.findByLabelText("Room code");
      // O, I, 0 and 1 are not in ROOM_CODE_ALPHABET, so they are dropped rather
      // than folded onto a look-alike that is equally absent from the alphabet.
      await user.type(input, "k a 0 1 o i 7");

      expect(input).toHaveValue("KA7");
    });
  });

  describe("lobby", () => {
    it("renders one numbered car tile per player", async () => {
      renderLobby();
      await connectWith(buildRoom());

      const grid = await screen.findByRole("list", { name: "Players in this race room" });
      const tiles = within(grid).getAllByRole("listitem");

      expect(tiles).toHaveLength(2);
      expect(tiles[0]).toHaveAccessibleName(/Car 07, Maroon, Ready, you, host, Connected/);
      expect(tiles[1]).toHaveAccessibleName(/Car 12, Amber, Not ready, Connected/);
    });

    it("enables the ready toggle and number picker inside the lobby", async () => {
      renderLobby();
      await connectWith(buildRoom());

      expect(await screen.findByRole("switch", { name: "Ready to race" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "Car 07" })).toBeEnabled();
    });

    it("disables the ready toggle and number picker outside the lobby", async () => {
      mocks.apiPost.mockResolvedValue(
        okResponse({
          playerId: HOST_ID,
          carNumber: 7,
          colour: "maroon",
          room: buildRoom({ status: "COUNTDOWN", raceStartsAt: "2026-09-07T10:00:03.000Z" }),
        }),
      );
      renderLobby();

      expect(await screen.findByRole("switch", { name: "Ready to race" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Car 07" })).toBeDisabled();
      expect(screen.queryByTestId("navigated-away")).not.toBeInTheDocument();
    });

    it("emits the ready state over the socket", async () => {
      const user = userEvent.setup();
      renderLobby();
      await connectWith(buildRoom());

      await user.click(await screen.findByRole("switch", { name: "Ready to race" }));

      expect(currentSocket().emitted).toContainEqual({
        event: "lobby:setReady",
        args: [{ isReady: false }],
      });
    });

    it("shows a retryable error when the room cannot be joined", async () => {
      mocks.apiPost.mockRejectedValue(new ApiClientError(410, "ROOM_CLOSED", "Closed"));
      renderLobby();

      expect(
        await screen.findByRole("heading", { name: "We could not join that room" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    });
  });

  describe("race HUD", () => {
    it("shows the lap counter and a running timer", () => {
      const hudProps = {
        carNumber: 7,
        colourHex: "#6f3219",
        emoji: "☕",
        totalLaps: 3,
        position: 2,
        fieldSize: 4,
        boostReady: true,
        standings: [{ carNumber: 7, colourHex: "#6f3219", isSelf: true }],
        offline: false,
      };
      const { rerender } = render(
        <ThemeProvider theme={theme}>
          <RaceHud {...hudProps} lap={2} elapsedMs={12_400} />
        </ThemeProvider>,
      );

      expect(screen.getByTestId("race-lap")).toHaveTextContent("Lap 2/3");
      expect(screen.getByTestId("race-clock")).toHaveTextContent("0:12.4");

      rerender(
        <ThemeProvider theme={theme}>
          <RaceHud {...hudProps} lap={3} elapsedMs={71_050} />
        </ThemeProvider>,
      );

      expect(screen.getByTestId("race-lap")).toHaveTextContent("Lap 3/3");
      expect(screen.getByTestId("race-clock")).toHaveTextContent("1:11.0");
    });

    it("shows the offline chip when the socket has dropped", () => {
      render(
        <ThemeProvider theme={theme}>
          <RaceHud
            carNumber={7}
            colourHex="#6f3219"
            emoji={null}
            lap={1}
            totalLaps={3}
            elapsedMs={0}
            position={1}
            fieldSize={2}
            boostReady={false}
            standings={[]}
            offline
          />
        </ThemeProvider>,
      );

      expect(screen.getByText("Offline — still racing")).toBeInTheDocument();
    });
  });

  describe("results", () => {
    it("reveals the payer with the non-binding disclaimer", async () => {
      renderResults();

      expect(
        await screen.findByRole("heading", { name: "Car 12 buys the coffee" }),
      ).toBeInTheDocument();
      expect(screen.getByText(/settle the bill however you like/i)).toBeInTheDocument();
      expect(screen.getByText("Waiting for the host to start a rematch…")).toBeInTheDocument();
    });

    it("offers a rematch to the host", async () => {
      window.localStorage.setItem(STORAGE_PLAYER_ID, HOST_ID);
      const user = userEvent.setup();
      renderResults();

      await connectWith(buildRoom({ status: "RESULTS" }));
      await user.click(await screen.findByRole("button", { name: "Rematch" }));

      expect(currentSocket().emitted).toContainEqual({ event: "race:rematch", args: [] });
    });
  });

  describe("accessibility", () => {
    it("has no detectable violations on the join screen", async () => {
      window.localStorage.setItem(STORAGE_SEEN_HOW_TO, "true");
      const { container } = renderStartPage();

      await screen.findByRole("heading", { name: "Create a room" });
      await expectNoAutomatedViolations(container);
    });

    it("has no detectable violations in the how-to dialog", async () => {
      renderStartPage();

      const dialog = await screen.findByRole("dialog");
      await expectNoAutomatedViolations(dialog);
    });

    it("has no detectable violations in the lobby", async () => {
      const { container } = renderLobby();
      await connectWith(buildRoom());

      await screen.findByRole("list", { name: "Players in this race room" });
      await expectNoAutomatedViolations(container);
    });

    it("has no detectable violations on the results screen", async () => {
      const { container } = renderResults();

      await screen.findByRole("heading", { name: "Car 12 buys the coffee" });
      await expectNoAutomatedViolations(container);
    });
  });
});
