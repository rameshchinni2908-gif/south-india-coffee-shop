import { HttpError } from "../../middleware/http-error.js";
import {
  BADGE_COLOURS,
  BADGE_EMOJIS,
  COMBAT_TICK_MS,
  COUNTDOWN_MS,
  DEFAULT_ARENA_ID,
  HEALTH,
  MAX_BADGE_NUMBER,
  MAX_PLAYERS,
  MIN_BADGE_NUMBER,
  MIN_PLAYERS,
  POWER_UP,
  ROUND_MS,
  SCORE_BROADCAST_INTERVAL_MS,
  WEAPON,
  findArena,
  findBadgeColour,
  type ArenaAmmoPayload,
  type ArenaDefinition,
  type ArenaGhostPayload,
  type ArenaHitPayload,
  type ArenaPadPayload,
  type ArenaPlayer,
  type ArenaPowerPayload,
  type ArenaRespawnPayload,
  type ArenaResult,
  type ArenaRoomState,
  type ArenaScoreEntry,
  type ArenaShotPayload,
  type PowerUpKind,
} from "./arena-contract.js";
import type { ArenaResultRepository } from "./arena-result-repository.js";
import { createPlayerId, type ArenaRoomStore } from "./arena-room-store.js";
import type {
  CreateArenaRoomInput,
  FirePayload,
  JoinArenaRoomInput,
  PositionPayload,
  SetBadgePayload,
} from "./arena-schemas.js";
import { buildArenaOutcome, type ArenaRankingEntry } from "./arena-standings.js";
import {
  ArenaError,
  type ArenaRoomPlayer,
  type ArenaRoomRecord,
  type PadState,
} from "./arena-types.js";
import {
  clampPosition,
  furthestSpawnPoint,
  resolveHit,
  spawnBeans,
  stepBeans,
  validateFire,
  type CombatTarget,
} from "./combat.js";

const HOUR_MS = 3_600_000;
/** A tick that arrives after a long stall is capped, so nothing teleports. */
const MAX_TICK_MS = 250;

export interface ArenaServiceListener {
  roomState(code: string, state: ArenaRoomState): void;
  countdown(code: string, payload: { roundStartsAt: string; serverTime: string }): void;
  go(code: string, payload: { roundEndsAt: string; serverTime: string }): void;
  shot(code: string, payload: ArenaShotPayload): void;
  hit(code: string, payload: ArenaHitPayload): void;
  respawn(code: string, payload: ArenaRespawnPayload): void;
  /** Ammo is nobody else's business, so this one is addressed to a player. */
  ammo(code: string, playerId: string, payload: ArenaAmmoPayload): void;
  pad(code: string, payload: ArenaPadPayload): void;
  power(code: string, payload: ArenaPowerPayload): void;
  scores(code: string, payload: { scores: readonly ArenaScoreEntry[] }): void;
  results(code: string, result: ArenaResult): void;
}

export interface CreatedArenaRoom {
  code: string;
  playerId: string;
  state: ArenaRoomState;
}

export interface JoinedArenaRoom {
  playerId: string;
  state: ArenaRoomState;
}

export interface ArenaService {
  createRoom(input: CreateArenaRoomInput): CreatedArenaRoom;
  join(code: string, input: JoinArenaRoomInput): JoinedArenaRoom;
  getState(code: string): ArenaRoomState;
  getResult(code: string): Promise<ArenaResult>;
  attach(code: string, playerId: string): ArenaRoomState;
  disconnect(code: string, playerId: string): void;
  leave(code: string, playerId: string): void;
  setReady(code: string, playerId: string, isReady: boolean): void;
  setBadge(code: string, playerId: string, input: SetBadgePayload): void;
  startRound(code: string, playerId: string, force: boolean): void;
  recordPosition(code: string, playerId: string, input: PositionPayload): ArenaGhostPayload | null;
  /** Validates and spawns. Never trusted for a hit — see BEAN-BLASTERS.md §7a. */
  recordFire(code: string, playerId: string, input: FirePayload): void;
  requestReload(code: string, playerId: string): void;
  rematch(code: string, playerId: string): void;
  setListener(listener: ArenaServiceListener): void;
  shutdown(): Promise<void>;
}

