import type { Server as HttpServer } from "node:http";

import { Server, type DefaultEventsMap, type Namespace, type Socket } from "socket.io";

import {
  GAME_SOCKET_NAMESPACE,
  POSITION_BROADCAST_INTERVAL_MS,
  type ClientToServerEvents,
  type GameErrorPayload,
  type ServerToClientEvents,
} from "./game-contract.js";
import {
  finishPayloadSchema,
  helloPayloadSchema,
  positionPayloadSchema,
  setCarPayloadSchema,
  setReadyPayloadSchema,
  startRacePayloadSchema,
} from "./game-schemas.js";
import type { GameService, GameServiceListener } from "./game-service.js";
import { GameError } from "./game-types.js";

interface GameSocketData {
  code?: string;
  playerId?: string;
  lastPositionAt?: number;
}

type GameNamespace = Namespace<
  ClientToServerEvents,
  ServerToClientEvents,
  DefaultEventsMap,
  GameSocketData
>;

type GameServerSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  DefaultEventsMap,
  GameSocketData
>;

export interface GameSocket {
  attach(httpServer: HttpServer): void;
  listener: GameServiceListener;
  close(): Promise<void>;
}

export interface CreateGameSocketOptions {
  gameService: GameService;
  clientUrl: string;
}

const toGameErrorPayload = (error: unknown): GameErrorPayload =>
  error instanceof GameError
    ? { code: error.gameCode, message: error.message }
    : { code: "INVALID_STATE", message: "That action could not be completed" };

export const createGameSocket = ({
  gameService,
  clientUrl,
}: CreateGameSocketOptions): GameSocket => {
  let io: Server<
    ClientToServerEvents,
    ServerToClientEvents,
    DefaultEventsMap,
    GameSocketData
  > | null = null;
  let namespace: GameNamespace | null = null;

  const guard = (socket: GameServerSocket, action: () => void): void => {
    try {
      action();
    } catch (error) {
      socket.emit("game:error", toGameErrorPayload(error));
    }
  };

  const seatOf = (socket: GameServerSocket): { code: string; playerId: string } => {
    const { code, playerId } = socket.data;

    if (!code || !playerId) {
      throw new GameError(403, "NOT_IN_ROOM", "Join the room before sending that");
    }

    return { code, playerId };
  };

  const register = (socket: GameServerSocket): void => {
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
        const state = gameService.attach(parsed.data.code, parsed.data.playerId, socket.id);

        socket.data.code = parsed.data.code;
        socket.data.playerId = parsed.data.playerId;
        void socket.join(parsed.data.code);
        respond({ ok: true, state });
      } catch (error) {
        respond({ ok: false, error: toGameErrorPayload(error) });
      }
    });

    socket.on("room:leave", () => {
      const { code, playerId } = socket.data;

      if (!code || !playerId) {
        return;
      }

      gameService.leave(code, playerId);
      void socket.leave(code);
      delete socket.data.code;
      delete socket.data.playerId;
    });

    socket.on("lobby:setReady", (payload) => {
      guard(socket, () => {
        const parsed = setReadyPayloadSchema.safeParse(payload);

        if (!parsed.success) {
          throw new GameError(400, "INVALID_STATE", "That request was not valid");
        }

        const seat = seatOf(socket);

        gameService.setReady(seat.code, seat.playerId, parsed.data.isReady);
      });
    });

    socket.on("lobby:setCar", (payload) => {
      guard(socket, () => {
        const parsed = setCarPayloadSchema.safeParse(payload);

        if (!parsed.success) {
          throw new GameError(400, "INVALID_NUMBER", "That car selection was not valid");
        }

        const seat = seatOf(socket);

        gameService.setCar(seat.code, seat.playerId, parsed.data);
      });
    });

    socket.on("race:start", (payload) => {
      guard(socket, () => {
        const parsed = startRacePayloadSchema.safeParse(payload);

        if (!parsed.success) {
          throw new GameError(400, "INVALID_STATE", "That request was not valid");
        }

        const seat = seatOf(socket);

        gameService.startRace(seat.code, seat.playerId, parsed.data.force);
      });
    });

    socket.on("race:pos", (payload) => {
      const { code, playerId } = socket.data;

      if (!code || !playerId) {
        return;
      }

      // Best-effort and untrusted: excess frames are dropped silently rather
      // than punished, so a laggy phone is never disconnected mid-race.
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

      const ghost = gameService.recordPosition(code, playerId, parsed.data);

      if (ghost) {
        socket.to(code).emit("race:ghost", ghost);
      }
    });

    socket.on("race:finish", (payload) => {
      const parsed = finishPayloadSchema.safeParse(payload);

      if (!parsed.success) {
        socket.emit("game:error", {
          code: "INVALID_STATE",
          message: "That finish report was not valid",
        });
        return;
      }

      let seat: { code: string; playerId: string };

      try {
        seat = seatOf(socket);
      } catch (error) {
        socket.emit("game:error", toGameErrorPayload(error));
        return;
      }

      void gameService
        .recordFinish(seat.code, seat.playerId, parsed.data)
        .catch((error: unknown) => {
          socket.emit("game:error", toGameErrorPayload(error));
        });
    });

    socket.on("race:rematch", () => {
      guard(socket, () => {
        const seat = seatOf(socket);

        gameService.rematch(seat.code, seat.playerId);
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
        gameService.disconnect(code, playerId, socket.id);
      }
    });
  };

  return {
    attach(httpServer) {
      if (io) {
        return;
      }

      io = new Server<ClientToServerEvents, ServerToClientEvents, DefaultEventsMap, GameSocketData>(
        httpServer,
        {
          cors: { origin: clientUrl, credentials: true },
        },
      );
      namespace = io.of(GAME_SOCKET_NAMESPACE);
      namespace.on("connection", register);
    },

    listener: {
      contact(code, payload) {
        namespace?.to(code).emit("race:contact", payload);
      },
      roomState(code, state) {
        namespace?.to(code).emit("room:state", state);
      },
      countdown(code, payload) {
        namespace?.to(code).emit("race:countdown", payload);
      },
      go(code, payload) {
        namespace?.to(code).emit("race:go", payload);
      },
      playerFinished(code, payload) {
        namespace?.to(code).emit("race:playerFinished", payload);
      },
      results(code, result) {
        namespace?.to(code).emit("race:results", result);
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
