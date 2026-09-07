import type { Router } from "express";
import type { Server as HttpServer } from "node:http";

import type { ArenaResultRepository } from "./arena-result-repository.js";
import { createArenaRoomStore } from "./arena-room-store.js";
import { createArenaRouter } from "./arena-routes.js";
import { createArenaService } from "./arena-service.js";
import { createArenaSocket } from "./arena-socket.js";

export interface ArenaModule {
  router: Router;
  attachSocket: (httpServer: HttpServer) => void;
  shutdown: () => Promise<void>;
}

export interface CreateArenaModuleOptions {
  clientUrl: string;
  roomTtlMinutes: number;
  resultTtlHours: number;
  maxRoomsPerIpPerHour: number;
  resultRepository: ArenaResultRepository;
  now?: () => Date;
}

/**
 * Builds the whole Bean Blasters backend behind one factory so `app.ts` only
 * ever mounts a router and hands over the HTTP server, exactly like the other
 * optionally-wired services.
 */
export const createArenaModule = ({
  clientUrl,
  roomTtlMinutes,
  resultTtlHours,
  maxRoomsPerIpPerHour,
  resultRepository,
  now = () => new Date(),
}: CreateArenaModuleOptions): ArenaModule => {
  const roomStore = createArenaRoomStore({ ttlMinutes: roomTtlMinutes, now });
  const arenaService = createArenaService({ roomStore, resultRepository, resultTtlHours, now });
  const arenaSocket = createArenaSocket({ arenaService, clientUrl });

  arenaService.setListener(arenaSocket.listener);

  return {
    router: createArenaRouter({ arenaService, maxRoomsPerIpPerHour }),
    attachSocket: (httpServer) => {
      arenaSocket.attach(httpServer);
    },
    shutdown: async () => {
      await arenaSocket.close();
      await arenaService.shutdown();
    },
  };
};

export { MongooseArenaResultRepository } from "./arena-result-repository.js";
export type { ArenaResultRepository } from "./arena-result-repository.js";
export type { ArenaService } from "./arena-service.js";
