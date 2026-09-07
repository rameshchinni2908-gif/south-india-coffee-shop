import { randomBytes, randomInt, randomUUID } from "node:crypto";

import { HttpError } from "../../middleware/http-error.js";
import {
  SIP_MAX_PLAYERS,
  SIP_MIN_PLAYERS,
  SIP_TIMING,
  type SipAction,
  type SipIdentity,
  type SipPhase,
  type SipPlayer,
  type SipResult,
  type SipState,
} from "./sip-contract.js";
import { normalizeSipWord, SIP_WORDS } from "./sip-words.js";

interface Player extends SipPlayer {
  token: string;
  connections: number;
  vote: string | null;
}
interface Room {
  code: string;
  round: number;
  phase: SipPhase;
  hostId: string;
  players: Player[];
  expiresAt: number;
  deadline: number | null;
  turn: number;
  order: string[];
  blufferId: string;
  wordIndex: number;
  usedWords: number[];
  result: SipResult | null;
}
const fail = (message: string, code = "INVALID_ACTION", status = 409): never => {
  throw new HttpError(status, code, message);
};
export const createSipService = ({
  ttlMinutes,
  now = Date.now,
  pick = randomInt,
}: {
  ttlMinutes: number;
  now?: () => number;
  pick?: (max: number) => number;
}) => {
  const rooms = new Map<string, Room>();
  let listener: (code: string) => void = () => undefined;
  const getRoom = (code: string): Room => {
    const room = rooms.get(code);
    if (!room || room.expiresAt <= now()) {
      rooms.delete(code);
      return fail("This table has closed. Create a new one.", "ROOM_CLOSED", 404);
    }
    return room;
  };
  const seat = (room: Room, token: string): Player =>
    room.players.find((p) => p.token === token) ??
    fail("Rejoin this table from your original phone.", "INVALID_SESSION", 403);
  const changed = (room: Room) => listener(room.code);
  const phase = (room: Room, next: SipPhase, duration?: number) => {
    room.phase = next;
    room.deadline = duration === undefined ? null : now() + duration;
  };
  const finish = (
    room: Room,
    winner: SipResult["winner"],
    reason: SipResult["reason"],
    guess: string | null = null,
  ) => {
    if (room.phase === "RESULTS") return;
    room.result = {
      winner,
      reason,
      blufferId: room.blufferId,
      word: SIP_WORDS[room.wordIndex]!.aliases[0]!,
      guess,
      votes: room.players
        .filter((p) => p.vote !== null)
        .map((p) => ({ voterId: p.id, targetId: p.vote! })),
    };
    for (const player of room.players) {
      if (winner === "BLUFFER" && player.id === room.blufferId) player.score += 3;
      if (winner === "TABLE" && player.id !== room.blufferId) player.score += 2;
    }
    phase(room, "RESULTS");
  };
  const resolveVotes = (room: Room) => {
    const counts = new Map<string, number>();
    for (const player of room.players)
      if (player.vote) counts.set(player.vote, (counts.get(player.vote) ?? 0) + 1);
    const sorted = [...counts].sort((a, b) => b[1] - a[1]);
    if (!sorted[0] || sorted[0][1] === sorted[1]?.[1]) finish(room, "BLUFFER", "TIE");
    else if (sorted[0][0] === room.blufferId) phase(room, "GUESS", SIP_TIMING.guess);
    else finish(room, "BLUFFER", "ESCAPED");
  };
  const nextClue = (room: Room) => {
    room.turn += 1;
    if (room.turn >= room.order.length) phase(room, "DISCUSS", SIP_TIMING.discuss);
    else phase(room, "CLUES", SIP_TIMING.clue);
  };
  const expirePhase = (room: Room) => {
    if (room.deadline === null || now() < room.deadline) return;
    switch (room.phase) {
      case "REVEAL":
        phase(room, "CLUES", SIP_TIMING.clue);
        break;
      case "CLUES":
        nextClue(room);
        break;
      case "DISCUSS":
        phase(room, "VOTING", SIP_TIMING.vote);
        break;
      case "VOTING":
        resolveVotes(room);
        break;
      case "GUESS":
        finish(room, "TABLE", "CAUGHT");
        break;
    }
    changed(room);
  };
  const addPlayer = (room: Room): SipIdentity => {
    if (room.phase !== "LOBBY")
      return fail(
        "A round is in progress. Join when the host opens the next round.",
        "IN_PROGRESS",
      );
    if (room.players.length >= SIP_MAX_PLAYERS)
      return fail("This table already has eight players.", "ROOM_FULL");
    const token = randomBytes(32).toString("hex");
    let number = 1;
    while (room.players.some((p) => p.seat === number)) number += 1;
    const player: Player = {
      id: randomUUID(),
      token,
      seat: number,
      connections: 0,
      connected: false,
      ready: false,
      score: 0,
      vote: null,
      voted: false,
    };
    room.players.push(player);
    if (!room.hostId) room.hostId = player.id;
    changed(room);
    return { code: room.code, token };
  };
  return {
    setListener(value: (code: string) => void) {
      listener = value;
    },
    create(): SipIdentity {
      this.tick();
      if (rooms.size >= 500)
        return fail("All tables are busy. Please try again shortly.", "SERVER_FULL", 503);
      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      let code: string;
      do {
        code = Array.from({ length: 5 }, () => alphabet[randomInt(alphabet.length)]).join("");
      } while (rooms.has(code));
      const room: Room = {
        code,
        round: 0,
        phase: "LOBBY",
        hostId: "",
        players: [],
        expiresAt: now() + ttlMinutes * 60_000,
        deadline: null,
        turn: 0,
        order: [],
        blufferId: "",
        wordIndex: -1,
        usedWords: [],
        result: null,
      };
      rooms.set(code, room);
      return addPlayer(room);
    },
    join(code: string) {
      return addPlayer(getRoom(code));
    },
    state(code: string, token: string): SipState {
      const room = getRoom(code);
      const player = seat(room, token);
      const active = room.phase !== "LOBBY" && room.phase !== "RESULTS";
      const word = SIP_WORDS[room.wordIndex];
      return {
        code,
        round: room.round,
        phase: room.phase,
        hostId: room.hostId,
        youId: player.id,
        players: room.players.map(({ id, seat: number, connected, ready, score, vote }) => ({
          id,
          seat: number,
          connected,
          ready,
          score,
          voted: vote !== null,
        })),
        serverNow: now(),
        deadline: room.deadline,
        turnId: room.phase === "CLUES" ? (room.order[room.turn] ?? null) : null,
        category: active ? word!.category : null,
        role: active ? (player.id === room.blufferId ? "BLUFFER" : "REGULAR") : null,
        word: active && player.id !== room.blufferId ? word!.aliases[0]! : null,
        yourVote: player.vote,
        result: room.result,
      };
    },
    connect(code: string, token: string) {
      const room = getRoom(code);
      const player = seat(room, token);
      if (player.connections >= 3)
        return fail("This seat is open on too many screens. Close an extra tab.");
      player.connections += 1;
      player.connected = true;
      if (!room.players.some((p) => p.id === room.hostId && p.connected)) room.hostId = player.id;
      changed(room);
    },
    disconnect(code: string, token: string) {
      const room = rooms.get(code);
      const player = room?.players.find((p) => p.token === token);
      if (!room || !player) return;
      player.connections = Math.max(0, player.connections - 1);
      player.connected = player.connections > 0;
      if (!player.connected) player.ready = false;
      if (!player.connected && room.hostId === player.id)
        room.hostId = room.players.find((p) => p.connected)?.id ?? player.id;
      changed(room);
    },
    act(code: string, token: string, action: SipAction) {
      const room = getRoom(code);
      const player = seat(room, token);
      expirePhase(room);
      if (action.round !== room.round) return fail("The round changed. Try again.");
      const requirePhase = (expected: SipPhase) => {
        if (room.phase !== expected) fail("That action is not available in this phase.");
      };
      const requireHost = () => {
        if (room.hostId !== player.id) fail("Only the host can do that.", "HOST_ONLY", 403);
      };
      switch (action.type) {
        case "ready":
          requirePhase("LOBBY");
          player.ready = action.ready;
          break;
        case "start": {
          requireHost();
          requirePhase("LOBBY");
          if (
            room.players.length < SIP_MIN_PLAYERS ||
            !room.players.every((p) => p.ready && p.connected)
          )
            return fail("At least three players must join, connect, and be ready.");
          const candidates = room.players.filter((p) => p.id !== room.blufferId);
          room.blufferId = candidates[pick(candidates.length)]!.id;
          if (room.usedWords.length === SIP_WORDS.length) room.usedWords = [];
          const words = SIP_WORDS.map((_, i) => i).filter((i) => !room.usedWords.includes(i));
          room.wordIndex = words[pick(words.length)]!;
          room.usedWords.push(room.wordIndex);
          const offset = pick(room.players.length);
          room.order = [...room.players.slice(offset), ...room.players.slice(0, offset)].map(
            (p) => p.id,
          );
          room.round += 1;
          room.turn = 0;
          room.result = null;
          room.players.forEach((p) => {
            p.vote = null;
          });
          phase(room, "REVEAL", SIP_TIMING.reveal);
          break;
        }
        case "clue":
          requirePhase("CLUES");
          if (room.order[room.turn] !== player.id)
            return fail("Wait for your turn to give a clue.");
          nextClue(room);
          break;
        case "discussed":
          requireHost();
          requirePhase("DISCUSS");
          phase(room, "VOTING", SIP_TIMING.vote);
          break;
        case "remove": {
          requireHost();
          requirePhase("LOBBY");
          const target = room.players.find((p) => p.id === action.targetId);
          if (!target || target.connected || target.id === player.id)
            return fail("Only disconnected seats can be removed.");
          room.players = room.players.filter((p) => p.id !== target.id);
          break;
        }
        case "vote":
          requirePhase("VOTING");
          if (player.vote) return fail("Your vote is already locked.");
          if (action.targetId === player.id || !room.players.some((p) => p.id === action.targetId))
            return fail("Choose another player at this table.");
          player.vote = action.targetId;
          if (room.players.every((p) => p.vote !== null)) resolveVotes(room);
          break;
        case "guess":
          requirePhase("GUESS");
          if (player.id !== room.blufferId)
            return fail("Only the bluffer gets the last guess.", "BLUFFER_ONLY", 403);
          if (
            SIP_WORDS[room.wordIndex]!.aliases.some(
              (word) => normalizeSipWord(word) === normalizeSipWord(action.word),
            )
          )
            finish(room, "BLUFFER", "GUESSED", action.word);
          else finish(room, "TABLE", "CAUGHT", action.word);
          break;
        case "rematch":
          requireHost();
          requirePhase("RESULTS");
          phase(room, "LOBBY");
          room.result = null;
          room.players.forEach((p) => {
            p.ready = false;
            p.vote = null;
          });
          break;
        case "leave":
          if (room.phase !== "LOBBY" && room.phase !== "RESULTS")
            return fail("This round is running. You can leave after the reveal.");
          room.players = room.players.filter((p) => p.id !== player.id);
          if (!room.players.length) {
            rooms.delete(code);
            listener(code);
            return;
          }
          if (room.hostId === player.id)
            room.hostId = (room.players.find((p) => p.connected) ?? room.players[0]!).id;
          break;
      }
      changed(room);
    },
    tick() {
      for (const room of rooms.values()) {
        if (room.expiresAt <= now()) {
          rooms.delete(room.code);
          listener(room.code);
        } else expirePhase(room);
      }
    },
    clear() {
      rooms.clear();
    },
  };
};
export type SipService = ReturnType<typeof createSipService>;
