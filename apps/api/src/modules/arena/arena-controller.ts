import type { RequestHandler } from "express";

import { asyncHandler } from "../../middleware/async-handler.js";
import type {
  ArenaRoomCodeParams,
  CreateArenaRoomInput,
  JoinArenaRoomInput,
} from "./arena-schemas.js";
import type { ArenaService } from "./arena-service.js";

export const createArenaController = (
  arenaService: ArenaService,
): {
  health: RequestHandler;
  createRoom: RequestHandler;
  joinRoom: RequestHandler;
  getRoom: RequestHandler;
  getResult: RequestHandler;
} => ({
  health: asyncHandler(async (_request, response) => {
    response.status(200).json({ success: true, data: { enabled: true }, meta: {}, error: null });
  }),

  createRoom: asyncHandler(async (request, response) => {
    const room = arenaService.createRoom(request.body as CreateArenaRoomInput);

    response.status(201).json({
      success: true,
      data: { code: room.code, playerId: room.playerId, state: room.state },
      meta: {},
      error: null,
    });
  }),

  joinRoom: asyncHandler(async (request, response) => {
    const { code } = request.validatedParams as ArenaRoomCodeParams;
    const joined = arenaService.join(code, request.body as JoinArenaRoomInput);

    response.status(200).json({
      success: true,
      data: { playerId: joined.playerId, state: joined.state },
      meta: {},
      error: null,
    });
  }),

  getRoom: asyncHandler(async (request, response) => {
    const { code } = request.validatedParams as ArenaRoomCodeParams;

    response.status(200).json({
      success: true,
      data: { state: arenaService.getState(code) },
      meta: {},
      error: null,
    });
  }),

  getResult: asyncHandler(async (request, response) => {
    const { code } = request.validatedParams as ArenaRoomCodeParams;
    const result = await arenaService.getResult(code);

    response.status(200).json({ success: true, data: { result }, meta: {}, error: null });
  }),
});
