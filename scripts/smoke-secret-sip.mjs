// Creates and releases one ephemeral game table. Never touches shop data.
// Usage: node scripts/smoke-secret-sip.mjs <frontend-origin> <api-origin>
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { io } from "socket.io-client";

const [frontend, api] = process.argv.slice(2);
if (!frontend || !api) throw new Error("Provide frontend and API origins.");
for (const origin of [frontend, api]) new URL(origin);
const rest = async (path, method = "GET") => {
  const response = await fetch(`${frontend}${path}`, {
    method,
    ...(method === "POST" ? { headers: { "Content-Type": "application/json" }, body: "{}" } : {}),
    signal: AbortSignal.timeout(90_000),
  });
  assert.equal(response.status < 300, true, `${path}: HTTP ${response.status}`);
  const body = await response.json();
  assert.equal(body.success, true);
  return body.data;
};
const clients = [];
const identities = [];
const states = new Map();
const until = async (predicate, label, timeout = 20_000) => {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`Timed out: ${label}`);
    await delay(50);
  }
};
const connect = async (identity, index) => {
  const client = io(api, {
    path: "/sip-socket.io",
    transports: ["websocket"],
    auth: identity,
    extraHeaders: { Origin: frontend },
    autoConnect: false,
    reconnection: false,
  });
  clients[index] = client;
  client.on("sip:state", (state) => states.set(index, state));
  client.connect();
  await until(() => client.connected && states.has(index), "private socket handshake");
  return client;
};
const act = async (index, value) => {
  const result = await clients[index]
    .timeout(8000)
    .emitWithAck("sip:action", { round: states.get(index).round, ...value });
  assert.equal(result.ok, true, result.message);
};
try {
  await rest("/api/sip/health");
  console.log("PASS: frontend REST proxy reaches Secret Sip.");
  const host = await rest("/api/sip/rooms", "POST");
  identities.push(host);
  for (let i = 1; i < 3; i++)
    identities.push(await rest(`/api/sip/rooms/${host.code}/join`, "POST"));
  for (let i = 0; i < 3; i++) await connect(identities[i], i);
  for (let i = 0; i < 3; i++) await act(i, { type: "ready", ready: true });
  const hostIndex = [...states].find(([, state]) => state.youId === state.hostId)[0];
  await act(hostIndex, { type: "start" });
  await until(() => [...states.values()].every((s) => s.phase === "REVEAL"), "roles dealt");
  const bluffer = [...states].find(([, state]) => state.role === "BLUFFER")[0];
  assert.equal([...states.values()].filter((s) => s.role === "BLUFFER").length, 1);
  assert.equal(states.get(bluffer).word, null);
  const words = [...states.values()].filter((s) => s.role === "REGULAR").map((s) => s.word);
  assert.ok(words[0]);
  assert.equal(words[0], words[1]);
  console.log("PASS: three phones receive correctly isolated secret roles.");
  await until(() => states.get(0).phase === "CLUES", "timed clue phase");
  for (let turn = 0; turn < 3; turn++) {
    const turnId = states.get(0).turnId;
    const speaker = [...states].find(([, s]) => s.youId === turnId)[0];
    await act(speaker, { type: "clue" });
    await until(() => states.get(0).turnId !== turnId, "next clue");
  }
  assert.equal(states.get(0).phase, "DISCUSS");
  await act(hostIndex, { type: "discussed" });
  await until(() => [...states.values()].every((s) => s.phase === "VOTING"), "private voting");
  for (let i = 0; i < 3; i++)
    await act(i, {
      type: "vote",
      targetId: states.get(i === bluffer ? (i + 1) % 3 : bluffer).youId,
    });
  await until(() => states.get(bluffer).phase === "GUESS", "caught bluffer");
  await act(bluffer, { type: "guess", word: words[0] });
  await until(() => [...states.values()].every((s) => s.phase === "RESULTS"), "results");
  assert.equal(states.get(0).result.reason, "GUESSED");
  assert.equal(states.get(0).players.find((p) => p.id === states.get(bluffer).youId).score, 3);
  console.log("PASS: turns, secret votes, final guess, results and score.");
  const other = (hostIndex + 1) % 3;
  const originalId = states.get(other).youId;
  clients[other].disconnect();
  states.delete(other);
  await until(
    () => !states.get(hostIndex).players.find((p) => p.id === originalId).connected,
    "disconnect observed",
  );
  await act(hostIndex, { type: "rematch" });
  await connect(identities[other], other);
  assert.equal(states.get(other).phase, "LOBBY");
  assert.equal(states.get(other).youId, originalId);
  console.log("PASS: refresh during rematch preserves the original seat.");
  // A leave may close its socket before the acknowledgement arrives.
  for (let i = 0; i < 3; i++) {
    clients[i].emit("sip:action", { type: "leave", round: states.get(i).round }, () => undefined);
    await until(() => !clients[i].connected, "seat released");
  }
  console.log("PASS: test table released. Secret Sip production smoke passed.");
} finally {
  clients.forEach((client) => client.disconnect());
}
