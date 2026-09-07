import express from "express";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { io as createSocketClient, type Socket as ClientSocket } from "socket.io-client";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ARENA_SOCKET_NAMESPACE,
  ARENA_SOCKET_PATH,
  COUNTDOWN_MS,
  ROUND_MS,
  type ArenaResult,
  type ArenaRoomState,
} from "../src/modules/arena/arena-contract.js";
import type { ArenaResultRepository } from "../src/modules/arena/arena-result-repository.js";
import type { NewArenaResultRecord } from "../src/modules/arena/arena-types.js";
import { createArenaModule, type ArenaModule } from "../src/modules/arena/index.js";
import { GAME_SOCKET_NAMESPACE } from "../src/modules/game/game-contract.js";
import type { GameResultRepository } from "../src/modules/game/game-result-repository.js";
import { createGameModule, type GameModule } from "../src/modules/game/index.js";

/** Untyped on purpose: `io()` always returns the default event maps. */
type TestClient = ClientSocket;

type HelloAck = { ok: true; state: ArenaRoomState } | { ok: false; error: { code: string } };

const saved: NewArenaResultRecord[] = [];
const resultRepository: ArenaResultRepository = {
  create: (record) => {
    saved.push(record);

    return Promise.resolve({
      roomCode: record.roomCode,
      arenaId: record.arenaId,
      finishedAt: record.finishedAt.toISOString(),
      standings: record.standings,
      payerBadgeNumber: record.payerBadgeNumber,
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
  predicate: (state: ArenaRoomState) => boolean,
  timeoutMs = 10_000,
): Promise<ArenaRoomState> =>
  new Promise<ArenaRoomState>((resolve, reject) => {
    const handler = (payload: unknown): void => {
      const state = payload as ArenaRoomState;

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

describe("arena socket namespace", () => {
  let arenaModule: ArenaModule;
  let httpServer: HttpServer;
  let baseUrl: string;
  const clients: TestClient[] = [];

  beforeEach(async () => {
    saved.length = 0;
    arenaModule = createArenaModule({
      clientUrl: "http://localhost:5173",
      roomTtlMinutes: 60,
      resultTtlHours: 24,
      maxRoomsPerIpPerHour: 100,
      resultRepository,
    });

    const app = express();

    app.use(express.json());
    app.use("/api/arena", arenaModule.router);
    httpServer = createServer(app);
    arenaModule.attachSocket(httpServer);

    await new Promise<void>((resolve) => {
      httpServer.listen(0, "127.0.0.1", resolve);
    });

    baseUrl = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    for (const client of clients.splice(0)) {
      client.disconnect();
    }

    await arenaModule.shutdown();
    await new Promise<void>((resolve) => {
      httpServer.close(() => {
        resolve();
      });
    });
  });

  const openClient = async (): Promise<TestClient> => {
    const client = createSocketClient(`${baseUrl}${ARENA_SOCKET_NAMESPACE}`, {
      path: ARENA_SOCKET_PATH,
      transports: ["websocket"],
      forceNew: true,
    });

    clients.push(client);

    await new Promise<void>((resolve, reject) => {
      client.on("connect", resolve);
      client.on("connect_error", reject);
    });

    return client;
  };

  const hello = (client: TestClient, code: string, playerId: string): Promise<HelloAck> =>
    new Promise<HelloAck>((resolve) => {
      client.emit("room:hello", { code, playerId }, resolve);
    });

  /** Creates a room over REST and attaches `count` sockets to it. */
  const seatRoom = async (
    count: number,
  ): Promise<{ code: string; playerIds: string[]; sockets: TestClient[] }> => {
    const created = await request(baseUrl).post("/api/arena/rooms").send({});
    const code = created.body.data.code as string;
    const playerIds = [created.body.data.playerId as string];

    for (let seat = 1; seat < count; seat += 1) {
      const joined = await request(baseUrl).post(`/api/arena/rooms/${code}/join`).send({});

      playerIds.push(joined.body.data.playerId as string);
    }

    const sockets: TestClient[] = [];

    for (const playerId of playerIds) {
      const client = await openClient();
      const ack = await hello(client, code, playerId);

      expect(ack.ok).toBe(true);
      sockets.push(client);
    }

    return { code, playerIds, sockets };
  };

  it("rejects an unknown room on hello", async () => {
    const client = await openClient();
    const ack = await hello(client, "AB23", "f".repeat(32));

    expect(ack).toMatchObject({ ok: false, error: { code: "ROOM_NOT_FOUND" } });
  });

  it("hands out the server clock so phones can correct their offset", async () => {
    const client = await openClient();
    const before = Date.now();
    const serverNow = await new Promise<number>((resolve) => {
      client.emit("time:ping", resolve);
    });

    expect(serverNow).toBeGreaterThanOrEqual(before);
    expect(serverNow).toBeLessThanOrEqual(Date.now());
  });

  it("broadcasts readiness to the whole room", async () => {
    const { sockets } = await seatRoom(2);
    const [host, guest] = sockets as [TestClient, TestClient];
    const settled = waitForState(host, (state) => state.players.every((player) => player.isReady));

    host.emit("lobby:setReady", { isReady: true });
    guest.emit("lobby:setReady", { isReady: true });

    const state = await settled;

    expect(state.players).toHaveLength(2);
    expect(state.status).toBe("LOBBY");
  });

  it("refuses to start the round for anyone but the host", async () => {
    const { sockets } = await seatRoom(2);
    const [host, guest] = sockets as [TestClient, TestClient];
    const failure = waitFor<{ code: string }>(guest, "game:error");

    host.emit("lobby:setReady", { isReady: true });
    guest.emit("lobby:setReady", { isReady: true });
    guest.emit("round:start", { force: false });

    expect((await failure).code).toBe("NOT_HOST");
  });

  it("runs a full round from lobby to results and names a payer", async () => {
    const { code, sockets } = await seatRoom(3);
    const [host, second, third] = sockets as [TestClient, TestClient, TestClient];

    for (const client of sockets) {
      client.emit("lobby:setReady", { isReady: true });
    }

    await waitForState(host, (state) => state.players.every((player) => player.isReady));

    // Every listener is attached before the round starts: BATTLE is broadcast
    // the instant the countdown elapses, so subscribing afterwards races it.
    const countdown = waitFor<{ roundStartsAt: string }>(host, "round:countdown");
    const go = waitFor<{ roundEndsAt: string }>(host, "round:go", COUNTDOWN_MS + 7_000);
    const battleState = waitForState(
      host,
      (state) => state.status === "BATTLE",
      COUNTDOWN_MS + 7_000,
    );
    const results = waitFor<ArenaResult>(host, "round:results", ROUND_MS + 15_000);

    host.emit("round:start", { force: false });

    const countdownPayload = await countdown;

    expect(Date.parse(countdownPayload.roundStartsAt)).toBeGreaterThan(Date.now() - 1_000);

    const goPayload = await go;

    // The whistle is a wall-clock timer inside the service, so the round really
    // does run its full length here rather than being fast-forwarded.
    expect(Date.parse(goPayload.roundEndsAt)).toBeGreaterThan(Date.now());

    const battle = await battleState;

    expect(battle.roundStartsAt).not.toBeNull();

    // Everyone reports a pose so the server has somewhere to put them, then the
    // host throws. Whether it connects is the server's business, not ours.
    for (const client of [host, second, third]) {
      client.emit("arena:pos", { x: 400, y: 1120, aim: 0 });
    }

    host.emit("arena:fire", { x: 400, y: 1120, angle: 0 });

    const result: ArenaResult = await results;

    expect(result.roomCode).toBe(code);
    expect(result.standings).toHaveLength(3);
    expect(result.standings.map((standing) => standing.rank)).toEqual([1, 2, 3]);
    expect(result.payerBadgeNumber).toBe(result.standings[2]?.badgeNumber);
    expect(saved).toHaveLength(1);
    expect(saved[0]?.expiresAt.getTime()).toBeGreaterThan(Date.now());
  }, 150_000);

  it("promotes the next player when the host leaves", async () => {
    const { playerIds, sockets } = await seatRoom(2);
    const [host, guest] = sockets as [TestClient, TestClient];
    const promoted = waitForState(guest, (state) => state.hostPlayerId === playerIds[1]);

    host.emit("room:leave");

    const state = await promoted;

    expect(state.players).toHaveLength(1);
  });
});

/**
 * The whole reason Bean Blasters runs its own Socket.IO server on its own path
 * (BEAN-BLASTERS.md section 8): two Socket.IO servers can share one HTTP server
 * only when their paths differ. If this ever regresses, one game's handshake
 * starts answering the other's clients.
 */
describe("both games' sockets on one HTTP server", () => {
  let arenaModule: ArenaModule;
  let gameModule: GameModule;
  let httpServer: HttpServer;
  let baseUrl: string;
  const clients: TestClient[] = [];

  beforeEach(async () => {
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

    arenaModule = createArenaModule({
      clientUrl: "http://localhost:5173",
      roomTtlMinutes: 60,
      resultTtlHours: 24,
      maxRoomsPerIpPerHour: 100,
      resultRepository,
    });
    gameModule = createGameModule({
      clientUrl: "http://localhost:5173",
      roomTtlMinutes: 60,
      resultTtlHours: 24,
      maxRoomsPerIpPerHour: 100,
      resultRepository: gameResultRepository,
    });

    const app = express();

    app.use(express.json());
    app.use("/api/arena", arenaModule.router);
    app.use("/api/game", gameModule.router);
    httpServer = createServer(app);

    // Exactly the order server.ts uses.
    gameModule.attachSocket(httpServer);
    arenaModule.attachSocket(httpServer);

    await new Promise<void>((resolve) => {
      httpServer.listen(0, "127.0.0.1", resolve);
    });

    baseUrl = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    for (const client of clients.splice(0)) {
      client.disconnect();
    }

    await arenaModule.shutdown();
    await gameModule.shutdown();
    await new Promise<void>((resolve) => {
      httpServer.close(() => {
        resolve();
      });
    });
  });

  const connect = async (namespace: string, path?: string): Promise<TestClient> => {
    const client = createSocketClient(`${baseUrl}${namespace}`, {
      ...(path ? { path } : {}),
      transports: ["websocket"],
      forceNew: true,
    });

    clients.push(client);

    await new Promise<void>((resolve, reject) => {
      client.on("connect", resolve);
      client.on("connect_error", reject);
    });

    return client;
  };

  it("lets a client reach either game without disturbing the other", async () => {
    const arenaClient = await connect(ARENA_SOCKET_NAMESPACE, ARENA_SOCKET_PATH);
    const kartClient = await connect(GAME_SOCKET_NAMESPACE);

    expect(arenaClient.connected).toBe(true);
    expect(kartClient.connected).toBe(true);

    // Each server answers only its own clients: an unknown room on one game
    // must not be resolved by the other's store.
    const arenaAck = await new Promise<HelloAck>((resolve) => {
      arenaClient.emit("room:hello", { code: "AB23", playerId: "f".repeat(32) }, resolve);
    });

    expect(arenaAck).toMatchObject({ ok: false, error: { code: "ROOM_NOT_FOUND" } });
  });
});
