import express from "express";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { io as createSocketClient, type Socket as ClientSocket } from "socket.io-client";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  COUNTDOWN_MS,
  GAME_SOCKET_NAMESPACE,
  type GameRoomState,
  type RaceResult,
} from "../src/modules/game/game-contract.js";
import type { GameResultRepository } from "../src/modules/game/game-result-repository.js";
import type { NewGameResultRecord } from "../src/modules/game/game-types.js";
import { createGameModule, type GameModule } from "../src/modules/game/index.js";

/** Untyped on purpose: `io()` always returns the default event maps. */
type TestClient = ClientSocket;

type HelloAck = { ok: true; state: GameRoomState } | { ok: false; error: { code: string } };

const LAP_MS = 36_000;
const GO_TIMEOUT_MS = COUNTDOWN_MS + 7_000;

const cleanFinish = (finishMs: number): { finishMs: number; lapSplits: number[] } => ({
  finishMs,
  lapSplits: [finishMs / 3, (finishMs / 3) * 2, finishMs],
});

const saved: NewGameResultRecord[] = [];
const resultRepository: GameResultRepository = {
  create: (record) => {
    saved.push(record);

    return Promise.resolve({
      roomCode: record.roomCode,
      trackId: record.trackId,
      finishedAt: record.finishedAt.toISOString(),
      standings: record.standings,
      payerCarNumber: record.payerCarNumber,
    });
  },
  findLatestByRoomCode: () => Promise.resolve(null),
};

