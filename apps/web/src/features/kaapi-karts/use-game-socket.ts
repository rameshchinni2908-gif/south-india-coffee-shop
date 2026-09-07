import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

import { environment } from "../../config/environment.js";
import {
  GAME_SOCKET_NAMESPACE,
  type ClientToServerEvents,
  type GameErrorPayload,
  type GameRoomState,
  type ContactPayload,
  type GhostPayload,
  type RaceResult,
  type RoomStatus,
  type ServerToClientEvents,
} from "./game-contract.js";

export type GameClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export type GameConnectionStatus = "idle" | "connecting" | "connected" | "reconnecting" | "offline";

export interface CarUpdate {
  readonly carNumber?: number | null;
  readonly colour?: string | null;
  readonly emoji?: string | null;
}

export interface RacePosition {
  readonly x: number;
  readonly y: number;
  readonly heading: number;
  readonly lap: number;
  readonly progress: number;
}

export interface RaceFinish {
  readonly finishMs: number;
  readonly lapSplits: readonly number[];
}

export interface GameSocketApi {
  /** Latest authoritative room snapshot, or null before the first handshake. */
  readonly state: GameRoomState | null;
  readonly status: RoomStatus | null;
  readonly error: GameErrorPayload | null;
  readonly results: RaceResult | null;
  readonly connection: GameConnectionStatus;
  /** Add this to a server timestamp to get the equivalent local clock time. */
  readonly serverClockOffsetMs: number;
  subscribeToGhosts(listener: (ghost: GhostPayload) => void): () => void;
  /** Server-resolved ram verdicts for this room. */
  subscribeToContacts(listener: (contact: ContactPayload) => void): () => void;
  clearError(): void;
  setReady(isReady: boolean): void;
  setCar(update: CarUpdate): void;
  startRace(force: boolean): void;
  sendPosition(position: RacePosition): void;
  sendFinish(finish: RaceFinish): void;
  requestRematch(): void;
  leaveRoom(): void;
  reconnect(): void;
}

export interface UseGameSocketOptions {
  readonly code: string | null;
  readonly playerId: string | null;
  readonly enabled?: boolean;
}

const CLOCK_SAMPLE_INTERVAL_MS = 15_000;
const OFFSET_UPDATE_THRESHOLD_MS = 4;
const OFFLINE_AFTER_FAILURES = 3;

