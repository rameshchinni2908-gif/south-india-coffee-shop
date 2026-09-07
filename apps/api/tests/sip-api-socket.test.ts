import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import request from "supertest";
import { io, type Socket } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";

import { errorHandler } from "../src/middleware/error-handler.js";
import { createSipModule } from "../src/modules/secret-sip/index.js";
import {
  SIP_SOCKET_PATH,
  SIP_TIMING,
  type SipIdentity,
  type SipAction,
  type SipReply,
  type SipState,
  type SipClientEvents,
  type SipServerEvents,
} from "../src/modules/secret-sip/sip-contract.js";

type Client = Socket<SipServerEvents, SipClientEvents>;
const clients: Client[] = [];
const modules: ReturnType<typeof createSipModule>[] = [];
const servers: Server[] = [];
afterEach(async () => {
  clients.splice(0).forEach((s) => s.disconnect());
  for (const module of modules.splice(0)) await module.shutdown();
  for (const server of servers.splice(0))
    await new Promise<void>((resolve) => server.close(() => resolve()));
});
const setup = (limit = 10) => {
  let time = Date.now();
  const module = createSipModule({
    clientUrl: "http://localhost:5173",
    roomTtlMinutes: 60,
    maxRoomsPerIpPerHour: limit,
    now: () => time,
  });
  modules.push(module);
  const app = express();
  app.use(express.json());
  app.use("/api/sip", module.router);
  app.use(errorHandler);
  return {
    app,
    module,
    advance: (ms: number) => {
      time += ms;
      module.service.tick();
    },
  };
};
const nextState = (
  client: Client,
  predicate: (state: SipState) => boolean = () => true,
): Promise<SipState> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.off("sip:state", handler);
      reject(new Error("State timed out"));
    }, 3000);
    const handler = (state: SipState) => {
      if (predicate(state)) {
        clearTimeout(timer);
        client.off("sip:state", handler);
        resolve(state);
      }
    };
    client.on("sip:state", handler);
  });
const action = (client: Client, value: SipAction): Promise<SipReply> =>
  client.timeout(3000).emitWithAck("sip:action", value);
describe("Secret Sip HTTP and live transport", () => {
  it("validates requests, rate limits creation, and never returns secrets in REST", async () => {
    const { app } = setup(2);
    expect((await request(app).get("/api/sip/health")).body.data.enabled).toBe(true);
    expect((await request(app).post("/api/sip/rooms").send({ role: "BLUFFER" })).status).toBe(400);
    const created = await request(app).post("/api/sip/rooms").send({});
    expect(created.status).toBe(201);
    expect(created.body.data.code).toMatch(/^[A-HJ-NP-Z2-9]{5}$/);
    expect(Object.keys(created.body.data).sort()).toEqual(["code", "token"]);
    expect(created.headers["cache-control"]).toBe("private, no-store");
    expect((await request(app).post("/api/sip/rooms").send({})).status).toBe(429);
    expect((await request(app).post("/api/sip/rooms/invalid/join").send({})).status).toBe(400);
    expect((await request(app).post("/api/sip/rooms/AAAAA/join").send({})).status).toBe(404);
  });
  it("plays a real three-client round with private projections and rejects impersonation", async () => {
    const t = setup();
    const server = createServer(t.app);
    servers.push(server);
    t.module.attachSocket(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const identity = t.module.service.create();
    const identities: SipIdentity[] = [
      identity,
      t.module.service.join(identity.code),
      t.module.service.join(identity.code),
    ];
    const states: SipState[] = [];
    for (const id of identities) {
      const client: Client = io(url, {
        path: SIP_SOCKET_PATH,
        transports: ["websocket"],
        auth: id,
        autoConnect: false,
        reconnection: false,
      });
      clients.push(client);
      const received = nextState(client);
      client.connect();
      states.push(await received);
    }
    for (const client of clients)
      expect((await action(client, { type: "ready", round: 0, ready: true })).ok).toBe(true);
    expect((await action(clients[1]!, { type: "start", round: 0 })).ok).toBe(false);
    const dealt = clients.map((client) => nextState(client, (state) => state.phase === "REVEAL"));
    expect((await action(clients[0]!, { type: "start", round: 0 })).ok).toBe(true);
    const roles = await Promise.all(dealt);
    const spy = roles.findIndex((state) => state.role === "BLUFFER");
    expect(roles.filter((state) => state.role === "BLUFFER")).toHaveLength(1);
    expect(roles[spy]!.word).toBeNull();
    for (const state of roles) expect(JSON.stringify(state)).not.toContain(identity.token);
    const rejected: Client = io(url, {
      path: SIP_SOCKET_PATH,
      transports: ["websocket"],
      auth: { code: identity.code, token: roles[0]!.youId },
      autoConnect: false,
      reconnection: false,
    });
    clients.push(rejected);
    const error = new Promise<Error>((resolve) => rejected.once("connect_error", resolve));
    rejected.connect();
    expect((await error).message).toContain("original phone");
    t.advance(SIP_TIMING.reveal);
    for (let i = 0; i < 3; i++) t.advance(SIP_TIMING.clue);
    const voting = nextState(clients[0]!, (state) => state.phase === "VOTING");
    t.advance(SIP_TIMING.discuss);
    await voting;
    for (let i = 0; i < 3; i++) {
      const target = i === spy ? (i + 1) % 3 : spy;
      expect(
        (await action(clients[i]!, { type: "vote", round: 1, targetId: roles[target]!.youId })).ok,
      ).toBe(true);
    }
    const result = nextState(clients[0]!, (state) => state.phase === "RESULTS");
    t.advance(SIP_TIMING.guess);
    expect((await result).result?.winner).toBe("TABLE");
    expect((await action(clients[0]!, { type: "rematch", round: 1 })).ok).toBe(true);
    // Closing this game's socket must leave the shop's HTTP server running.
    await t.module.shutdown();
    expect((await request(server).get("/api/sip/health")).status).toBe(200);
  });
});