const waitFor = <Payload>(
  client: TestClient,
  event: string,
  timeoutMs = 10_000,
): Promise<Payload> =>
  new Promise<Payload>((resolve, reject) => {
    const handler = (payload: unknown): void => {
      clearTimeout(timer);
      resolve(payload as Payload);
    };
    const timer = setTimeout(() => {
      client.off(event, handler);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);

    client.once(event, handler);
  });

const waitForState = (
  client: TestClient,
  predicate: (state: GameRoomState) => boolean,
  timeoutMs = 10_000,
): Promise<GameRoomState> =>
  new Promise<GameRoomState>((resolve, reject) => {
    const handler = (payload: unknown): void => {
      const state = payload as GameRoomState;

      if (predicate(state)) {
        clearTimeout(timer);
        client.off("room:state", handler);
        resolve(state);
      }
    };
    const timer = setTimeout(() => {
      client.off("room:state", handler);
      reject(new Error("Timed out waiting for room:state"));
    }, timeoutMs);

    client.on("room:state", handler);
  });

describe("game socket namespace", () => {
  let gameModule: GameModule;
  let httpServer: HttpServer;
  let baseUrl: string;
  const clients: TestClient[] = [];

  beforeEach(async () => {
    saved.length = 0;
    gameModule = createGameModule({
      clientUrl: "http://localhost:5173",
      roomTtlMinutes: 60,
      resultTtlHours: 24,
      maxRoomsPerIpPerHour: 100,
      resultRepository,
    });

    const app = express();

    app.use(express.json());
    app.use("/api/game", gameModule.router);
    httpServer = createServer(app);
    gameModule.attachSocket(httpServer);

    await new Promise<void>((resolve) => {
      httpServer.listen(0, "127.0.0.1", resolve);
    });

    const address = httpServer.address() as AddressInfo;

    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    for (const client of clients.splice(0)) {
      client.disconnect();
    }

    await gameModule.shutdown();
    await new Promise<void>((resolve) => {
      httpServer.close(() => {
        resolve();
      });
    });
  });

  const openClient = async (): Promise<TestClient> => {
    const client = createSocketClient(`${baseUrl}${GAME_SOCKET_NAMESPACE}`, {
      transports: ["websocket"],
      forceNew: true,
    });

    clients.push(client);

    await new Promise<void>((resolve, reject) => {
      client.on("connect", () => {
        resolve();
      });
      client.on("connect_error", reject);
    });

    return client;
  };

  const sayHello = (client: TestClient, code: string, playerId: string): Promise<HelloAck> =>
    new Promise<HelloAck>((resolve) => {
      client.emit("room:hello", { code, playerId }, (ack: HelloAck) => {
        resolve(ack);
      });
    });

  const connect = async (code: string, playerId: string): Promise<TestClient> => {
    const client = await openClient();
    const acknowledgement = await sayHello(client, code, playerId);

    expect(acknowledgement.ok).toBe(true);

    return client;
  };

  const seatThreePlayers = async (): Promise<{
    code: string;
    host: TestClient;
    second: TestClient;
    third: TestClient;
  }> => {
    const api = request(baseUrl);
    const created = await api.post("/api/game/rooms").send({});
    const code = created.body.data.code as string;
    const hostId = created.body.data.playerId as string;
    const secondId = await api
      .post(`/api/game/rooms/${code}/join`)
      .send({})
      .then((response) => response.body.data.playerId as string);
    const thirdId = await api
      .post(`/api/game/rooms/${code}/join`)
      .send({})
      .then((response) => response.body.data.playerId as string);

    return {
      code,
      host: await connect(code, hostId),
      second: await connect(code, secondId),
      third: await connect(code, thirdId),
    };
  };

  it("answers a clock ping with the server time", async () => {
    const created = await request(baseUrl).post("/api/game/rooms").send({});
    const client = await connect(
      created.body.data.code as string,
      created.body.data.playerId as string,
    );
    const serverNow = await new Promise<number>((resolve) => {
      client.emit("time:ping", (now: number) => {
        resolve(now);
      });
    });

    expect(typeof serverNow).toBe("number");
    expect(Math.abs(serverNow - Date.now())).toBeLessThan(5_000);
  });

  it("refuses a hello for a room the player does not belong to", async () => {
    const created = await request(baseUrl).post("/api/game/rooms").send({});
    const client = await openClient();
    const acknowledgement = await sayHello(
      client,
      created.body.data.code as string,
      "f".repeat(32),
    );

    expect(acknowledgement).toMatchObject({ ok: false, error: { code: "NOT_IN_ROOM" } });
  });

  it("drives three phones from the lobby through to the results", async () => {
    const room = await seatThreePlayers();
    const lobbyStatePromise = waitForState(room.host, (state) =>
      state.players.every((player) => player.isConnected),
    );

    room.second.emit("lobby:setReady", { isReady: true });

    const lobbyState = await lobbyStatePromise;

    expect(lobbyState.players).toHaveLength(3);

    const carStatePromise = waitForState(room.host, (state) =>
      state.players.some((player) => player.carNumber === 7),
    );

    room.host.emit("lobby:setCar", { carNumber: 7, colour: null, emoji: "☕" });
    await carStatePromise;

    room.host.emit("lobby:setReady", { isReady: true });
    room.third.emit("lobby:setReady", { isReady: true });

    const readyState = await waitForState(room.host, (state) =>
      state.players.every((player) => player.isReady),
    );

    expect(readyState.status).toBe("LOBBY");

    const countdownPromise = waitFor<{ raceStartsAt: string }>(room.second, "race:countdown");
    const goPromise = waitFor<{ raceEndsAt: string }>(room.third, "race:go", GO_TIMEOUT_MS);

    room.host.emit("race:start", { force: false });

    const countdown = await countdownPromise;

    expect(Date.parse(countdown.raceStartsAt)).toBeGreaterThan(Date.now());
    await goPromise;

    const ghostPromise = waitFor<{ carNumber: number; progress: number }>(room.host, "race:ghost");

    room.third.emit("race:pos", { x: 10, y: 20, heading: 0.5, lap: 1, progress: 1.5 });

    expect(await ghostPromise).toMatchObject({ carNumber: 3, progress: 1.5 });

    const resultsPromise = waitFor<RaceResult>(room.host, "race:results");

    room.second.emit("race:finish", cleanFinish(LAP_MS * 3));
    room.host.emit("race:finish", cleanFinish(LAP_MS * 3 + 6_000));
    room.third.emit("race:finish", { finishMs: 900, lapSplits: [300, 600, 900] });

    const results = await resultsPromise;

    expect(results.standings.map((standing) => standing.carNumber)).toEqual([2, 7, 3]);
    expect(results.standings[2]).toMatchObject({ rank: 3, suspect: true });
    expect(results.payerCarNumber).toBe(3);
    expect(saved).toHaveLength(1);

    const snapshot = await request(baseUrl).get(`/api/game/rooms/${room.code}`);

    expect(snapshot.body.data.state.status).toBe("RESULTS");
  }, 30_000);

  it("keeps a disconnected slot alive during the race", async () => {
    const room = await seatThreePlayers();
    const goPromise = waitFor<{ raceEndsAt: string }>(room.host, "race:go", GO_TIMEOUT_MS);

    room.host.emit("race:start", { force: true });
    await goPromise;

    const dropPromise = waitForState(
      room.host,
      (state) => state.players.filter((player) => player.isConnected).length === 2,
    );

    room.third.disconnect();

    const state = await dropPromise;

    expect(state.players).toHaveLength(3);
    expect(state.status).toBe("RACING");
  }, 30_000);
});
