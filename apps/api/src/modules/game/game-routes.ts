import { Router } from "express";
import { rateLimit } from "express-rate-limit";

import { validateBody } from "../../middleware/validate-body.js";
import { validateParams } from "../../middleware/validate-params.js";
import { createGameController } from "./game-controller.js";
import { createRoomBodySchema, joinRoomBodySchema, roomCodeParamsSchema } from "./game-schemas.js";
import type { GameService } from "./game-service.js";

const HOUR_MS = 60 * 60 * 1000;

export interface CreateGameRouterOptions {
  gameService: GameService;
  maxRoomsPerIpPerHour: number;
}

export const createGameRouter = ({
  gameService,
  maxRoomsPerIpPerHour,
}: CreateGameRouterOptions): Router => {
  const router = Router();
  const controller = createGameController(gameService);
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
          message: "Too many race rooms created. Please try again later",
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
