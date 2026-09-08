import type { Server as HttpServer } from "node:http";

import { Server, type DefaultEventsMap, type Namespace, type Socket } from "socket.io";

import {
  ARENA_SOCKET_NAMESPACE,
  ARENA_SOCKET_PATH,
  POSITION_BROADCAST_INTERVAL_MS,
  type ArenaErrorPayload,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from "./arena-contract.js";
import {
  firePayloadSchema,
  helloPayloadSchema,
  positionPayloadSchema,
  setBadgePayloadSchema,
  setReadyPayloadSchema,
  startRoundPayloadSchema,
} from "./arena-schemas.js";
import type { ArenaService, ArenaServiceListener } from "./arena-service.js";
import { ArenaError } from "./arena-types.js";

interface ArenaSocketData {
  code?: string;
  playerId?: string;
  lastPositionAt?: number;
}

type ArenaNamespace = Namespace<
  ClientToServerEvents,
  ServerToClientEvents,
  DefaultEventsMap,
  ArenaSocketData
>;

type ArenaServerSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  DefaultEventsMap,
  ArenaSocketData
>;

export interface ArenaSocket {
  attach(httpServer: HttpServer): void;
  listener: ArenaServiceListener;
  close(): Promise<void>;
}

export interface CreateArenaSocketOptions {
  arenaService: ArenaService;
  clientUrl: string;
}

/** Private room for one player, so ammo reaches its owner and nobody else. */
const seatRoom = (code: string, playerId: string): string => `${code}#${playerId}`;

const toArenaErrorPayload = (error: unknown): ArenaErrorPayload =>
  error instanceof ArenaError
    ? { code: error.arenaCode, message: error.message }
    : { code: "INVALID_STATE", message: "That action could not be completed" };

export const createArenaSocket = ({
  arenaService,
  clientUrl,
}: CreateArenaSocketOptions): ArenaSocket => {
  let io: Server<
    ClientToServerEvents,
    ServerToClientEvents,
    DefaultEventsMap,
    ArenaSocketData
  > | null = null;
  let namespace: ArenaNamespace | null = null;

  const guard = (socket: ArenaServerSocket, action: () => void): void => {
    try {
      action();
    } catch (error) {
      socket.emit("game:error", toArenaErrorPayload(error));
    }
  };

  const seatOf = (socket: ArenaServerSocket): { code: string; playerId: string } => {
    const { code, playerId } = socket.data;

    if (!code || !playerId) {
      throw new ArenaError(403, "NOT_IN_ROOM", "Join the room before sending that");
    }

    return { code, playerId };
  };

  const register = (socket: ArenaServerSocket): void => {
    socket.on("room:hello", (payload, ack) => {
      const respond = typeof ack === "function" ? ack : (): void => undefined;
      const parsed = helloPayloadSchema.safeParse(payload);

      if (!parsed.success) {
        respond({
          ok: false,
          error: { code: "ROOM_NOT_FOUND", message: "That room code is not valid" },
        });
        return;
      }

      try {
        const state = arenaService.attach(parsed.data.code, parsed.data.playerId, socket.id);

        socket.data.code = parsed.data.code;
        socket.data.playerId = parsed.data.playerId;
        void socket.join(parsed.data.code);
        void socket.join(seatRoom(parsed.data.code, parsed.data.playerId));
        respond({ ok: true, state });
      } catch (error) {
        respond({ ok: false, error: toArenaErrorPayload(error) });
      }
    });

    socket.on("room:leave", () => {
      const { code, playerId } = socket.data;

      if (!code || !playerId) {
        return;
      }

      arenaService.leave(code, playerId);
      void socket.leave(code);
      void socket.leave(seatRoom(code, playerId));
      delete socket.data.code;
      delete socket.data.playerId;
    });

    socket.on("lobby:setReady", (payload) => {
      guard(socket, () => {
        const parsed = setReadyPayloadSchema.safeParse(payload);

        if (!parsed.success) {
          throw new ArenaError(400, "INVALID_STATE", "That request was not valid");
        }

        const seat = seatOf(socket);

        arenaService.setReady(seat.code, seat.playerId, parsed.data.isReady);
      });
    });

    socket.on("lobby:setBadge", (payload) => {
      guard(socket, () => {
        const parsed = setBadgePayloadSchema.safeParse(payload);

        if (!parsed.success) {
          throw new ArenaError(400, "INVALID_NUMBER", "That badge selection was not valid");
        }

        const seat = seatOf(socket);

        arenaService.setBadge(seat.code, seat.playerId, parsed.data);
      });
    });

    socket.on("round:start", (payload) => {
      guard(socket, () => {
        const parsed = startRoundPayloadSchema.safeParse(payload);

        if (!parsed.success) {
          throw new ArenaError(400, "INVALID_STATE", "That request was not valid");
        }

        const seat = seatOf(socket);

        arenaService.startRound(seat.code, seat.playerId, parsed.data.force);
      });
    });

    socket.on("arena:pos", (payload) => {
      const { code, playerId } = socket.data;

      if (!code || !playerId) {
        return;
      }

      // Best-effort and untrusted: excess frames are dropped silently rather
      // than punished, so a laggy phone is never disconnected mid-round.
      const receivedAt = Date.now();
      const lastPositionAt = socket.data.lastPositionAt ?? 0;

      if (receivedAt - lastPositionAt < POSITION_BROADCAST_INTERVAL_MS) {
        return;
      }

      const parsed = positionPayloadSchema.safeParse(payload);

      if (!parsed.success) {
        return;
      }

      socket.data.lastPositionAt = receivedAt;

      const ghost = arenaService.recordPosition(code, playerId, parsed.data);

      if (ghost) {
        socket.to(code).emit("arena:ghost", ghost);
      }
    });

    socket.on("arena:fire", (payload) => {
      const { code, playerId } = socket.data;

      if (!code || !playerId) {
        return;
      }

      const parsed = firePayloadSchema.safeParse(payload);

      if (!parsed.success) {
        return;
      }

      arenaService.recordFire(code, playerId, parsed.data);
    });

    socket.on("arena:reload", () => {
      const { code, playerId } = socket.data;

      if (code && playerId) {
        arenaService.requestReload(code, playerId);
      }
    });

    socket.on("round:rematch", () => {
      guard(socket, () => {
        const seat = seatOf(socket);

        arenaService.rematch(seat.code, seat.playerId);
      });
    });

    socket.on("time:ping", (ack) => {
      if (typeof ack === "function") {
        ack(Date.now());
      }
    });

    socket.on("disconnect", () => {
      const { code, playerId } = socket.data;

      if (code && playerId) {
        // Named, so a teardown that arrives after the player's next socket has
        // already claimed the seat is recognised as stale and ignored.
        arenaService.disconnect(code, playerId, socket.id);
      }
    });
  };

  return {
    attach(httpServer) {
      if (io) {
        return;
      }

      // Bean Blasters runs its OWN Socket.IO server on its OWN path. Kaapi
      // Karts already holds the default `/socket.io/`, and engine.io routes an
      // upgrade by path — so two servers can share this HTTP server only while
      // their paths differ. Neither game's socket layer knows the other exists,
      // which is precisely what makes either one deletable (§8).
      io = new Server<
        ClientToServerEvents,
        ServerToClientEvents,
        DefaultEventsMap,
        ArenaSocketData
      >(httpServer, {
        path: ARENA_SOCKET_PATH,
        cors: { origin: clientUrl, credentials: true },
      });
      namespace = io.of(ARENA_SOCKET_NAMESPACE);
      namespace.on("connection", register);
    },

    listener: {
      roomState(code, state) {
        namespace?.to(code).emit("room:state", state);
      },
      countdown(code, payload) {
        namespace?.to(code).emit("round:countdown", payload);
      },
      go(code, payload) {
        namespace?.to(code).emit("round:go", payload);
      },
      shot(code, payload) {
        namespace?.to(code).emit("arena:shot", payload);
      },
      hit(code, payload) {
        namespace?.to(code).emit("arena:hit", payload);
      },
      respawn(code, payload) {
        namespace?.to(code).emit("arena:respawn", payload);
      },
      ammo(code, playerId, payload) {
        namespace?.to(seatRoom(code, playerId)).emit("arena:ammo", payload);
      },
      pad(code, payload) {
        namespace?.to(code).emit("arena:pad", payload);
      },
      power(code, payload) {
        namespace?.to(code).emit("arena:power", payload);
      },
      scores(code, payload) {
        namespace?.to(code).emit("arena:score", payload);
      },
      results(code, result) {
        namespace?.to(code).emit("round:results", result);
      },
    },

    async close() {
      const server = io;

      io = null;
      namespace = null;

      if (!server) {
        return;
      }

      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
    },
  };
};
