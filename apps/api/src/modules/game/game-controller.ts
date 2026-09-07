import type { RequestHandler } from "express";

import { asyncHandler } from "../../middleware/async-handler.js";
import type { CreateRoomInput, JoinRoomInput, RoomCodeParams } from "./game-schemas.js";
import type { GameService } from "./game-service.js";

export const createGameController = (
  gameService: GameService,
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
    const room = gameService.createRoom(request.body as CreateRoomInput);

    response.status(201).json({
      success: true,
      data: { code: room.code, playerId: room.playerId, state: room.state },
      meta: {},
      error: null,
    });
  }),

  joinRoom: asyncHandler(async (request, response) => {
    const { code } = request.validatedParams as RoomCodeParams;
    const joined = gameService.join(code, request.body as JoinRoomInput);

    response.status(200).json({
      success: true,
      data: { playerId: joined.playerId, state: joined.state },
      meta: {},
      error: null,
    });
  }),

  getRoom: asyncHandler(async (request, response) => {
    const { code } = request.validatedParams as RoomCodeParams;

    response.status(200).json({
      success: true,
      data: { state: gameService.getState(code) },
      meta: {},
      error: null,
    });
  }),

  getResult: asyncHandler(async (request, response) => {
    const { code } = request.validatedParams as RoomCodeParams;
    const result = await gameService.getResult(code);

    response.status(200).json({ success: true, data: { result }, meta: {}, error: null });
  }),
});
