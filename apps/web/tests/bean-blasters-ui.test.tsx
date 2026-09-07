import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as ApiClientModule from "../src/lib/api-client.js";

import {
  STORAGE_PLAYER_ID,
  STORAGE_SEEN_HOW_TO,
  type ArenaResult,
  type ArenaRoomState,
} from "../src/features/bean-blasters/arena-contract.js";
import { BattleControls } from "../src/features/bean-blasters/BattleControls.js";
import { BattleHud } from "../src/features/bean-blasters/BattleHud.js";
import { BeanBlastersStartPage } from "../src/features/bean-blasters/BeanBlastersStartPage.js";
import { LobbyPage } from "../src/features/bean-blasters/BeanBlastersLobbyPage.js";
import { ResultsPage } from "../src/features/bean-blasters/BeanBlastersResultsPage.js";
import { CartProvider } from "../src/features/cart/CartProvider.js";
import { theme } from "../src/theme.js";

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  socketHolder: { socket: null as unknown },
  ioOptions: { last: null as unknown },
}));

vi.mock("../src/lib/api-client.js", async () => {
  const actual = await vi.importActual<typeof ApiClientModule>("../src/lib/api-client.js");

  return { ...actual, apiGet: mocks.apiGet, apiPost: mocks.apiPost };
});

vi.mock("socket.io-client", () => ({
  io: vi.fn((url: string, options: unknown) => {
    mocks.ioOptions.last = { url, options };

    return mocks.socketHolder.socket;
  }),
}));

const { ApiClientError } = await import("../src/lib/api-client.js");

type Listener = (...args: never[]) => void;

class FakeArenaSocket {
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
const ROOM_CODE = "BNXR";

const okResponse = <TData,>(data: TData) => ({
  success: true,
  data,
  meta: {},
  error: null,
});

const buildRoom = (overrides: Partial<ArenaRoomState> = {}): ArenaRoomState => ({
  code: ROOM_CODE,
  status: "LOBBY",
  arenaId: "roastery-floor",
  hostPlayerId: HOST_ID,
  players: [
    {
      playerId: HOST_ID,
      badgeNumber: 7,
      colour: "maroon",
      emoji: "☕",
      isReady: true,
      isConnected: true,
      isHost: true,
      hearts: 3,
      hits: 0,
      taken: 0,
      downs: 0,
    },
    {
      playerId: GUEST_ID,
      badgeNumber: 12,
      colour: "amber",
      emoji: null,
      isReady: false,
      isConnected: true,
      isHost: false,
      hearts: 3,
      hits: 0,
      taken: 0,
      downs: 0,
    },
  ],
  roundStartsAt: null,
  roundEndsAt: null,
  serverTime: "2026-09-07T10:00:00.000Z",
  ...overrides,
});

const buildResult = (): ArenaResult => ({
  roomCode: ROOM_CODE,
  arenaId: "roastery-floor",
  finishedAt: "2026-09-07T10:04:00.000Z",
  standings: [
    {
      badgeNumber: 7,
      colour: "maroon",
      emoji: "☕",
      rank: 1,
      hits: 9,
      taken: 3,
      downs: 1,
      disconnected: false,
      suspect: false,
    },
    {
      badgeNumber: 12,
      colour: "amber",
      emoji: null,
      rank: 2,
      hits: 2,
      taken: 9,
      downs: 3,
      disconnected: true,
      suspect: false,
    },
  ],
  payerBadgeNumber: 12,
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
  renderAt("/games/bean-blasters", "/games/bean-blasters", <BeanBlastersStartPage />);

const renderLobby = () =>
  renderAt(
    `/games/bean-blasters/lobby/${ROOM_CODE}`,
    "/games/bean-blasters/lobby/:code",
    <LobbyPage />,
  );

const renderResults = () =>
  renderAt(
    `/games/bean-blasters/results/${ROOM_CODE}`,
    "/games/bean-blasters/results/:code",
    <ResultsPage />,
  );

const currentSocket = (): FakeArenaSocket => mocks.socketHolder.socket as FakeArenaSocket;

const connectWith = async (room: ArenaRoomState) => {
  const socket = currentSocket();
  socket.helloResponse = { ok: true, state: room };

  await act(async () => {
    socket.trigger("connect");
    await Promise.resolve();
  });
};

/**
 * jsdom has no PointerEvent constructor, so build one from MouseEvent and pin
 * the two fields the controls actually read. React dispatches by event *type*,
 * not by constructor, so this reaches onPointerDown exactly like a real touch.
 */
const firePointer = (
  target: EventTarget,
  type: "pointerdown" | "pointermove" | "pointerup",
  init: { pointerId: number; clientX: number; clientY: number; pointerType?: string },
) => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: init.clientX,
    clientY: init.clientY,
  });

  Object.defineProperty(event, "pointerId", { value: init.pointerId });
  Object.defineProperty(event, "pointerType", { value: init.pointerType ?? "touch" });

