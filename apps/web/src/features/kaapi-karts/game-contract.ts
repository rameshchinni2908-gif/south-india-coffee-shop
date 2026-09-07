/**
 * Kaapi Karts shared contract.
 *
 * This file is the single source of truth for everything the API and the web
 * client must agree on: constants, the track, wire payloads and socket events.
 *
 * It is mirrored byte-for-byte at
 * `apps/web/src/features/kaapi-karts/game-contract.ts`.
 * Never edit one copy alone — change both, or the race desynchronises.
 *
 * It must stay dependency-free so both a Node (NodeNext) and a Vite (Bundler)
 * TypeScript project can consume it unchanged.
 */

export const GAME_DISPLAY_NAME = "Kaapi Karts";
export const GAME_TAGLINE = "Race your table. Last place buys the coffee.";

// ---------------------------------------------------------------------------
// Room rules
// ---------------------------------------------------------------------------

/**
 * Solo racing is allowed so the track can be tested on a single phone, and
 * because a lone player waiting for a friend may as well do a lap. Restore this
 * to 2 to make the game strictly social again — nothing else needs changing.
 */
export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 6;

export const ROOM_CODE_LENGTH = 4;
/** No O/0/I/1 so a code read aloud across a cafe table is unambiguous. */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/;

export const MIN_CAR_NUMBER = 1;
export const MAX_CAR_NUMBER = 99;

export const PLAYER_ID_PATTERN = /^[0-9a-f]{32}$/;

// ---------------------------------------------------------------------------
// Race rules
// ---------------------------------------------------------------------------

export const TOTAL_LAPS = 3;
export const COUNTDOWN_MS = 3_000;
/** Hard cap. Anyone still driving at this point is ranked by progress. */
export const RACE_CAP_MS = 150_000;

/** Position broadcast budget, enforced on both ends. */
export const POSITION_BROADCAST_HZ = 15;
export const POSITION_BROADCAST_INTERVAL_MS = Math.round(1000 / POSITION_BROADCAST_HZ);

/**
 * Plausibility floors used by the server to reject a phone that claims an
 * impossible time. Derived from TRACK lap length / KART.maxSpeed with margin:
 * a flawless lap held at permanent top speed measures ~30.1s, and a realistic
 * clean lap ~33s, so 20s is comfortably unreachable by honest play.
 */
export const MIN_PLAUSIBLE_LAP_MS = 20_000;
export const MIN_PLAUSIBLE_RACE_MS = MIN_PLAUSIBLE_LAP_MS * TOTAL_LAPS;

// ---------------------------------------------------------------------------
// Cars
// ---------------------------------------------------------------------------

export interface CarColour {
  readonly id: string;
  readonly hex: string;
  readonly label: string;
}

/** Six brand-adjacent colours, all legible on the cream surface. */
export const CAR_COLOURS: readonly CarColour[] = [
  { id: "maroon", hex: "#6f3219", label: "Maroon" },
  { id: "amber", hex: "#b85f16", label: "Amber" },
  { id: "palm", hex: "#28734f", label: "Palm green" },
  { id: "harbour", hex: "#1f6f8b", label: "Harbour blue" },
  { id: "bronze", hex: "#8a5a1c", label: "Bronze" },
  { id: "plum", hex: "#7d3350", label: "Plum" },
];

export type CarColourId = string;

export const CAR_COLOUR_IDS: readonly string[] = CAR_COLOURS.map((colour) => colour.id);

export const findCarColour = (id: string): CarColour | undefined =>
  CAR_COLOURS.find((colour) => colour.id === id);