export interface CreateArenaServiceOptions {
  roomStore: ArenaRoomStore;
  resultRepository: ArenaResultRepository;
  resultTtlHours: number;
  now?: () => Date;
}

const noopListener: ArenaServiceListener = {
  roomState: () => undefined,
  countdown: () => undefined,
  go: () => undefined,
  shot: () => undefined,
  hit: () => undefined,
  respawn: () => undefined,
  ammo: () => undefined,
  pad: () => undefined,
  power: () => undefined,
  scores: () => undefined,
  results: () => undefined,
};

const toArenaPlayer = (player: ArenaRoomPlayer): ArenaPlayer => ({
  playerId: player.playerId,
  badgeNumber: player.badgeNumber,
  colour: player.colour,
  emoji: player.emoji,
  isReady: player.isReady,
  isConnected: player.isConnected,
  isHost: player.isHost,
  hearts: player.hearts,
  hits: player.hits,
  taken: player.taken,
  downs: player.downs,
});

const toRoomState = (room: ArenaRoomRecord, serverTime: Date): ArenaRoomState => ({
  code: room.code,
  status: room.status,
  arenaId: room.arenaId,
  hostPlayerId: room.hostPlayerId,
  players: room.players.map(toArenaPlayer),
  roundStartsAt: room.roundStartsAt ? room.roundStartsAt.toISOString() : null,
  roundEndsAt: room.roundEndsAt ? room.roundEndsAt.toISOString() : null,
  serverTime: serverTime.toISOString(),
});

const toCombatTarget = (player: ArenaRoomPlayer): CombatTarget => ({
  playerId: player.playerId,
  badgeNumber: player.badgeNumber,
  x: player.x,
  y: player.y,
  hearts: player.hearts,
  downedUntilMs: player.downedUntilMs,
  invulnerableUntilMs: player.invulnerableUntilMs,
});

const toScoreEntry = (player: ArenaRoomPlayer, nowMs: number): ArenaScoreEntry => ({
  badgeNumber: player.badgeNumber,
  hits: player.hits,
  taken: player.taken,
  downs: player.downs,
  hearts: player.hearts,
  downed: player.downedUntilMs > nowMs,
});

/** Lowest free number in 1..99, so a fresh table gets 01, 02, 03… */
const lowestFreeBadgeNumber = (room: ArenaRoomRecord): number => {
  const taken = new Set(room.players.map((player) => player.badgeNumber));

  for (let candidate = MIN_BADGE_NUMBER; candidate <= MAX_BADGE_NUMBER; candidate += 1) {
    if (!taken.has(candidate)) {
      return candidate;
    }
  }

  throw new ArenaError(409, "ROOM_FULL", "No badge number is available");
};

const firstFreeColour = (room: ArenaRoomRecord): string => {
  const taken = new Set(room.players.map((player) => player.colour));
  const colour = BADGE_COLOURS.find((candidate) => !taken.has(candidate.id));

  if (!colour) {
    throw new ArenaError(409, "ROOM_FULL", "No badge colour is available");
  }

  return colour.id;
};

const requireArena = (arenaId: string): ArenaDefinition => {
  const arena = findArena(arenaId);

  if (!arena) {
    throw new ArenaError(400, "INVALID_ARENA", "That arena does not exist");
  }

  return arena;
};

/**
 * Pads offer a fixed power-up rather than a random one: every player learns
 * which pad gives what, which turns the arena's four corners into a decision
 * instead of a lottery.
 */
const POWER_UP_ROTATION: readonly PowerUpKind[] = ["RAPID", "TRIPLE", "SHIELD", "REFILL"];

const padKindFor = (index: number): PowerUpKind =>
  POWER_UP_ROTATION[index % POWER_UP_ROTATION.length] ?? "REFILL";

/** Pads start full, so the first player to reach one is rewarded immediately. */
const buildPads = (arena: ArenaDefinition): PadState[] =>
  arena.padPoints.map((_point, index) => ({ kind: padKindFor(index), availableAtMs: 0 }));

