import express, { type Express } from "express";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { errorHandler } from "../src/middleware/error-handler.js";
import { notFoundHandler } from "../src/middleware/not-found-handler.js";
import {
  MAX_PLAYERS,
  PLAYER_ID_PATTERN,
  ROOM_CODE_PATTERN,
  type RaceResult,
} from "../src/modules/game/game-contract.js";
import { createGameModule, type GameModule } from "../src/modules/game/index.js";
import type { GameResultRepository } from "../src/modules/game/game-result-repository.js";
import type { NewGameResultRecord } from "../src/modules/game/game-types.js";

const sampleResult: RaceResult = {
  roomCode: "AB23",
  trackId: "kaapi-circuit",
  finishedAt: "2026-09-01T10:00:00.000Z",
  standings: [
    {
      carNumber: 1,
      colour: "maroon",
      emoji: null,
      rank: 1,
      finishMs: 108_000,
      lapsCompleted: 3,
      progress: 3,
      disconnected: false,
      suspect: false,
    },
    {
      carNumber: 2,
      colour: "amber",
      emoji: null,
      rank: 2,
      finishMs: null,
      lapsCompleted: 2,
      progress: 2.4,
      disconnected: true,
      suspect: false,
    },
  ],
  payerCarNumber: 2,
};

const createResultRepository = (stored: RaceResult | null): GameResultRepository => ({
  create: (record: NewGameResultRecord) =>
    Promise.resolve({
      roomCode: record.roomCode,
      trackId: record.trackId,
      finishedAt: record.finishedAt.toISOString(),
      standings: record.standings,
      payerCarNumber: record.payerCarNumber,
    }),
  findLatestByRoomCode: (roomCode) =>
    Promise.resolve(stored && stored.roomCode === roomCode ? stored : null),
});

const modules: GameModule[] = [];

const createTestApp = (
  options: { maxRoomsPerIpPerHour?: number; storedResult?: RaceResult } = {},
): Express => {
  const gameModule = createGameModule({
    clientUrl: "http://localhost:5173",
    roomTtlMinutes: 60,
    resultTtlHours: 24,
    maxRoomsPerIpPerHour: options.maxRoomsPerIpPerHour ?? 100,
    resultRepository: createResultRepository(options.storedResult ?? null),
  });

  modules.push(gameModule);

  const app = express();

  app.use(express.json({ limit: "100kb" }));
  app.use("/api/game", gameModule.router);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

const createRoom = async (app: Express): Promise<{ code: string; playerId: string }> => {
  const response = await request(app).post("/api/game/rooms").send({});

  return {
    code: response.body.data.code as string,
    playerId: response.body.data.playerId as string,
  };
};

afterEach(async () => {
  await Promise.all(modules.splice(0).map((gameModule) => gameModule.shutdown()));
});

describe("game API", () => {
  it("answers the wake-ping", async () => {
    const response = await request(createTestApp()).get("/api/game/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: { enabled: true },
      meta: {},
      error: null,
    });
  });

  it("creates a room with a valid code and opaque player identity", async () => {
    const response = await request(createTestApp()).post("/api/game/rooms").send({});

    expect(response.status).toBe(201);
    expect(response.body.data.code).toMatch(ROOM_CODE_PATTERN);
    expect(response.body.data.playerId).toMatch(PLAYER_ID_PATTERN);
    expect(response.body.data.state).toMatchObject({ status: "LOBBY", trackId: "kaapi-circuit" });
  });

  it("rejects an unknown track", async () => {
    const response = await request(createTestApp())
      .post("/api/game/rooms")
      .send({ trackId: "monaco" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_TRACK");
  });

  it("rejects unexpected fields in the create body", async () => {
    const response = await request(createTestApp())
      .post("/api/game/rooms")
      .send({ trackId: "kaapi-circuit", hostPlayerId: "spoofed" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("blocks room creation beyond the hourly cap for one IP", async () => {
    const app = createTestApp({ maxRoomsPerIpPerHour: 2 });

    await request(app).post("/api/game/rooms").send({});
    await request(app).post("/api/game/rooms").send({});

    const blocked = await request(app).post("/api/game/rooms").send({});

    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({
      success: false,
      data: null,
      meta: {},
      error: {
        code: "TOO_MANY_ROOMS",
        message: "Too many race rooms created. Please try again later",
      },
    });
  });

  it("joins a room and returns the authoritative snapshot", async () => {
    const app = createTestApp();
    const room = await createRoom(app);
    const response = await request(app).post(`/api/game/rooms/${room.code}/join`).send({});

    expect(response.status).toBe(200);
    expect(response.body.data.playerId).toMatch(PLAYER_ID_PATTERN);
    expect(response.body.data.playerId).not.toBe(room.playerId);
    expect(response.body.data.state.players).toHaveLength(2);
    expect(response.body.data.state.players[1].carNumber).toBe(2);
  });

  it("treats a known playerId as a reconnect", async () => {
    const app = createTestApp();
    const room = await createRoom(app);
    const response = await request(app)
      .post(`/api/game/rooms/${room.code}/join`)
      .send({ playerId: room.playerId });

    expect(response.status).toBe(200);
    expect(response.body.data.playerId).toBe(room.playerId);
    expect(response.body.data.state.players).toHaveLength(1);
  });

  it("rejects the seventh player", async () => {
    const app = createTestApp();
    const room = await createRoom(app);

    for (let index = 1; index < MAX_PLAYERS; index += 1) {
      const joined = await request(app).post(`/api/game/rooms/${room.code}/join`).send({});

      expect(joined.status).toBe(200);
    }

    const overflow = await request(app).post(`/api/game/rooms/${room.code}/join`).send({});

    expect(overflow.status).toBe(409);
    expect(overflow.body.error.code).toBe("ROOM_FULL");
  });

  it("rejects a malformed room code and an unknown room", async () => {
    const app = createTestApp();
    const malformed = await request(app).get("/api/game/rooms/AB0I");
    const unknown = await request(app).get("/api/game/rooms/zzzz");

    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe("VALIDATION_ERROR");
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe("ROOM_NOT_FOUND");
  });

  it("rejects a malformed playerId on join", async () => {
    const app = createTestApp();
    const room = await createRoom(app);
    const response = await request(app)
      .post(`/api/game/rooms/${room.code}/join`)
      .send({ playerId: "not-a-player" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("reads the current room snapshot", async () => {
    const app = createTestApp();
    const room = await createRoom(app);
    const response = await request(app).get(`/api/game/rooms/${room.code.toLowerCase()}`);

    expect(response.status).toBe(200);
    expect(response.body.data.state).toMatchObject({ code: room.code, status: "LOBBY" });
    expect(typeof response.body.data.state.serverTime).toBe("string");
  });

  it("returns the last stored result or a 404", async () => {
    const withResult = createTestApp({ storedResult: sampleResult });
    const found = await request(withResult).get("/api/game/results/AB23");
    const missing = await request(withResult).get("/api/game/results/CD45");

    expect(found.status).toBe(200);
    expect(found.body.data.result).toMatchObject({ roomCode: "AB23", payerCarNumber: 2 });
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("GAME_RESULT_NOT_FOUND");
  });
});
