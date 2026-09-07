/**
 * Bean Blasters shared contract.
 *
 * This file is the single source of truth for everything the API and the web
 * client must agree on: constants, the arena, wire payloads and socket events.
 *
 * It is mirrored byte-for-byte at
 * `apps/web/src/features/bean-blasters/arena-contract.ts`.
 * Never edit one copy alone — change both, or the round desynchronises.
 *
 * It must stay dependency-free so both a Node (NodeNext) and a Vite (Bundler)
 * TypeScript project can consume it unchanged.
 *
 * This game shares no code with Kaapi Karts. Constants that look duplicated
 * (the room-code alphabet, the colour palette) are duplicated on purpose, so
 * either game can be deleted without touching the other. See BEAN-BLASTERS.md §3.
 */

export const GAME_DISPLAY_NAME = "Bean Blasters";
export const GAME_TAGLINE = "Two minutes, six baristas, one bean fight. Fewest splashes buys.";

// ---------------------------------------------------------------------------
// Room rules
// ---------------------------------------------------------------------------

/**
 * Solo play is allowed so the arena can be tested on a single phone. Restore
 * this to 2 to make the game strictly social again — nothing else needs
 * changing, and the service test covers both rules.
 */
export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 6;

export const ROOM_CODE_LENGTH = 4;
/** No O/0/I/1 so a code read aloud across a cafe table is unambiguous. */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/;

export const MIN_BADGE_NUMBER = 1;
export const MAX_BADGE_NUMBER = 99;

export const PLAYER_ID_PATTERN = /^[0-9a-f]{32}$/;

// ---------------------------------------------------------------------------
// Round rules
// ---------------------------------------------------------------------------

export const COUNTDOWN_MS = 3_000;
/** Fixed length. The round never ends early — there is no elimination. */
export const ROUND_MS = 120_000;

/** Position broadcast budget, enforced on both ends. */
export const POSITION_BROADCAST_HZ = 15;
export const POSITION_BROADCAST_INTERVAL_MS = Math.round(1000 / POSITION_BROADCAST_HZ);

/** The server's authoritative combat simulation rate. */
export const COMBAT_TICK_HZ = 30;
export const COMBAT_TICK_MS = Math.round(1000 / COMBAT_TICK_HZ);

/** Scores are broadcast on a timer rather than on every hit. */
export const SCORE_BROADCAST_INTERVAL_MS = 500;

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

export interface BadgeColour {
  readonly id: string;
  readonly hex: string;
  readonly label: string;
}

/** Same six values as the kart game so the two look like siblings (§9). */
export const BADGE_COLOURS: readonly BadgeColour[] = [
  { id: "maroon", hex: "#6f3219", label: "Maroon" },
  { id: "amber", hex: "#b85f16", label: "Amber" },
  { id: "palm", hex: "#28734f", label: "Palm green" },
  { id: "harbour", hex: "#1f6f8b", label: "Harbour blue" },
  { id: "bronze", hex: "#8a5a1c", label: "Bronze" },
  { id: "plum", hex: "#7d3350", label: "Plum" },
];

export type BadgeColourId = string;

export const BADGE_COLOUR_IDS: readonly string[] = BADGE_COLOURS.map((colour) => colour.id);

export const findBadgeColour = (id: string): BadgeColour | undefined =>
  BADGE_COLOURS.find((colour) => colour.id === id);

/** Fixed allow-list. Players never type free text anywhere in this game. */
export const BADGE_EMOJIS: readonly string[] = [
  "☕",
  "🐯",
  "🚀",
  "🌶️",
  "🥥",
  "🌴",
  "⚡",
  "🎯",
  "🔥",
  "🦚",
  "🍌",
  "🥁",
];

export const formatBadgeNumber = (badgeNumber: number): string =>
  badgeNumber.toString().padStart(2, "0");

// ---------------------------------------------------------------------------
// Arena
// ---------------------------------------------------------------------------

export interface ArenaPoint {
  readonly x: number;
  readonly y: number;
}