/** Fixed allow-list. Players never type free text anywhere in this game. */
export const CAR_EMOJIS: readonly string[] = [
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

export const formatCarNumber = (carNumber: number): string => carNumber.toString().padStart(2, "0");

// ---------------------------------------------------------------------------
// Track
// ---------------------------------------------------------------------------

export interface TrackPoint {
  readonly x: number;
  readonly y: number;
}

export interface BoostPad {
  readonly x: number;
  readonly y: number;
}

export interface TrackDefinition {
  readonly id: string;
  readonly name: string;
  /** World bounds. The renderer letterboxes this into the canvas. */
  readonly width: number;
  readonly height: number;
  /** Half-width of the drivable surface, in world units. */
  readonly halfWidth: number;
  /**
   * Closed-loop control points, clockwise. The engine expands these with a
   * centripetal Catmull-Rom spline; the server never needs the spline, only
   * the length constants below.
   */
  readonly controlPoints: readonly TrackPoint[];
  readonly boostPads: readonly BoostPad[];
  /** Index into controlPoints that carries the start/finish line. */
  readonly startIndex: number;
  /** Heading in radians the grid faces at lights-out. */
  readonly startHeading: number;
  /**
   * Measured centripetal Catmull-Rom spline length in world units, for lap-time
   * sanity checks. Verified by `tests/kaapi-karts-engine.test.ts`; re-measure
   * and update this if `controlPoints` ever change.
   */
  readonly approximateLapLength: number;
}

export const KAAPI_CIRCUIT: TrackDefinition = {
  id: "kaapi-circuit",
  name: "Kaapi Circuit",
  // Scaled up 1.35x from the original layout so a lap is a proper runway rather
  // than a quick loop. Speed rose further still (see KART), so the circuit both
  // takes longer to learn and feels faster to drive.
  width: 1350,
  height: 1958,
  halfWidth: 76,
  controlPoints: [
    { x: 675, y: 203 },
    { x: 1040, y: 277 },
    { x: 1158, y: 540 },
    { x: 1046, y: 756 },
    { x: 756, y: 837 },
    { x: 560, y: 945 },
    { x: 702, y: 1121 },
    { x: 1080, y: 1215 },
    { x: 1164, y: 1512 },
    { x: 945, y: 1755 },
    { x: 567, y: 1798 },
    { x: 267, y: 1620 },
    { x: 203, y: 1283 },
    { x: 381, y: 1080 },
    { x: 321, y: 810 },
    { x: 205, y: 540 },
    { x: 313, y: 273 },
  ],
  boostPads: [
    { x: 1158, y: 540 },
    { x: 635, y: 1029 },
    { x: 1164, y: 1512 },
    { x: 267, y: 1620 },
    { x: 205, y: 540 },
  ],
  startIndex: 0,
  startHeading: 0,
  approximateLapLength: 5358,
};

export const TRACKS: readonly TrackDefinition[] = [KAAPI_CIRCUIT];
export const DEFAULT_TRACK_ID = KAAPI_CIRCUIT.id;

export const findTrack = (id: string): TrackDefinition | undefined =>
  TRACKS.find((track) => track.id === id);

// ---------------------------------------------------------------------------
// Kart handling — "medium" difficulty, tuned for ~36s laps (~108s races)
// ---------------------------------------------------------------------------

export const KART = {
  /**
   * World units per second. Raised alongside the longer circuit so the kart
   * feels like it is being driven rather than steered: it now covers more
   * ground per second than the track grew, which is what reads as speed.
   */
  maxSpeed: 190,
  /** A pad is a real event, not a nudge: roughly 45% over cruising pace. */
  boostSpeed: 275,
  /** Multiplier applied to maxSpeed once off the drivable surface. */
  offTrackSpeedFactor: 0.46,
  acceleration: 150,
  braking: 290,
  /** Passive drag when neither accelerating nor braking. */
  drag: 85,
  /** Radians per second at full lock, scaled down with speed. */
  turnRate: 2.6,
  /** Steering authority retained at top speed (0-1). */
  highSpeedTurnFactor: 0.55,
  /** How quickly the kart's heading pulls its velocity around. Higher = less drift. */
  grip: 6.2,
  boostDurationMs: 1600,
  boostCooldownMs: 3200,
  /** Used for drawing, pad pickup and the barrier inset. */
  radius: 22,
} as const;

/**
 * Ramming. Driving into a rival rewards the aggressor and briefly unsettles the
 * victim, so the pack fights instead of filing round in a queue.
 *
 * Contact is resolved on the SERVER, never on the phones. Each phone simulates
 * only its own kart and sees rivals as interpolated ghosts, so both sides of a
 * collision would independently decide they were the one doing the ramming and
 * both would award themselves the boost. The server sees every position, picks
 * one aggressor, and tells both clients the same verdict.
 */
export const RAM = {
  /** Centre-to-centre distance that counts as contact, in world units. */
  contactRadius: 54,
  /**
   * How directly the aggressor must be pointing at the victim, as a dot product
   * of its heading against the direction to the other kart. Keeps a harmless
   * side-by-side brush from counting as a hit.
   */
  minAim: 0.34,
  /** Per-pair quiet period, so one scrape cannot machine-gun events. */
  cooldownMs: 1500,
  boostMs: 1300,
  /** Speed multiplier applied to the aggressor while the reward lasts. */
  boostFactor: 1.28,
  slowMs: 900,
  /** Speed multiplier applied to the victim. Deliberately gentler than the
   *  reward: being hit should sting, not end your race. */
  slowFactor: 0.72,
} as const;

/** Mild catch-up so a runaway leader does not end the race early. */
export const RUBBER_BAND = {
  /** Speed multiplier for the last-placed kart. */
  maxBoost: 1.06,
  /** Speed multiplier for the leader. */
  maxPenalty: 0.98,
} as const;

// ---------------------------------------------------------------------------
// Wire types
// ---------------------------------------------------------------------------

export type RoomStatus = "LOBBY" | "COUNTDOWN" | "RACING" | "RESULTS" | "CLOSED";

export interface GamePlayer {
  readonly playerId: string;
  readonly carNumber: number;
  readonly colour: CarColourId;
  readonly emoji: string | null;
  readonly isReady: boolean;
  readonly isConnected: boolean;
  readonly isHost: boolean;
}

export interface GameRoomState {
  readonly code: string;
  readonly status: RoomStatus;
  readonly trackId: string;
  readonly hostPlayerId: string;
  readonly players: readonly GamePlayer[];
  /** ISO timestamp of lights-out, or null outside COUNTDOWN/RACING. */
  readonly raceStartsAt: string | null;
  /** ISO timestamp of the hard cap, or null outside RACING. */
  readonly raceEndsAt: string | null;
  /** Server clock at send time, so clients can correct their offset. */
  readonly serverTime: string;
}

export interface RaceStanding {
  readonly carNumber: number;
  readonly colour: CarColourId;
  readonly emoji: string | null;
  readonly rank: number;
  /** Milliseconds from lights-out, or null if the kart never finished. */
  readonly finishMs: number | null;
  readonly lapsCompleted: number;
  /** Fractional laps travelled, 0..TOTAL_LAPS. Used to rank non-finishers. */
  readonly progress: number;
  readonly disconnected: boolean;
  /** The server did not believe the submitted time and clamped it. */
  readonly suspect: boolean;
}

export interface RaceResult {
  readonly roomCode: string;
  readonly trackId: string;
  readonly finishedAt: string;
  readonly standings: readonly RaceStanding[];
  /** Last place. A suggestion only — never a payment instruction. */
  readonly payerCarNumber: number;
}

/** One resolved collision. The server decides who rammed whom; clients obey. */
export interface ContactPayload {
  readonly dasherCarNumber: number;
  readonly victimCarNumber: number;
}

export interface GhostPayload {
  readonly carNumber: number;
  readonly x: number;
  readonly y: number;
  readonly heading: number;
  readonly lap: number;
  readonly progress: number;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type GameErrorCode =
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
  | "INVALID_TRACK"
  | "TOO_MANY_ROOMS";

export interface GameErrorPayload {
  readonly code: GameErrorCode;
  readonly message: string;
}

// ---------------------------------------------------------------------------
// Socket.IO event maps
// ---------------------------------------------------------------------------

export const GAME_SOCKET_NAMESPACE = "/game";

export interface ServerToClientEvents {
  "room:state": (state: GameRoomState) => void;
  "race:countdown": (payload: { raceStartsAt: string; serverTime: string }) => void;
  "race:go": (payload: { raceEndsAt: string; serverTime: string }) => void;
  "race:ghost": (payload: GhostPayload) => void;
  "race:contact": (payload: ContactPayload) => void;
  "race:playerFinished": (payload: { carNumber: number; rank: number; finishMs: number }) => void;
  "race:results": (result: RaceResult) => void;
  "game:error": (payload: GameErrorPayload) => void;
}

export interface ClientToServerEvents {
  "room:hello": (
    payload: { code: string; playerId: string },
    ack: (
      response: { ok: true; state: GameRoomState } | { ok: false; error: GameErrorPayload },
    ) => void,
  ) => void;
  "room:leave": () => void;
  "lobby:setReady": (payload: { isReady: boolean }) => void;
  "lobby:setCar": (payload: {
    carNumber: number | null;
    colour: string | null;
    emoji: string | null;
  }) => void;
  "race:start": (payload: { force: boolean }) => void;
  "race:pos": (payload: {
    x: number;
    y: number;
    heading: number;
    lap: number;
    progress: number;
  }) => void;
  /**
   * `finishMs` is milliseconds from lights-out.
   *
   * `lapSplits` holds the CUMULATIVE elapsed ms at each line crossing — e.g. a
   * 99s race reads `[33620, 66340, 99060]`, NOT the per-lap durations
   * `[33620, 32720, 32720]`. The server treats the series as strictly
   * increasing and requires every inter-split delta to be at least
   * `MIN_PLAUSIBLE_LAP_MS`; sending per-lap durations makes every honest finish
   * look implausible and clamps the whole field to `RACE_CAP_MS`.
   * Exactly `TOTAL_LAPS` entries.
   */
  "race:finish": (payload: { finishMs: number; lapSplits: readonly number[] }) => void;
  "race:rematch": () => void;
  "time:ping": (ack: (serverNow: number) => void) => void;
}

// ---------------------------------------------------------------------------
// Client-side storage keys
// ---------------------------------------------------------------------------

export const STORAGE_PLAYER_ID = "kaapi-karts:playerId";
export const STORAGE_SEEN_HOW_TO = "kaapi-karts:seenHowTo";
export const STORAGE_HAPTICS = "kaapi-karts:haptics";
