import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

import { environment } from "../../config/environment.js";
import {
  ARENA_SOCKET_NAMESPACE,
  ARENA_SOCKET_PATH,
  type ArenaAmmoPayload,
  type ArenaErrorPayload,
  type ArenaGhostPayload,
  type ArenaHitPayload,
  type ArenaPadPayload,
  type ArenaPowerPayload,
  type ArenaRespawnPayload,
  type ArenaResult,
  type ArenaRoomState,
  type ArenaScoreEntry,
  type ArenaShotPayload,
  type ClientToServerEvents,
  type RoomStatus,
  type ServerToClientEvents,
} from "./arena-contract.js";

export type ArenaClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export type ArenaConnectionStatus =
  "idle" | "connecting" | "connected" | "reconnecting" | "offline";

export interface BadgeUpdate {
  readonly badgeNumber?: number | null;
  readonly colour?: string | null;
  readonly emoji?: string | null;
}

export interface ArenaPose {
  readonly x: number;
  readonly y: number;
  readonly aim: number;
}

export interface ArenaFire {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
}

export interface ArenaSocketApi {
  /** Latest authoritative room snapshot, or null before the first handshake. */
  readonly state: ArenaRoomState | null;
  readonly status: RoomStatus | null;
  readonly error: ArenaErrorPayload | null;
  readonly results: ArenaResult | null;
  readonly scores: readonly ArenaScoreEntry[];
  readonly connection: ArenaConnectionStatus;
  /** Add this to a server timestamp to get the equivalent local clock time. */
  readonly serverClockOffsetMs: number;
  subscribeToGhosts(listener: (ghost: ArenaGhostPayload) => void): () => void;
  subscribeToShots(listener: (shot: ArenaShotPayload) => void): () => void;
  /** Server-resolved splash verdicts. Clients never decide a hit themselves. */
  subscribeToHits(listener: (hit: ArenaHitPayload) => void): () => void;
  subscribeToRespawns(listener: (respawn: ArenaRespawnPayload) => void): () => void;
  subscribeToAmmo(listener: (ammo: ArenaAmmoPayload) => void): () => void;
  subscribeToPads(listener: (pad: ArenaPadPayload) => void): () => void;
  subscribeToPowers(listener: (power: ArenaPowerPayload) => void): () => void;
  clearError(): void;
  setReady(isReady: boolean): void;
  setBadge(update: BadgeUpdate): void;
  startRound(force: boolean): void;
  sendPosition(pose: ArenaPose): void;
  sendFire(fire: ArenaFire): void;
  requestReload(): void;
  requestRematch(): void;
  leaveRoom(): void;
  reconnect(): void;
}

export interface UseArenaSocketOptions {
  readonly code: string | null;
  readonly playerId: string | null;
  readonly enabled?: boolean;
}

const CLOCK_SAMPLE_INTERVAL_MS = 15_000;
const OFFSET_UPDATE_THRESHOLD_MS = 4;
const OFFLINE_AFTER_FAILURES = 3;

type Listeners<TPayload> = Set<(payload: TPayload) => void>;

const notify = <TPayload>(listeners: Listeners<TPayload>, payload: TPayload): void => {
  for (const listener of listeners) {
    listener(payload);
  }
};

/** Module scope so the useCallback wrappers below have no extra dependency. */
const subscribe = <TPayload>(
  listenersRef: { current: Listeners<TPayload> },
  listener: (payload: TPayload) => void,
): (() => void) => {
  const listeners = listenersRef.current;
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
};

/**
 * Bean Blasters connects to its OWN Socket.IO server: its own `path` and its own
 * namespace (BEAN-BLASTERS.md §8). That is the whole isolation mechanism — the
 * kart game's socket server sits on the default `/socket.io/` path and neither
 * side has to know the other exists.
 */
