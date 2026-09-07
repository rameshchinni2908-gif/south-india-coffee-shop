import type { Router } from "express";
import type { Server as HttpServer } from "node:http";

import type { GameResultRepository } from "./game-result-repository.js";
import { createGameRouter } from "./game-routes.js";
import { createGameService } from "./game-service.js";
import { createGameSocket } from "./game-socket.js";
import { createRoomStore } from "./room-store.js";

export interface GameModule {
  router: Router;
  attachSocket: (httpServer: HttpServer) => void;
  shutdown: () => Promise<void>;
}

export interface CreateGameModuleOptions {
  clientUrl: string;
  roomTtlMinutes: number;
  resultTtlHours: number;
  maxRoomsPerIpPerHour: number;
  resultRepository: GameResultRepository;
  now?: () => Date;
}

/**
 * Builds the whole Kaapi Karts backend behind one factory so `app.ts` only ever
 * mounts a router and hands over the HTTP server, exactly like the other
 * optionally-wired services.
 */
export const createGameModule = ({
  clientUrl,
  roomTtlMinutes,
  resultTtlHours,
  maxRoomsPerIpPerHour,
  resultRepository,
  now = () => new Date(),
}: CreateGameModuleOptions): GameModule => {
  const roomStore = createRoomStore({ ttlMinutes: roomTtlMinutes, now });
  const gameService = createGameService({ roomStore, resultRepository, resultTtlHours, now });
  const gameSocket = createGameSocket({ gameService, clientUrl });

  gameService.setListener(gameSocket.listener);

  return {
    router: createGameRouter({ gameService, maxRoomsPerIpPerHour }),
    attachSocket: (httpServer) => {
      gameSocket.attach(httpServer);
    },
    shutdown: async () => {
      await gameSocket.close();
      await gameService.shutdown();
    },
  };
};

export { MongooseGameResultRepository } from "./game-result-repository.js";
export type { GameResultRepository } from "./game-result-repository.js";
export type { GameService } from "./game-service.js";
