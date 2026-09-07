import express, { type Express } from "express";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { errorHandler } from "../src/middleware/error-handler.js";
import { notFoundHandler } from "../src/middleware/not-found-handler.js";
import {
  MAX_PLAYERS,
  PLAYER_ID_PATTERN,
  ROOM_CODE_PATTERN,
  type ArenaResult,
} from "../src/modules/arena/arena-contract.js";
import type { ArenaResultRepository } from "../src/modules/arena/arena-result-repository.js";
import type { NewArenaResultRecord } from "../src/modules/arena/arena-types.js";
import { createArenaModule, type ArenaModule } from "../src/modules/arena/index.js";
import { createGameModule, type GameModule } from "../src/modules/game/index.js";
import type { GameResultRepository } from "../src/modules/game/game-result-repository.js";

const sampleResult: ArenaResult = {
  roomCode: "AB23",
  arenaId: "roastery-floor",
  finishedAt: "2026-09-01T10:00:00.000Z",
  standings: [
    {
      badgeNumber: 1,
      colour: "maroon",
      emoji: null,
      rank: 1,
      hits: 9,
      taken: 3,
      downs: 0,
      disconnected: false,
      suspect: false,
    },
    {
      badgeNumber: 2,
      colour: "amber",
      emoji: null,
      rank: 2,
      hits: 2,
      taken: 9,
      downs: 2,
      disconnected: true,
      suspect: false,
    },
  ],
  payerBadgeNumber: 2,
};

const createResultRepository = (stored: ArenaResult | null): ArenaResultRepository => ({
  create: (record: NewArenaResultRecord) =>
    Promise.resolve({
      roomCode: record.roomCode,
      arenaId: record.arenaId,
      finishedAt: record.finishedAt.toISOString(),
      standings: record.standings,
      payerBadgeNumber: record.payerBadgeNumber,
    }),
  findLatestByRoomCode: (roomCode) =>
    Promise.resolve(stored && stored.roomCode === roomCode ? stored : null),
});

const modules: Array<ArenaModule | GameModule> = [];