export const useGameSocket = ({
  code,
  playerId,
  enabled = true,
}: UseGameSocketOptions): GameSocketApi => {
  const socketRef = useRef<GameClientSocket | null>(null);
  const ghostsRef = useRef<Map<number, GhostPayload>>(new Map());
  const ghostListenersRef = useRef<Set<(ghost: GhostPayload) => void>>(new Set());
  const contactListenersRef = useRef<Set<(contact: ContactPayload) => void>>(new Set());
  const bestRoundTripRef = useRef(Number.POSITIVE_INFINITY);

  const [state, setState] = useState<GameRoomState | null>(null);
  const [error, setError] = useState<GameErrorPayload | null>(null);
  const [results, setResults] = useState<RaceResult | null>(null);
  const [connection, setConnection] = useState<GameConnectionStatus>("idle");
  const [serverClockOffsetMs, setServerClockOffsetMs] = useState(0);

  const isActive = Boolean(enabled && code && playerId);

  useEffect(() => {
    if (!enabled || !code || !playerId) {
      return;
    }

    // Deliberately NOT apiBaseUrl: in production that resolves to the Vercel
    // origin, whose /api rewrite cannot carry a WebSocket upgrade.
    const socket: GameClientSocket = io(`${environment.gameSocketUrl}${GAME_SOCKET_NAMESPACE}`, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Number.POSITIVE_INFINITY,
      reconnectionDelay: 500,
      reconnectionDelayMax: 8_000,
      randomizationFactor: 0.4,
      withCredentials: true,
    });

    socketRef.current = socket;
    bestRoundTripRef.current = Number.POSITIVE_INFINITY;

    let disposed = false;
    let failures = 0;

    const sampleClock = () => {
      const sentAt = Date.now();

      socket.emit("time:ping", (serverNow: number) => {
        if (disposed) {
          return;
        }

        const roundTrip = Date.now() - sentAt;

        // Keep the sample that spent the least time in flight — it carries the
        // smallest asymmetry error.
        if (roundTrip > bestRoundTripRef.current) {
          return;
        }

        bestRoundTripRef.current = roundTrip;
        const offset = sentAt + roundTrip / 2 - serverNow;

        setServerClockOffsetMs((current) =>
          Math.abs(current - offset) > OFFSET_UPDATE_THRESHOLD_MS ? offset : current,
        );
      });
    };

    socket.on("connect", () => {
      if (disposed) {
        return;
      }

      failures = 0;
      setConnection("connected");
      bestRoundTripRef.current = Number.POSITIVE_INFINITY;

      socket.emit("room:hello", { code, playerId }, (response) => {
        if (disposed) {
          return;
        }

        if (response.ok) {
          setState(response.state);
          setError(null);
        } else {
          setError(response.error);
        }
      });

      sampleClock();
    });

    socket.on("connect_error", () => {
      if (disposed) {
        return;
      }

      failures += 1;
      setConnection(failures >= OFFLINE_AFTER_FAILURES ? "offline" : "reconnecting");
    });

    socket.on("disconnect", (reason) => {
      if (disposed) {
        return;
      }

      setConnection(reason === "io client disconnect" ? "offline" : "reconnecting");
    });

    socket.on("room:state", (next) => {
      setState(next);

      const activeCars = new Set(next.players.map((player) => player.carNumber));

      for (const carNumber of Array.from(ghostsRef.current.keys())) {
        if (!activeCars.has(carNumber)) {
          ghostsRef.current.delete(carNumber);
        }
      }
    });

    socket.on("race:countdown", (payload) => {
      setState((current) =>
        current ? { ...current, status: "COUNTDOWN", raceStartsAt: payload.raceStartsAt } : current,
      );
    });

    socket.on("race:go", (payload) => {
      setState((current) =>
        current ? { ...current, status: "RACING", raceEndsAt: payload.raceEndsAt } : current,
      );
    });

    socket.on("race:ghost", (ghost) => {
      ghostsRef.current.set(ghost.carNumber, ghost);

      for (const listener of ghostListenersRef.current) {
        listener(ghost);
      }
    });

    socket.on("race:contact", (contact) => {
      for (const listener of contactListenersRef.current) {
        listener(contact);
      }
    });

    socket.on("race:results", (result) => {
      setResults(result);
      setState((current) => (current ? { ...current, status: "RESULTS" } : current));
    });

    socket.on("game:error", (payload) => {
      setError(payload);
    });

    const clockTimer = window.setInterval(sampleClock, CLOCK_SAMPLE_INTERVAL_MS);

    return () => {
      disposed = true;
      window.clearInterval(clockTimer);
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      ghostsRef.current.clear();
      setConnection("idle");
    };
  }, [code, enabled, playerId]);

  const subscribeToGhosts = useCallback((listener: (ghost: GhostPayload) => void) => {
    const listeners = ghostListenersRef.current;
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  }, []);

  const subscribeToContacts = useCallback((listener: (contact: ContactPayload) => void) => {
    const listeners = contactListenersRef.current;
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const setReady = useCallback((isReady: boolean) => {
    socketRef.current?.emit("lobby:setReady", { isReady });
  }, []);

  const setCar = useCallback((update: CarUpdate) => {
    socketRef.current?.emit("lobby:setCar", {
      carNumber: update.carNumber ?? null,
      colour: update.colour ?? null,
      emoji: update.emoji ?? null,
    });
  }, []);

  const startRace = useCallback((force: boolean) => {
    socketRef.current?.emit("race:start", { force });
  }, []);

  const sendPosition = useCallback((position: RacePosition) => {
    socketRef.current?.emit("race:pos", {
      x: position.x,
      y: position.y,
      heading: position.heading,
      lap: position.lap,
      progress: position.progress,
    });
  }, []);

  const sendFinish = useCallback((finish: RaceFinish) => {
    socketRef.current?.emit("race:finish", {
      finishMs: finish.finishMs,
      lapSplits: finish.lapSplits,
    });
  }, []);

  const requestRematch = useCallback(() => {
    socketRef.current?.emit("race:rematch");
  }, []);

  const leaveRoom = useCallback(() => {
    socketRef.current?.emit("room:leave");
  }, []);

  const reconnect = useCallback(() => {
    const socket = socketRef.current;

    if (!socket || socket.connected) {
      return;
    }

    setConnection("connecting");
    socket.connect();
  }, []);

  return {
    state,
    status: state?.status ?? null,
    error,
    results,
    // Derived rather than written from the effect: with no room or player yet
    // there is nothing to connect to, whatever a previous room left behind, and
    // an active room with untouched state is by definition still connecting.
    connection: isActive ? (connection === "idle" ? "connecting" : connection) : "idle",
    serverClockOffsetMs,
    subscribeToGhosts,
    subscribeToContacts,
    clearError,
    setReady,
    setCar,
    startRace,
    sendPosition,
    sendFinish,
    requestRematch,
    leaveRoom,
    reconnect,
  };
};
