import { Router } from "express";
import { rateLimit } from "express-rate-limit";

import { validateBody } from "../../middleware/validate-body.js";
import { validateParams } from "../../middleware/validate-params.js";
import { createArenaController } from "./arena-controller.js";
import { createRoomBodySchema, joinRoomBodySchema, roomCodeParamsSchema } from "./arena-schemas.js";
import type { ArenaService } from "./arena-service.js";

const HOUR_MS = 60 * 60 * 1000;

export interface CreateArenaRouterOptions {
  arenaService: ArenaService;
  maxRoomsPerIpPerHour: number;
}

export const createArenaRouter = ({
  arenaService,
  maxRoomsPerIpPerHour,
}: CreateArenaRouterOptions): Router => {
  const router = Router();
  const controller = createArenaController(arenaService);
  /**
   * This game's own limiter instance. It deliberately does not share a counter
   * with the kart game's: creating a race room must never spend a player's
   * budget for creating an arena room (BEAN-BLASTERS.md §7).
   */
  const roomCreationRateLimit = rateLimit({
    windowMs: HOUR_MS,
    limit: maxRoomsPerIpPerHour,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_request, response) => {
      response.status(429).json({
        success: false,
        data: null,
        meta: {},
        error: {
          code: "TOO_MANY_ROOMS",
          message: "Too many arena rooms created. Please try again later",
        },
      });
    },
  });

  router.get("/health", controller.health);
  router.post(
    "/rooms",
    roomCreationRateLimit,
    validateBody(createRoomBodySchema),
    controller.createRoom,
  );
  router.post(
    "/rooms/:code/join",
    validateParams(roomCodeParamsSchema),
    validateBody(joinRoomBodySchema),
    controller.joinRoom,
  );
  router.get("/rooms/:code", validateParams(roomCodeParamsSchema), controller.getRoom);
  router.get("/results/:code", validateParams(roomCodeParamsSchema), controller.getResult);

  return router;
};