const createTestApp = (
  options: { maxRoomsPerIpPerHour?: number; storedResult?: ArenaResult } = {},
): Express => {
  const arenaModule = createArenaModule({
    clientUrl: "http://localhost:5173",
    roomTtlMinutes: 60,
    resultTtlHours: 24,
    maxRoomsPerIpPerHour: options.maxRoomsPerIpPerHour ?? 100,
    resultRepository: createResultRepository(options.storedResult ?? null),
  });

  modules.push(arenaModule);

  const app = express();

  app.use(express.json({ limit: "100kb" }));
  app.use("/api/arena", arenaModule.router);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

const createRoom = async (app: Express): Promise<{ code: string; playerId: string }> => {
  const response = await request(app).post("/api/arena/rooms").send({});

  return {
    code: response.body.data.code as string,
    playerId: response.body.data.playerId as string,
  };
};

afterEach(async () => {
  await Promise.all(modules.splice(0).map((module) => module.shutdown()));
});

describe("arena API", () => {
  it("answers the wake-ping", async () => {
    const response = await request(createTestApp()).get("/api/arena/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: { enabled: true },
      meta: {},
      error: null,
    });
  });

  it("creates a room with a valid code and opaque player identity", async () => {
    const response = await request(createTestApp()).post("/api/arena/rooms").send({});

    expect(response.status).toBe(201);
    expect(response.body.data.code).toMatch(ROOM_CODE_PATTERN);
    expect(response.body.data.playerId).toMatch(PLAYER_ID_PATTERN);
    expect(response.body.data.state).toMatchObject({
      status: "LOBBY",
      arenaId: "roastery-floor",
    });
  });

  it("rejects an unknown arena", async () => {
    const response = await request(createTestApp())
      .post("/api/arena/rooms")
      .send({ arenaId: "colosseum" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_ARENA");
  });

  it("rejects unexpected fields in the create body", async () => {
    const response = await request(createTestApp())
      .post("/api/arena/rooms")
      .send({ arenaId: "roastery-floor", hostPlayerId: "spoofed" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("joins a room and assigns a badge number and colour", async () => {
    const app = createTestApp();
    const room = await createRoom(app);
    const response = await request(app).post(`/api/arena/rooms/${room.code}/join`).send({});

    expect(response.status).toBe(200);
    expect(response.body.data.playerId).toMatch(PLAYER_ID_PATTERN);
    expect(response.body.data.playerId).not.toBe(room.playerId);
    expect(response.body.data.state.players).toHaveLength(2);
    expect(response.body.data.state.players[1]).toMatchObject({ badgeNumber: 2 });
  });

  it("treats a known playerId as a reconnect rather than a new seat", async () => {
    const app = createTestApp();
    const room = await createRoom(app);
    const response = await request(app)
      .post(`/api/arena/rooms/${room.code}/join`)
      .send({ playerId: room.playerId });

    expect(response.status).toBe(200);
    expect(response.body.data.playerId).toBe(room.playerId);
    expect(response.body.data.state.players).toHaveLength(1);
  });

  it("refuses the seat past the maximum field size", async () => {
    const app = createTestApp();
    const room = await createRoom(app);

    for (let seat = 1; seat < MAX_PLAYERS; seat += 1) {
      await request(app).post(`/api/arena/rooms/${room.code}/join`).send({});
    }

    const response = await request(app).post(`/api/arena/rooms/${room.code}/join`).send({});

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("ROOM_FULL");
  });

  it("rejects a badly shaped room code before it reaches the service", async () => {
    const response = await request(createTestApp()).get("/api/arena/rooms/OOOO");

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("reports an unknown room as not found", async () => {
    const response = await request(createTestApp()).get("/api/arena/rooms/AB23");

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("ROOM_NOT_FOUND");
  });

  it("returns the room's last stored result", async () => {
    const response = await request(createTestApp({ storedResult: sampleResult })).get(
      "/api/arena/results/AB23",
    );

    expect(response.status).toBe(200);
    expect(response.body.data.result).toMatchObject({
      roomCode: "AB23",
      payerBadgeNumber: 2,
    });
  });

  it("blocks room creation beyond the hourly cap for one IP", async () => {
    const app = createTestApp({ maxRoomsPerIpPerHour: 2 });

    await request(app).post("/api/arena/rooms").send({});
    await request(app).post("/api/arena/rooms").send({});

    const blocked = await request(app).post("/api/arena/rooms").send({});

    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("TOO_MANY_ROOMS");
  });

  /**
   * The two games must never share a limiter. If they did, a table that had just
   * raced would find itself unable to start a bean fight, which is exactly the
   * kind of coupling BEAN-BLASTERS.md section 7 exists to prevent.
   */
  it("keeps its room-creation budget separate from the kart game's", async () => {
    const arenaModule = createArenaModule({
      clientUrl: "http://localhost:5173",
      roomTtlMinutes: 60,
      resultTtlHours: 24,
      maxRoomsPerIpPerHour: 1,
      resultRepository: createResultRepository(null),
    });
    const gameResultRepository: GameResultRepository = {
      create: (record) =>
        Promise.resolve({
          roomCode: record.roomCode,
          trackId: record.trackId,
          finishedAt: record.finishedAt.toISOString(),
          standings: record.standings,
          payerCarNumber: record.payerCarNumber,
        }),
      findLatestByRoomCode: () => Promise.resolve(null),
    };
    const gameModule = createGameModule({
      clientUrl: "http://localhost:5173",
      roomTtlMinutes: 60,
      resultTtlHours: 24,
      maxRoomsPerIpPerHour: 1,
      resultRepository: gameResultRepository,
    });

    modules.push(arenaModule, gameModule);

    const app = express();

    app.use(express.json({ limit: "100kb" }));
    app.use("/api/arena", arenaModule.router);
    app.use("/api/game", gameModule.router);
    app.use(notFoundHandler);
    app.use(errorHandler);

    // Spend the arena budget entirely.
    expect((await request(app).post("/api/arena/rooms").send({})).status).toBe(201);
    expect((await request(app).post("/api/arena/rooms").send({})).status).toBe(429);

    // The kart game's budget is untouched.
    expect((await request(app).post("/api/game/rooms").send({})).status).toBe(201);
  });
});