/** Axis-aligned cover. Blocks movement AND beans — that is what makes it cover. */
export interface ArenaObstacle {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ArenaDefinition {
  readonly id: string;
  readonly name: string;
  /** World bounds, including the wall band. */
  readonly width: number;
  readonly height: number;
  /** Thickness of the solid wall band inside the bounds. */
  readonly wallInset: number;
  readonly obstacles: readonly ArenaObstacle[];
  /** At least MAX_PLAYERS entries, all clear of obstacles. */
  readonly spawnPoints: readonly ArenaPoint[];
  /** Power-up pad positions, all clear of obstacles. */
  readonly padPoints: readonly ArenaPoint[];
}

export const ROASTERY_FLOOR: ArenaDefinition = {
  id: "roastery-floor",
  name: "Roastery Floor",
  width: 1600,
  height: 1200,
  wallInset: 40,
  obstacles: [
    // Centre block — the piece everyone circles.
    { x: 700, y: 540, width: 200, height: 120 },
    // Four corner crates.
    { x: 300, y: 220, width: 160, height: 90 },
    { x: 1140, y: 220, width: 160, height: 90 },
    { x: 300, y: 890, width: 160, height: 90 },
    { x: 1140, y: 890, width: 160, height: 90 },
    // Two offset pillars, so the centre is not symmetric to shoot across.
    { x: 620, y: 160, width: 90, height: 160 },
    { x: 890, y: 880, width: 90, height: 160 },
    // Side bars that break the long edge sight-lines.
    { x: 200, y: 540, width: 90, height: 160 },
    { x: 1310, y: 540, width: 90, height: 160 },
  ],
  spawnPoints: [
    { x: 140, y: 140 },
    { x: 1460, y: 140 },
    { x: 140, y: 1060 },
    { x: 1460, y: 1060 },
    { x: 800, y: 110 },
    { x: 800, y: 1090 },
  ],
  padPoints: [
    { x: 800, y: 300 },
    { x: 800, y: 900 },
    { x: 400, y: 600 },
    { x: 1200, y: 600 },
  ],
};

export const ARENAS: readonly ArenaDefinition[] = [ROASTERY_FLOOR];
export const DEFAULT_ARENA_ID = ROASTERY_FLOOR.id;

export const findArena = (id: string): ArenaDefinition | undefined =>
  ARENAS.find((arena) => arena.id === id);

// ---------------------------------------------------------------------------
// Barista handling — "medium" difficulty
// ---------------------------------------------------------------------------

export const BARISTA = {
  /**
   * World units per second. Omnidirectional and deliberately snappy: a
   * twin-stick brawl reads as broken with kart-style inertia.
   */
  maxSpeed: 220,
  /** Reaching top speed takes ~0.16s, which feels immediate without being twitchy. */
  acceleration: 1400,
  /** Applied when there is no movement input. Slightly higher than acceleration
   *  so letting go stops you a touch faster than starting moves you. */
  friction: 1500,
  /** Used for drawing, cover collision, pad pickup and as the hit circle. */
  radius: 20,
  /** Speed imparted along the bean's direction when you are splashed. */
  knockbackSpeed: 260,
  /** How quickly knockback bleeds off, in units per second squared. */
  knockbackDecay: 900,
} as const;

/**
 * A position packet implying more than this multiple of `maxSpeed` since the
 * last accepted one is clamped and the player flagged `suspect`. The margin
 * absorbs honest network jitter and a phone catching up after a stall.
 */
export const SPEED_TOLERANCE = 1.35;

// ---------------------------------------------------------------------------
// Beans
// ---------------------------------------------------------------------------

export const BEAN = {
  /**
   * Fast enough to feel thrown, slow enough that you must lead a moving target:
   * ~0.8s of flight at typical engagement range is the whole skill of the game.
   */
  speed: 520,
  radius: 7,
  /** Flight time before the bean drops. ~570 units of range. */
  lifetimeMs: 1_100,
} as const;

export const WEAPON = {
  clipSize: 6,
  /** Client-side cadence. The server floor below is deliberately lower. */
  fireIntervalMs: 220,
  reloadMs: 1_150,
  /**
   * Server-side floor for accepting a shot. Below the client cadence so honest
   * jitter is never rejected, low enough that a rapid-fire hack still is.
   */
  minFireIntervalMs: 180,
  /**
   * How far a reported fire origin may sit from the server's last known
   * position for that player before the shot is dropped.
   */
  maxOriginDrift: 90,
} as const;

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export const HEALTH = {
  maxHearts: 3,
  startHearts: 3,
  /** Hearts you rejoin with after a refill break. Less than full, so being
   *  downed costs you something without putting you out of the round. */
  respawnHearts: 2,
  /** Immunity after taking a splash. Stops one triple volley stripping three
   *  hearts in a single tick. */
  invulnerableMs: 1_200,
  /** The refill break. Short enough that nobody feels benched. */
  downedMs: 6_000,
} as const;

// ---------------------------------------------------------------------------
// Power-ups
// ---------------------------------------------------------------------------

export type PowerUpKind = "RAPID" | "TRIPLE" | "SHIELD" | "REFILL";

export const POWER_UP_KINDS: readonly PowerUpKind[] = ["RAPID", "TRIPLE", "SHIELD", "REFILL"];

export const POWER_UP = {
  /** How long a taken pad stays empty before it offers a new power-up. */
  respawnMs: 12_000,
  /** Centre-to-centre distance that counts as a pickup. */
  pickupRadius: 26,
  rapid: { durationMs: 6_000, fireIntervalFactor: 0.45 },
  triple: { durationMs: 6_000, spreadRad: 0.14 },
  shield: { durationMs: 8_000, charges: 2 },
  /** REFILL is instant: +1 heart, capped at maxHearts. */
} as const;

export const POWER_UP_LABELS: Readonly<Record<PowerUpKind, string>> = {
  RAPID: "Rapid roast",
  TRIPLE: "Triple shot",
  SHIELD: "Portafilter shield",
  REFILL: "Refill",
};

// ---------------------------------------------------------------------------
// Wire types
// ---------------------------------------------------------------------------

export type RoomStatus = "LOBBY" | "COUNTDOWN" | "BATTLE" | "RESULTS" | "CLOSED";

export interface ArenaPlayer {
  readonly playerId: string;
  readonly badgeNumber: number;
  readonly colour: BadgeColourId;
  readonly emoji: string | null;
  readonly isReady: boolean;
  readonly isConnected: boolean;
  readonly isHost: boolean;
  readonly hearts: number;
  readonly hits: number;
  readonly taken: number;
  readonly downs: number;
}

export interface ArenaRoomState {
  readonly code: string;
  readonly status: RoomStatus;
  readonly arenaId: string;
  readonly hostPlayerId: string;
  readonly players: readonly ArenaPlayer[];
  /** ISO timestamp of GO, or null outside COUNTDOWN/BATTLE. */
  readonly roundStartsAt: string | null;
  /** ISO timestamp of the whistle, or null outside BATTLE. */
  readonly roundEndsAt: string | null;
  /** Server clock at send time, so clients can correct their offset. */
  readonly serverTime: string;
}

export interface ArenaStanding {
  readonly badgeNumber: number;
  readonly colour: BadgeColourId;
  readonly emoji: string | null;
  readonly rank: number;
  /** Splashes landed. The primary score. */
  readonly hits: number;
  /** Splashes taken. Tiebreak — fewer is better. */
  readonly taken: number;
  /** Times sent for a refill. Informational only. */
  readonly downs: number;
  readonly disconnected: boolean;
  /** The server did not believe this player's movement and clamped it. */
  readonly suspect: boolean;
}

export interface ArenaResult {
  readonly roomCode: string;
  readonly arenaId: string;
  readonly finishedAt: string;
  readonly standings: readonly ArenaStanding[];
  /** Lowest rank. A suggestion only — never a payment instruction. */
  readonly payerBadgeNumber: number;
}

/** Best-effort rival pose. Rendering only — never used to decide a hit. */
export interface ArenaGhostPayload {
  readonly badgeNumber: number;
  readonly x: number;
  readonly y: number;
  /** Facing, in radians. Independent of the direction of travel. */
  readonly aim: number;
  readonly hearts: number;
  readonly downed: boolean;
}

/** One accepted shot, so every client can draw the bean in flight. */
export interface ArenaShotPayload {
  readonly badgeNumber: number;
  readonly x: number;
  readonly y: number;
  /** One entry per bean: a single throw, or three under TRIPLE. */
  readonly angles: readonly number[];
}

/**
 * One resolved splash. The server decides every hit; clients render the
 * verdict and never compute one of their own. See BEAN-BLASTERS.md §7a.
 */
export interface ArenaHitPayload {
  readonly shooterBadge: number;
  readonly victimBadge: number;
  readonly x: number;
  readonly y: number;
  readonly victimHearts: number;
  /** The shield absorbed it, so no heart was lost. */
  readonly shielded: boolean;
  /** The victim ran out of hearts and is off for a refill. */
  readonly downed: boolean;
}

export interface ArenaRespawnPayload {
  readonly badgeNumber: number;
  readonly x: number;
  readonly y: number;
  readonly hearts: number;
}

/** Sent only to the firing socket — ammo is nobody else's business. */
export interface ArenaAmmoPayload {
  readonly ammo: number;
  /** ISO timestamp when a reload completes, or null when not reloading. */
  readonly reloadingUntil: string | null;
}

export interface ArenaPadPayload {
  readonly padIndex: number;
  /** The power-up now sitting on the pad, or null while it is empty. */
  readonly kind: PowerUpKind | null;
  /** ISO timestamp when an empty pad refills. */
  readonly availableAt: string | null;
  /** Badge that just took it, when this event is a pickup. */
  readonly takenBy: number | null;
}

export interface ArenaPowerPayload {
  readonly badgeNumber: number;
  readonly kind: PowerUpKind;
  /** ISO timestamp when the effect ends. Null for instant effects. */
  readonly until: string | null;
}

export interface ArenaScoreEntry {
  readonly badgeNumber: number;
  readonly hits: number;
  readonly taken: number;
  readonly downs: number;
  readonly hearts: number;
  readonly downed: boolean;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type ArenaErrorCode =
  | "GAME_DISABLED"
  | "ROOM_NOT_FOUND"
  | "ROOM_FULL"
  | "ROOM_IN_PROGRESS"
  | "ROOM_CLOSED"
  | "NUMBER_TAKEN"
  | "INVALID_NUMBER"
  | "COLOUR_TAKEN"
  | "INVALID_COLOUR"
  | "INVALID_EMOJI"
  | "NOT_HOST"
  | "NOT_IN_ROOM"
  | "NOT_ENOUGH_PLAYERS"
  | "PLAYERS_NOT_READY"
  | "INVALID_STATE"
  | "INVALID_ARENA"
  | "TOO_MANY_ROOMS";

export interface ArenaErrorPayload {
  readonly code: ArenaErrorCode;
  readonly message: string;
}

// ---------------------------------------------------------------------------
// Socket.IO
// ---------------------------------------------------------------------------

/**
 * Bean Blasters runs its OWN Socket.IO server on its OWN path.
 *
 * Kaapi Karts already occupies Socket.IO's default path `/socket.io/`. Two
 * Socket.IO servers can share one HTTP server only when their `path` options
 * differ, because engine.io routes the upgrade request by path. Giving this
 * game its own path means neither game's socket layer has to know the other
 * exists, and deleting either cannot break the other.
 */
export const ARENA_SOCKET_PATH = "/arena.io/";
export const ARENA_SOCKET_NAMESPACE = "/arena";

export interface ServerToClientEvents {
  "room:state": (state: ArenaRoomState) => void;
  "round:countdown": (payload: { roundStartsAt: string; serverTime: string }) => void;
  "round:go": (payload: { roundEndsAt: string; serverTime: string }) => void;
  "arena:ghost": (payload: ArenaGhostPayload) => void;
  "arena:shot": (payload: ArenaShotPayload) => void;
  "arena:hit": (payload: ArenaHitPayload) => void;
  "arena:respawn": (payload: ArenaRespawnPayload) => void;
  "arena:ammo": (payload: ArenaAmmoPayload) => void;
  "arena:pad": (payload: ArenaPadPayload) => void;
  "arena:power": (payload: ArenaPowerPayload) => void;
  "arena:score": (payload: { scores: readonly ArenaScoreEntry[] }) => void;
  "round:results": (result: ArenaResult) => void;
  "game:error": (payload: ArenaErrorPayload) => void;
}

export interface ClientToServerEvents {
  "room:hello": (
    payload: { code: string; playerId: string },
    ack: (
      response: { ok: true; state: ArenaRoomState } | { ok: false; error: ArenaErrorPayload },
    ) => void,
  ) => void;
  "room:leave": () => void;
  "lobby:setReady": (payload: { isReady: boolean }) => void;
  "lobby:setBadge": (payload: {
    badgeNumber: number | null;
    colour: string | null;
    emoji: string | null;
  }) => void;
  "round:start": (payload: { force: boolean }) => void;
  /** Best-effort pose. `aim` is facing in radians, independent of movement. */
  "arena:pos": (payload: { x: number; y: number; aim: number }) => void;
  /**
   * A request to throw. The server validates cadence, ammo and origin drift
   * (BEAN-BLASTERS.md §7a) and owns every bean from that point on. There is
   * deliberately NO client event for reporting a hit.
   */
  "arena:fire": (payload: { x: number; y: number; angle: number }) => void;
  "arena:reload": () => void;
  "round:rematch": () => void;
  "time:ping": (ack: (serverNow: number) => void) => void;
}

// ---------------------------------------------------------------------------
// Client-side storage keys
// ---------------------------------------------------------------------------

export const STORAGE_PLAYER_ID = "bean-blasters:playerId";
export const STORAGE_SEEN_HOW_TO = "bean-blasters:seenHowTo";
export const STORAGE_HAPTICS = "bean-blasters:haptics";