export const useArenaSocket = ({
  code,
  playerId,
  enabled = true,
}: UseArenaSocketOptions): ArenaSocketApi => {
  const socketRef = useRef<ArenaClientSocket | null>(null);
  const ghostListenersRef = useRef<Listeners<ArenaGhostPayload>>(new Set());
  const shotListenersRef = useRef<Listeners<ArenaShotPayload>>(new Set());
  const hitListenersRef = useRef<Listeners<ArenaHitPayload>>(new Set());
  const respawnListenersRef = useRef<Listeners<ArenaRespawnPayload>>(new Set());
  const ammoListenersRef = useRef<Listeners<ArenaAmmoPayload>>(new Set());
  const padListenersRef = useRef<Listeners<ArenaPadPayload>>(new Set());
  const powerListenersRef = useRef<Listeners<ArenaPowerPayload>>(new Set());
  const bestRoundTripRef = useRef(Number.POSITIVE_INFINITY);

  const [state, setState] = useState<ArenaRoomState | null>(null);
  const [error, setError] = useState<ArenaErrorPayload | null>(null);
  const [results, setResults] = useState<ArenaResult | null>(null);
  const [scores, setScores] = useState<readonly ArenaScoreEntry[]>([]);
  const [connection, setConnection] = useState<ArenaConnectionStatus>("idle");
  const [serverClockOffsetMs, setServerClockOffsetMs] = useState(0);

  const isActive = Boolean(enabled && code && playerId);

  useEffect(() => {
    if (!enabled || !code || !playerId) {
      return;
    }

    // Deliberately NOT apiBaseUrl: in production that resolves to the Vercel
    // origin, whose /api rewrite cannot carry a WebSocket upgrade.
    const socket: ArenaClientSocket = io(`${environment.gameSocketUrl}${ARENA_SOCKET_NAMESPACE}`, {
      path: ARENA_SOCKET_PATH,
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
    });

    socket.on("round:countdown", (payload) => {
      setState((current) =>
        current
          ? { ...current, status: "COUNTDOWN", roundStartsAt: payload.roundStartsAt }
          : current,
      );
    });

    socket.on("round:go", (payload) => {
      setState((current) =>
        current ? { ...current, status: "BATTLE", roundEndsAt: payload.roundEndsAt } : current,
      );
    });

    socket.on("arena:ghost", (ghost) => notify(ghostListenersRef.current, ghost));
    socket.on("arena:shot", (shot) => notify(shotListenersRef.current, shot));
    socket.on("arena:hit", (hit) => notify(hitListenersRef.current, hit));
    socket.on("arena:respawn", (respawn) => notify(respawnListenersRef.current, respawn));
    socket.on("arena:ammo", (ammo) => notify(ammoListenersRef.current, ammo));
    socket.on("arena:pad", (pad) => notify(padListenersRef.current, pad));
    socket.on("arena:power", (power) => notify(powerListenersRef.current, power));

    socket.on("arena:score", (payload) => {
      setScores(payload.scores);
    });

    socket.on("round:results", (result) => {
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
      setConnection("idle");
    };
  }, [code, enabled, playerId]);

  const subscribeToGhosts = useCallback(
    (listener: (ghost: ArenaGhostPayload) => void) => subscribe(ghostListenersRef, listener),
    [],
  );
  const subscribeToShots = useCallback(
    (listener: (shot: ArenaShotPayload) => void) => subscribe(shotListenersRef, listener),
    [],
  );
  const subscribeToHits = useCallback(
    (listener: (hit: ArenaHitPayload) => void) => subscribe(hitListenersRef, listener),
    [],
  );
  const subscribeToRespawns = useCallback(
    (listener: (respawn: ArenaRespawnPayload) => void) => subscribe(respawnListenersRef, listener),
    [],
  );
  const subscribeToAmmo = useCallback(
    (listener: (ammo: ArenaAmmoPayload) => void) => subscribe(ammoListenersRef, listener),
    [],
  );
  const subscribeToPads = useCallback(
    (listener: (pad: ArenaPadPayload) => void) => subscribe(padListenersRef, listener),
    [],
  );
  const subscribeToPowers = useCallback(
    (listener: (power: ArenaPowerPayload) => void) => subscribe(powerListenersRef, listener),
    [],
  );

  const clearError = useCallback(() => setError(null), []);

  const setReady = useCallback((isReady: boolean) => {
    socketRef.current?.emit("lobby:setReady", { isReady });
  }, []);

  const setBadge = useCallback((update: BadgeUpdate) => {
    socketRef.current?.emit("lobby:setBadge", {
      badgeNumber: update.badgeNumber ?? null,
      colour: update.colour ?? null,
      emoji: update.emoji ?? null,
    });
  }, []);

  const startRound = useCallback((force: boolean) => {
    socketRef.current?.emit("round:start", { force });
  }, []);

  // Fire-and-forget: a frame must never block on the socket (§13).
  const sendPosition = useCallback((pose: ArenaPose) => {
    socketRef.current?.emit("arena:pos", { x: pose.x, y: pose.y, aim: pose.aim });
  }, []);

  const sendFire = useCallback((fire: ArenaFire) => {
    socketRef.current?.emit("arena:fire", { x: fire.x, y: fire.y, angle: fire.angle });
  }, []);

  const requestReload = useCallback(() => {
    socketRef.current?.emit("arena:reload");
  }, []);

  const requestRematch = useCallback(() => {
    socketRef.current?.emit("round:rematch");
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
    scores,
    // Derived rather than written from the effect: with no room or player yet
    // there is nothing to connect to, whatever a previous room left behind, and
    // an active room with untouched state is by definition still connecting.
    connection: isActive ? (connection === "idle" ? "connecting" : connection) : "idle",
    serverClockOffsetMs,
    subscribeToGhosts,
    subscribeToShots,
    subscribeToHits,
    subscribeToRespawns,
    subscribeToAmmo,
    subscribeToPads,
    subscribeToPowers,
    clearError,
    setReady,
    setBadge,
    startRound,
    sendPosition,
    sendFire,
    requestReload,
    requestRematch,
    leaveRoom,
    reconnect,
  };
};