const resetRoundState = (player: ArenaRoomPlayer): void => {
  player.hearts = HEALTH.startHearts;
  player.downedUntilMs = 0;
  player.invulnerableUntilMs = 0;
  player.ammo = WEAPON.clipSize;
  player.reloadingUntilMs = 0;
  player.powerUp = null;
  player.powerUpUntilMs = 0;
  player.shieldHits = 0;
  player.hits = 0;
  player.taken = 0;
  player.downs = 0;
  player.suspect = false;
  player.aim = 0;
  player.lastPositionAtMs = 0;
  player.lastFireAtMs = 0;
};

export const createArenaService = ({
  roomStore,
  resultRepository,
  resultTtlHours,
  now = () => new Date(),
}: CreateArenaServiceOptions): ArenaService => {
  let listener: ArenaServiceListener = noopListener;

  const requireRoom = (code: string): ArenaRoomRecord => {
    const room = roomStore.get(code);

    if (!room || room.status === "CLOSED") {
      throw new ArenaError(404, "ROOM_NOT_FOUND", "This arena room is no longer available");
    }

    if (room.expiresAt.getTime() <= now().getTime()) {
      roomStore.delete(code);
      throw new ArenaError(404, "ROOM_NOT_FOUND", "This arena room is no longer available");
    }

    return room;
  };

  const requirePlayer = (room: ArenaRoomRecord, playerId: string): ArenaRoomPlayer => {
    const player = room.players.find((candidate) => candidate.playerId === playerId);

    if (!player) {
      throw new ArenaError(403, "NOT_IN_ROOM", "You are not a player in this room");
    }

    return player;
  };

  const requireHost = (room: ArenaRoomRecord, playerId: string): ArenaRoomPlayer => {
    const player = requirePlayer(room, playerId);

    if (!player.isHost) {
      throw new ArenaError(403, "NOT_HOST", "Only the host can do that");
    }

    return player;
  };

  const publishState = (room: ArenaRoomRecord): void => {
    roomStore.touch(room);
    listener.roomState(room.code, toRoomState(room, now()));
  };

  const clearTimers = (room: ArenaRoomRecord): void => {
    if (room.timers.countdown) {
      clearTimeout(room.timers.countdown);
      room.timers.countdown = null;
    }

    if (room.timers.whistle) {
      clearTimeout(room.timers.whistle);
      room.timers.whistle = null;
    }

    if (room.timers.tick) {
      clearInterval(room.timers.tick);
      room.timers.tick = null;
    }
  };

  const emitAmmo = (room: ArenaRoomRecord, player: ArenaRoomPlayer): void => {
    listener.ammo(room.code, player.playerId, {
      ammo: player.ammo,
      reloadingUntil:
        player.reloadingUntilMs > 0 ? new Date(player.reloadingUntilMs).toISOString() : null,
    });
  };

  const placeAtSpawn = (room: ArenaRoomRecord, arena: ArenaDefinition, index: number): void => {
    const player = room.players[index];
    const spawnPoint = arena.spawnPoints[index % arena.spawnPoints.length];

    if (!player || !spawnPoint) {
      return;
    }

    player.x = spawnPoint.x;
    player.y = spawnPoint.y;
  };

  const toRankingEntry = (player: ArenaRoomPlayer): ArenaRankingEntry => ({
    badgeNumber: player.badgeNumber,
    colour: player.colour,
    emoji: player.emoji,
    hits: player.hits,
    taken: player.taken,
    downs: player.downs,
    disconnected: !player.isConnected,
    suspect: player.suspect,
  });

  const finishRound = async (room: ArenaRoomRecord): Promise<void> => {
    if (room.status !== "BATTLE") {
      return;
    }

    clearTimers(room);
    room.status = "RESULTS";
    room.roundEndsAt = null;
    room.beans = [];

    const finishedAt = now();
    const outcome = buildArenaOutcome(room.players.map(toRankingEntry));
    const result: ArenaResult = {
      roomCode: room.code,
      arenaId: room.arenaId,
      finishedAt: finishedAt.toISOString(),
      standings: outcome.standings,
      payerBadgeNumber: outcome.payerBadgeNumber,
    };

    listener.results(room.code, result);
    publishState(room);

    try {
      await resultRepository.create({
        roomCode: room.code,
        arenaId: room.arenaId,
        finishedAt,
        standings: outcome.standings,
        payerBadgeNumber: outcome.payerBadgeNumber,
        expiresAt: new Date(finishedAt.getTime() + resultTtlHours * HOUR_MS),
      });
    } catch {
      // Results are throwaway entertainment data: a storage outage must not
      // break the round that has already been broadcast to the table.
    }
  };

  const collectPads = (room: ArenaRoomRecord, arena: ArenaDefinition, nowMs: number): void => {
    for (let index = 0; index < room.pads.length; index += 1) {
      const pad = room.pads[index];
      const point = arena.padPoints[index];

      if (!pad || !point) {
        continue;
      }

      if (pad.kind === null) {
        if (pad.availableAtMs > nowMs) {
          continue;
        }

        pad.kind = padKindFor(index);
        pad.availableAtMs = 0;
        listener.pad(room.code, {
          padIndex: index,
          kind: pad.kind,
          availableAt: null,
          takenBy: null,
        });
        continue;
      }

      const taker = room.players.find(
        (player) =>
          player.hearts > 0 &&
          player.downedUntilMs <= nowMs &&
          Math.hypot(player.x - point.x, player.y - point.y) <= POWER_UP.pickupRadius,
      );

      if (!taker) {
        continue;
      }

      const kind = pad.kind;

      pad.kind = null;
      pad.availableAtMs = nowMs + POWER_UP.respawnMs;

      let until: number | null = null;

      if (kind === "RAPID") {
        taker.powerUp = "RAPID";
        taker.powerUpUntilMs = nowMs + POWER_UP.rapid.durationMs;
        until = taker.powerUpUntilMs;
      } else if (kind === "TRIPLE") {
        taker.powerUp = "TRIPLE";
        taker.powerUpUntilMs = nowMs + POWER_UP.triple.durationMs;
        until = taker.powerUpUntilMs;
      } else if (kind === "SHIELD") {
        taker.powerUp = "SHIELD";
        taker.powerUpUntilMs = nowMs + POWER_UP.shield.durationMs;
        taker.shieldHits = POWER_UP.shield.charges;
        until = taker.powerUpUntilMs;
      } else {
        taker.hearts = Math.min(HEALTH.maxHearts, taker.hearts + 1);
      }

      listener.pad(room.code, {
        padIndex: index,
        kind: null,
        availableAt: new Date(pad.availableAtMs).toISOString(),
        takenBy: taker.badgeNumber,
      });
      listener.power(room.code, {
        badgeNumber: taker.badgeNumber,
        kind,
        until: until === null ? null : new Date(until).toISOString(),
      });
    }
  };

  const respawnDowned = (room: ArenaRoomRecord, arena: ArenaDefinition, nowMs: number): void => {
    for (const player of room.players) {
      if (player.hearts > 0 || player.downedUntilMs === 0 || player.downedUntilMs > nowMs) {
        continue;
      }

      const rivals = room.players
        .filter((candidate) => candidate.playerId !== player.playerId && candidate.hearts > 0)
        .map((candidate) => ({ x: candidate.x, y: candidate.y }));
      const spawnPoint = furthestSpawnPoint(arena.spawnPoints, rivals);

      player.x = spawnPoint.x;
      player.y = spawnPoint.y;
      player.hearts = HEALTH.respawnHearts;
      player.downedUntilMs = 0;
      player.invulnerableUntilMs = nowMs + HEALTH.invulnerableMs;
      player.ammo = WEAPON.clipSize;
      player.reloadingUntilMs = 0;
      player.shieldHits = 0;
      player.powerUp = null;
      player.powerUpUntilMs = 0;
      // Movement is measured from the respawn point onwards, so coming back
      // cannot be used as a free teleport.
      player.lastPositionAtMs = nowMs;

      listener.respawn(room.code, {
        badgeNumber: player.badgeNumber,
        x: player.x,
        y: player.y,
        hearts: player.hearts,
      });
      emitAmmo(room, player);
    }
  };

  const expireEffects = (room: ArenaRoomRecord, nowMs: number): void => {
    for (const player of room.players) {
      if (player.powerUp !== null && player.powerUpUntilMs <= nowMs) {
        player.powerUp = null;
        player.powerUpUntilMs = 0;
        player.shieldHits = 0;
      }

      if (player.reloadingUntilMs > 0 && player.reloadingUntilMs <= nowMs) {
        player.reloadingUntilMs = 0;
        player.ammo = WEAPON.clipSize;
        emitAmmo(room, player);
      }
    }
  };

  const applyHits = (room: ArenaRoomRecord, nowMs: number, arena: ArenaDefinition): boolean => {
    const stepped = stepBeans({
      beans: room.beans,
      targets: room.players.map(toCombatTarget),
      arena,
      nowMs,
      dtMs: Math.min(MAX_TICK_MS, Math.max(0, nowMs - room.lastTickAtMs)),
    });

    room.beans = stepped.beans;

    let scored = false;

    for (const hit of stepped.hits) {
      const shooter = room.players.find((player) => player.playerId === hit.shooterPlayerId);
      const victim = room.players.find((player) => player.playerId === hit.victimPlayerId);

      if (!victim || victim.invulnerableUntilMs > nowMs || victim.hearts <= 0) {
        continue;
      }

      const outcome = resolveHit({ victim, angle: hit.angle, nowMs });

      victim.hearts = outcome.hearts;
      victim.shieldHits = outcome.shieldHits;
      victim.invulnerableUntilMs = outcome.invulnerableUntilMs;
      victim.downedUntilMs = outcome.downedUntilMs;
      victim.taken += 1;

      if (outcome.downed) {
        victim.downs += 1;
      }

      if (shooter) {
        shooter.hits += 1;
      }

      scored = true;
      listener.hit(room.code, {
        shooterBadge: hit.shooterBadgeNumber,
        victimBadge: victim.badgeNumber,
        x: hit.x,
        y: hit.y,
        victimHearts: victim.hearts,
        shielded: outcome.shielded,
        downed: outcome.downed,
      });
    }

    return scored;
  };

  const tick = (room: ArenaRoomRecord): void => {
    if (room.status !== "BATTLE") {
      return;
    }

    const arena = findArena(room.arenaId);

    if (!arena) {
      return;
    }

    const nowMs = now().getTime();
    const scored = applyHits(room, nowMs, arena);

    expireEffects(room, nowMs);
    respawnDowned(room, arena, nowMs);
    collectPads(room, arena, nowMs);

    room.lastTickAtMs = nowMs;

    if (scored || nowMs - room.lastScoreAtMs >= SCORE_BROADCAST_INTERVAL_MS) {
      room.lastScoreAtMs = nowMs;
      listener.scores(room.code, {
        scores: room.players.map((player) => toScoreEntry(player, nowMs)),
      });
    }
  };

  const beginRound = (room: ArenaRoomRecord): void => {
    if (room.status !== "COUNTDOWN" || !room.roundStartsAt) {
      return;
    }

    const arena = requireArena(room.arenaId);

    room.timers.countdown = null;
    room.status = "BATTLE";
    room.roundEndsAt = new Date(room.roundStartsAt.getTime() + ROUND_MS);
    room.lastTickAtMs = now().getTime();
    room.lastScoreAtMs = room.lastTickAtMs;
    room.beans = [];
    room.pads = buildPads(arena);

    for (let index = 0; index < room.players.length; index += 1) {
      placeAtSpawn(room, arena, index);
    }

    // Every barista's movement budget starts ticking at the spawn point, so the
    // first position packet of the round is clamped like any other rather than
    // being taken on trust.
    for (const player of room.players) {
      player.lastPositionAtMs = room.lastTickAtMs;
    }

    listener.go(room.code, {
      roundEndsAt: room.roundEndsAt.toISOString(),
      serverTime: now().toISOString(),
    });
    publishState(room);

    for (const player of room.players) {
      emitAmmo(room, player);
    }

    room.timers.tick = setInterval(() => {
      tick(room);
    }, COMBAT_TICK_MS);
    room.timers.tick.unref?.();

    // The round always runs the full 120 seconds: there is no elimination, so
    // there is nothing that could legitimately end it early (§5).
    room.timers.whistle = setTimeout(() => {
      room.timers.whistle = null;
      void finishRound(room);
    }, ROUND_MS);
  };

  const promoteHost = (room: ArenaRoomRecord): void => {
    if (room.players.some((player) => player.isHost)) {
      return;
    }

    const nextHost =
      room.players.find((player) => player.isConnected) ?? room.players.at(0) ?? null;

    if (nextHost) {
      nextHost.isHost = true;
      room.hostPlayerId = nextHost.playerId;
    }
  };

  const closeRoom = (room: ArenaRoomRecord): void => {
    clearTimers(room);
    room.status = "CLOSED";
    roomStore.delete(room.code);
  };

  const createPlayer = (
    room: ArenaRoomRecord,
    options: { isHost: boolean; badgeNumber: number; colour: string },
  ): ArenaRoomPlayer => {
    const joinedAt = now();
    const player: ArenaRoomPlayer = {
      playerId: createPlayerId(),
      badgeNumber: options.badgeNumber,
      colour: options.colour,
      emoji: null,
      isReady: false,
      isConnected: false,
      isHost: options.isHost,
      joinedAt,
      hearts: HEALTH.startHearts,
      downedUntilMs: 0,
      invulnerableUntilMs: 0,
      ammo: WEAPON.clipSize,
      reloadingUntilMs: 0,
      powerUp: null,
      powerUpUntilMs: 0,
      shieldHits: 0,
      hits: 0,
      taken: 0,
      downs: 0,
      suspect: false,
      x: 0,
      y: 0,
      aim: 0,
      lastPositionAtMs: 0,
      lastFireAtMs: 0,
    };
    const arena = findArena(room.arenaId);
    const spawnPoint = arena?.spawnPoints[room.players.length % arena.spawnPoints.length];

    if (spawnPoint) {
      player.x = spawnPoint.x;
      player.y = spawnPoint.y;
    }

    return player;
  };

  return {
    createRoom(input) {
      const arenaId = input.arenaId ?? DEFAULT_ARENA_ID;
      const arena = requireArena(arenaId);
      const firstColour = BADGE_COLOURS[0];

      if (!firstColour) {
        throw new Error("The badge colour palette is empty");
      }

      const createdAt = now();
      const room: ArenaRoomRecord = {
        code: roomStore.generateCode(),
        status: "LOBBY",
        arenaId,
        hostPlayerId: "",
        players: [],
        beans: [],
        pads: buildPads(arena),
        nextBeanId: 1,
        roundStartsAt: null,
        roundEndsAt: null,
        lastActivityAt: createdAt,
        expiresAt: createdAt,
        timers: { countdown: null, whistle: null, tick: null },
        lastTickAtMs: 0,
        lastScoreAtMs: 0,
      };
      const host = createPlayer(room, {
        isHost: true,
        badgeNumber: MIN_BADGE_NUMBER,
        colour: firstColour.id,
      });

      room.hostPlayerId = host.playerId;
      room.players.push(host);

      roomStore.set(room);
      roomStore.touch(room);

      return { code: room.code, playerId: host.playerId, state: toRoomState(room, now()) };
    },

    join(code, input) {
      const room = requireRoom(code);
      const existingPlayer = input.playerId
        ? room.players.find((player) => player.playerId === input.playerId)
        : undefined;

      // A known playerId is a reconnect and must work even mid-round.
      if (existingPlayer) {
        publishState(room);

        return { playerId: existingPlayer.playerId, state: toRoomState(room, now()) };
      }

      if (room.status !== "LOBBY") {
        throw new ArenaError(409, "ROOM_IN_PROGRESS", "This round has already started");
      }

      if (room.players.length >= MAX_PLAYERS) {
        throw new ArenaError(409, "ROOM_FULL", "This arena room is full");
      }

      const player = createPlayer(room, {
        isHost: false,
        badgeNumber: lowestFreeBadgeNumber(room),
        colour: firstFreeColour(room),
      });

      room.players.push(player);
      publishState(room);

      return { playerId: player.playerId, state: toRoomState(room, now()) };
    },

    getState(code) {
      return toRoomState(requireRoom(code), now());
    },

    async getResult(code) {
      const result = await resultRepository.findLatestByRoomCode(code);

      if (!result) {
        throw new HttpError(
          404,
          "ARENA_RESULT_NOT_FOUND",
          "No round result was found for this room",
        );
      }

      return result;
    },

    attach(code, playerId) {
      const room = requireRoom(code);
      const player = requirePlayer(room, playerId);

      player.isConnected = true;
      publishState(room);

      if (room.status === "BATTLE") {
        emitAmmo(room, player);
      }

      return toRoomState(room, now());
    },

    disconnect(code, playerId) {
      const room = roomStore.get(code);

      if (!room) {
        return;
      }

      const player = room.players.find((candidate) => candidate.playerId === playerId);

      if (!player) {
        return;
      }

      // The slot survives and the barista keeps standing there: it stops moving
      // and stops firing, but stays a valid target until the whistle (§5).
      player.isConnected = false;
      player.isReady = false;
      publishState(room);
    },

    leave(code, playerId) {
      const room = roomStore.get(code);

      if (!room) {
        return;
      }

      const index = room.players.findIndex((candidate) => candidate.playerId === playerId);

      if (index === -1) {
        return;
      }

      room.players.splice(index, 1);
      room.beans = room.beans.filter((bean) => bean.ownerPlayerId !== playerId);

      if (room.players.length === 0) {
        closeRoom(room);
        return;
      }

      promoteHost(room);
      publishState(room);
    },

    setReady(code, playerId, isReady) {
      const room = requireRoom(code);
      const player = requirePlayer(room, playerId);

      if (room.status !== "LOBBY") {
        throw new ArenaError(409, "INVALID_STATE", "Ready can only change in the lobby");
      }

      player.isReady = isReady;
      publishState(room);
    },

    setBadge(code, playerId, input) {
      const room = requireRoom(code);
      const player = requirePlayer(room, playerId);

      if (room.status !== "LOBBY") {
        throw new ArenaError(409, "INVALID_STATE", "Badges can only change in the lobby");
      }

      if (input.badgeNumber !== null) {
        if (
          !Number.isInteger(input.badgeNumber) ||
          input.badgeNumber < MIN_BADGE_NUMBER ||
          input.badgeNumber > MAX_BADGE_NUMBER
        ) {
          throw new ArenaError(400, "INVALID_NUMBER", "Choose a badge number between 1 and 99");
        }

        const isTaken = room.players.some(
          (candidate) =>
            candidate.playerId !== playerId && candidate.badgeNumber === input.badgeNumber,
        );

        if (isTaken) {
          throw new ArenaError(409, "NUMBER_TAKEN", "That badge number is already taken");
        }
      }

      if (input.colour !== null) {
        if (!findBadgeColour(input.colour)) {
          throw new ArenaError(400, "INVALID_COLOUR", "That badge colour does not exist");
        }

        const isTaken = room.players.some(
          (candidate) => candidate.playerId !== playerId && candidate.colour === input.colour,
        );

        if (isTaken) {
          throw new ArenaError(409, "COLOUR_TAKEN", "That badge colour is already taken");
        }
      }

      if (input.emoji !== null && !BADGE_EMOJIS.includes(input.emoji)) {
        throw new ArenaError(400, "INVALID_EMOJI", "That emoji is not on the list");
      }

      if (input.badgeNumber !== null) {
        player.badgeNumber = input.badgeNumber;
      }

      if (input.colour !== null) {
        player.colour = input.colour;
      }

      player.emoji = input.emoji;
      publishState(room);
    },

    startRound(code, playerId, force) {
      const room = requireRoom(code);

      requireHost(room, playerId);

      if (room.status !== "LOBBY") {
        throw new ArenaError(409, "INVALID_STATE", "The round has already started");
      }

      if (room.players.length < MIN_PLAYERS) {
        throw new ArenaError(
          409,
          "NOT_ENOUGH_PLAYERS",
          `At least ${MIN_PLAYERS} players are needed to fight`,
        );
      }

      if (!force && !room.players.every((player) => player.isReady)) {
        throw new ArenaError(409, "PLAYERS_NOT_READY", "Every player must be ready");
      }

      for (const player of room.players) {
        resetRoundState(player);
      }

      room.status = "COUNTDOWN";
      room.roundStartsAt = new Date(now().getTime() + COUNTDOWN_MS);
      room.roundEndsAt = null;

      listener.countdown(room.code, {
        roundStartsAt: room.roundStartsAt.toISOString(),
        serverTime: now().toISOString(),
      });
      publishState(room);

      room.timers.countdown = setTimeout(() => {
        beginRound(room);
      }, COUNTDOWN_MS);
    },

    recordPosition(code, playerId, input) {
      const room = roomStore.get(code);

      if (!room || room.status !== "BATTLE") {
        return null;
      }

      const player = room.players.find((candidate) => candidate.playerId === playerId);
      const arena = findArena(room.arenaId);

      if (!player || !arena || player.hearts <= 0) {
        return null;
      }

      const nowMs = now().getTime();

      if (player.downedUntilMs > nowMs) {
        return null;
      }

      const clamped = clampPosition({
        arena,
        previous: { x: player.x, y: player.y },
        elapsedMs: nowMs - player.lastPositionAtMs,
        x: input.x,
        y: input.y,
      });

      player.x = clamped.x;
      player.y = clamped.y;
      player.aim = Number.isFinite(input.aim) ? input.aim : player.aim;
      player.lastPositionAtMs = nowMs;
      player.suspect = player.suspect || clamped.suspect;
      room.lastActivityAt = new Date(nowMs);

      return {
        badgeNumber: player.badgeNumber,
        x: player.x,
        y: player.y,
        aim: player.aim,
        hearts: player.hearts,
        downed: player.downedUntilMs > nowMs,
      };
    },

    recordFire(code, playerId, input) {
      const room = roomStore.get(code);

      if (!room) {
        return;
      }

      const player = room.players.find((candidate) => candidate.playerId === playerId);
      const arena = findArena(room.arenaId);

      if (!player || !arena) {
        return;
      }

      const nowMs = now().getTime();
      const validation = validateFire({
        inBattle: room.status === "BATTLE",
        shooter: player,
        request: input,
        nowMs,
      });

      // A rejected shot is dropped silently: an honest phone on a bad connection
      // would otherwise be spammed with warnings it can do nothing about (§7a).
      if (!validation.ok) {
        return;
      }

      const beans = spawnBeans({
        ownerPlayerId: player.playerId,
        ownerBadgeNumber: player.badgeNumber,
        x: player.x,
        y: player.y,
        angle: input.angle,
        triple: validation.triple,
        nowMs,
        firstBeanId: room.nextBeanId,
      });

      room.nextBeanId += beans.length;
      room.beans.push(...beans);
      player.ammo -= 1;
      player.lastFireAtMs = nowMs;
      player.aim = input.angle;
      room.lastActivityAt = new Date(nowMs);

      listener.shot(room.code, {
        badgeNumber: player.badgeNumber,
        x: player.x,
        y: player.y,
        angles: beans.map((bean) => Math.atan2(bean.vy, bean.vx)),
      });
      emitAmmo(room, player);
    },

    requestReload(code, playerId) {
      const room = roomStore.get(code);

      if (!room || room.status !== "BATTLE") {
        return;
      }

      const player = room.players.find((candidate) => candidate.playerId === playerId);
      const nowMs = now().getTime();

      if (
        !player ||
        player.reloadingUntilMs > nowMs ||
        player.ammo >= WEAPON.clipSize ||
        player.downedUntilMs > nowMs
      ) {
        return;
      }

      player.reloadingUntilMs = nowMs + WEAPON.reloadMs;
      emitAmmo(room, player);
    },

    rematch(code, playerId) {
      const room = requireRoom(code);

      requireHost(room, playerId);

      if (room.status !== "RESULTS") {
        throw new ArenaError(409, "INVALID_STATE", "A rematch can only start from the results");
      }

      clearTimers(room);
      room.status = "LOBBY";
      room.roundStartsAt = null;
      room.roundEndsAt = null;
      room.beans = [];

      for (const player of room.players) {
        resetRoundState(player);
        player.isReady = false;
      }

      publishState(room);
    },

    setListener(nextListener) {
      listener = nextListener;
    },

    shutdown() {
      roomStore.stop();
      listener = noopListener;

      return Promise.resolve();
    },
  };
};