  act(() => {
    target.dispatchEvent(event);
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

const HUD_BASE = {
  badgeNumber: 7,
  colourHex: "#6f3219",
  emoji: "☕",
  maxHearts: 3,
  hits: 4,
  ammo: 4,
  reloading: false,
  reloadProgress: 0,
  powerUp: null,
  powerUpRemainingMs: 0,
  scoreboard: [{ badgeNumber: 7, colourHex: "#6f3219", hits: 4, isSelf: true }],
  offline: false,
} as const;

describe("Bean Blasters UI", () => {
  beforeEach(() => {
    stubReducedMotion(false);
    mocks.socketHolder.socket = new FakeArenaSocket();
    mocks.ioOptions.last = null;
    mocks.apiGet.mockReset();
    mocks.apiPost.mockReset();
    mocks.apiGet.mockImplementation((path: string) => {
      if (path.includes("/api/arena/rooms/")) {
        return Promise.resolve(okResponse({ room: buildRoom() }));
      }

      if (path.includes("/api/arena/results/")) {
        return Promise.resolve(okResponse({ result: buildResult() }));
      }

      return Promise.resolve(okResponse({ enabled: true }));
    });
    mocks.apiPost.mockResolvedValue(
      okResponse({ playerId: HOST_ID, badgeNumber: 7, colour: "maroon", room: buildRoom() }),
    );
  });

  describe("how to play", () => {
    it("opens automatically on the first visit", async () => {
      renderStartPage();

      const dialog = await screen.findByRole("dialog", {
        name: /Bean Blasters in three cards/i,
      });
      expect(
        within(dialog).getByRole("heading", {
          name: "Left thumb moves. Right thumb aims and throws",
        }),
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
      ["ROOM_NOT_FOUND", 404, /No arena room with that code/i],
      ["ROOM_FULL", 409, /already has six baristas/i],
      ["ROOM_IN_PROGRESS", 409, /round has already started/i],
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
      await user.type(input, "b n 0 1 o i 7");

      expect(input).toHaveValue("BN7");
    });

    it("fires the wake-ping on mount", async () => {
      window.localStorage.setItem(STORAGE_SEEN_HOW_TO, "true");
      renderStartPage();

      await screen.findByRole("heading", { name: "Create a room" });
      expect(mocks.apiGet).toHaveBeenCalledWith("/api/arena/health", expect.anything());
    });
  });

  describe("lobby", () => {
    it("renders one numbered badge tile per player", async () => {
      renderLobby();
      await connectWith(buildRoom());

      const grid = await screen.findByRole("list", { name: "Players in this arena room" });
      const tiles = within(grid).getAllByRole("listitem");

      expect(tiles).toHaveLength(2);
      expect(tiles[0]).toHaveAccessibleName(/Badge 07, Maroon, Ready, you, host, Connected/);
      expect(tiles[1]).toHaveAccessibleName(/Badge 12, Amber, Not ready, Connected/);
    });

    it("connects on the arena socket path and namespace", async () => {
      renderLobby();
      await connectWith(buildRoom());

      // The identity comes from the join request, so the socket is not dialled
      // until that resolves — assert on the call, not on the render.
      await waitFor(() => expect(mocks.ioOptions.last).not.toBeNull());

      const call = mocks.ioOptions.last as {
        url: string;
        options: { path?: string };
      };

      // The whole isolation mechanism: its own namespace on its own path, so it
      // cannot collide with the kart game's socket server (BEAN-BLASTERS.md §8).
      expect(call.url.endsWith("/arena")).toBe(true);
      expect(call.options.path).toBe("/arena.io/");
    });

    it("enables the ready toggle and number picker inside the lobby", async () => {
      renderLobby();
      await connectWith(buildRoom());

      expect(await screen.findByRole("switch", { name: "Ready to blast" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "Badge 07" })).toBeEnabled();
    });

    it("disables the ready toggle and number picker outside the lobby", async () => {
      mocks.apiPost.mockResolvedValue(
        okResponse({
          playerId: HOST_ID,
          badgeNumber: 7,
          colour: "maroon",
          room: buildRoom({ status: "COUNTDOWN", roundStartsAt: "2026-09-07T10:00:03.000Z" }),
        }),
      );
      renderLobby();

      expect(await screen.findByRole("switch", { name: "Ready to blast" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Badge 07" })).toBeDisabled();
      expect(screen.queryByTestId("navigated-away")).not.toBeInTheDocument();
    });

    it("emits the ready state over the socket", async () => {
      const user = userEvent.setup();
      renderLobby();
      await connectWith(buildRoom());

      await user.click(await screen.findByRole("switch", { name: "Ready to blast" }));

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

  describe("battle HUD", () => {
    it("shows hearts, a clock counting down and the ammo strip", () => {
      const { rerender } = render(
        <ThemeProvider theme={theme}>
          <BattleHud {...HUD_BASE} hearts={3} remainingMs={120_000} />
        </ThemeProvider>,
      );

      expect(screen.getByTestId("battle-clock")).toHaveTextContent("2:00");
      expect(screen.getByTestId("battle-splashes")).toHaveTextContent("4 splashes");
      expect(
        within(screen.getByTestId("battle-ammo"))
          .getAllByTestId("battle-ammo-pip")
          .filter((pip) => pip.dataset.loaded === "true"),
      ).toHaveLength(4);

      rerender(
        <ThemeProvider theme={theme}>
          <BattleHud {...HUD_BASE} hearts={1} remainingMs={65_400} />
        </ThemeProvider>,
      );

      // Counting DOWN, not up.
      expect(screen.getByTestId("battle-clock")).toHaveTextContent("1:06");
      expect(screen.getByTestId("battle-hearts").children).toHaveLength(3);
    });

    it("shows the reload sweep and the offline chip", () => {
      render(
        <ThemeProvider theme={theme}>
          <BattleHud
            {...HUD_BASE}
            hearts={2}
            remainingMs={30_000}
            ammo={0}
            reloading
            reloadProgress={0.5}
            offline
          />
        </ThemeProvider>,
      );

      expect(screen.getByText("Refill break…")).toBeInTheDocument();
      expect(screen.getByText("Offline — reconnecting")).toBeInTheDocument();
    });
  });

  describe("battle controls", () => {
    const renderControls = () => {
      const onMove = vi.fn();
      const onAim = vi.fn();
      const onFiring = vi.fn();
      const onReload = vi.fn();

      render(
        <ThemeProvider theme={theme}>
          <BattleControls
            onMove={onMove}
            onAim={onAim}
            onFiring={onFiring}
            onReload={onReload}
            disabled={false}
            reducedMotion={false}
          />
        </ThemeProvider>,
      );

      return { onMove, onAim, onFiring, onReload };
    };

    it("drives the joystick and the aim zone from two simultaneous pointers", () => {
      const { onMove, onAim, onFiring } = renderControls();
      const moveZone = screen.getByTestId("battle-move-zone");
      const aimZone = screen.getByTestId("battle-aim-zone");

      // Two thumbs land at the same time, one per half of the screen.
      firePointer(moveZone, "pointerdown", { pointerId: 1, clientX: 80, clientY: 400 });
      firePointer(aimZone, "pointerdown", { pointerId: 2, clientX: 600, clientY: 400 });

      expect(onFiring).toHaveBeenLastCalledWith(true);
      expect(screen.getByTestId("battle-joystick")).toBeInTheDocument();
      expect(screen.getByTestId("battle-aim-line")).toBeInTheDocument();

      onMove.mockClear();
      onAim.mockClear();

      // The left thumb drags right; the right thumb drags straight up. Neither
      // may disturb the other — this is the multi-touch bug the spec calls out.
      firePointer(moveZone, "pointermove", { pointerId: 1, clientX: 136, clientY: 400 });
      firePointer(aimZone, "pointermove", { pointerId: 2, clientX: 600, clientY: 300 });

      expect(onMove).toHaveBeenCalledTimes(1);
      expect(onMove).toHaveBeenCalledWith(1, 0);
      expect(onAim).toHaveBeenCalledTimes(1);
      expect(onAim).toHaveBeenCalledWith(-Math.PI / 2);

      // Lifting the aim thumb stops the throwing but leaves movement running.
      onMove.mockClear();
      firePointer(aimZone, "pointerup", { pointerId: 2, clientX: 600, clientY: 300 });

      expect(onFiring).toHaveBeenLastCalledWith(false);
      expect(onMove).not.toHaveBeenCalled();
      expect(screen.getByTestId("battle-joystick")).toBeInTheDocument();

      firePointer(moveZone, "pointerup", { pointerId: 1, clientX: 136, clientY: 400 });
      expect(onMove).toHaveBeenLastCalledWith(0, 0);
    });

    it("moves with the keyboard and reloads with R", async () => {
      const user = userEvent.setup();
      const { onMove, onReload } = renderControls();

      await user.keyboard("{w>}");
      expect(onMove).toHaveBeenLastCalledWith(0, -1);

      await user.keyboard("{/w}");
      expect(onMove).toHaveBeenLastCalledWith(0, 0);

      await user.keyboard("r");
      expect(onReload).toHaveBeenCalledTimes(1);
    });

    it("reloads from the on-screen button", async () => {
      const user = userEvent.setup();
      const { onReload } = renderControls();

      await user.click(screen.getByTestId("battle-reload"));

      expect(onReload).toHaveBeenCalledTimes(1);
    });
  });

  describe("results", () => {
    it("reveals the payer with the non-binding disclaimer", async () => {
      renderResults();

      expect(
        await screen.findByRole("heading", { name: "Badge 12 buys the coffee" }),
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

      expect(currentSocket().emitted).toContainEqual({ event: "round:rematch", args: [] });
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

      await screen.findByRole("list", { name: "Players in this arena room" });
      await expectNoAutomatedViolations(container);
    });

    it("has no detectable violations on the results screen", async () => {
      const { container } = renderResults();

      await screen.findByRole("heading", { name: "Badge 12 buys the coffee" });
      await expectNoAutomatedViolations(container);
    });
  });
});
