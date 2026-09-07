import {
  MIN_PLAUSIBLE_LAP_MS,
  MIN_PLAUSIBLE_RACE_MS,
  RACE_CAP_MS,
  TOTAL_LAPS,
  type CarColourId,
  type RaceStanding,
} from "./game-contract.js";

/**
 * Pure ranking and plausibility helpers.
 *
 * Nothing in this file touches rooms, sockets, timers or the database, so the
 * anti-cheat rules from KAAPI-KARTS.md §7 can be unit-tested in isolation.
 */

export interface FinishSubmission {
  readonly finishMs: number;
  /**
   * Cumulative milliseconds from lights-out at each lap crossing, so the
   * sequence must increase monotonically (KAAPI-KARTS.md §7).
   */
  readonly lapSplits: readonly number[];
}

export interface ValidatedFinish {
  readonly finishMs: number;
  readonly lapsCompleted: number;
  readonly progress: number;
  readonly suspect: boolean;
}

export interface RankingEntry {
  readonly carNumber: number;
  readonly colour: CarColourId;
  readonly emoji: string | null;
  readonly finishMs: number | null;
  readonly lapsCompleted: number;
  readonly progress: number;
  readonly disconnected: boolean;
  readonly suspect: boolean;
}

export interface RaceOutcome {
  readonly standings: readonly RaceStanding[];
  readonly payerCarNumber: number;
}

/** Clamp an untrusted progress report into 0..TOTAL_LAPS. */
export const clampProgress = (progress: number): number => {
  if (!Number.isFinite(progress)) {
    return 0;
  }

  return Math.min(TOTAL_LAPS, Math.max(0, progress));
};

export const isPlausibleFinish = ({ finishMs, lapSplits }: FinishSubmission): boolean => {
  if (!Number.isFinite(finishMs) || finishMs < MIN_PLAUSIBLE_RACE_MS || finishMs > RACE_CAP_MS) {
    return false;
  }

  if (lapSplits.length !== TOTAL_LAPS) {
    return false;
  }

  let previousSplit = 0;

  for (const split of lapSplits) {
    if (!Number.isFinite(split) || split - previousSplit < MIN_PLAUSIBLE_LAP_MS) {
      return false;
    }

    previousSplit = split;
  }

  return previousSplit <= finishMs;
};

/**
 * Never rejects a player outright: an implausible submission is clamped to the
 * hard cap and flagged instead, so one phone cannot hand itself the win.
 */
export const validateFinish = (submission: FinishSubmission): ValidatedFinish => {
  if (!isPlausibleFinish(submission)) {
    return {
      finishMs: RACE_CAP_MS,
      lapsCompleted: TOTAL_LAPS,
      progress: TOTAL_LAPS,
      suspect: true,
    };
  }

  return {
    finishMs: submission.finishMs,
    lapsCompleted: TOTAL_LAPS,
    progress: TOTAL_LAPS,
    suspect: false,
  };
};

const compareEntries = (first: RankingEntry, second: RankingEntry): number => {
  if (first.finishMs !== null && second.finishMs !== null) {
    return first.finishMs === second.finishMs
      ? first.carNumber - second.carNumber
      : first.finishMs - second.finishMs;
  }

  if (first.finishMs !== null) {
    return -1;
  }

  if (second.finishMs !== null) {
    return 1;
  }

  return first.progress === second.progress
    ? first.carNumber - second.carNumber
    : second.progress - first.progress;
};

/** Finishers by ascending time, then non-finishers by descending progress. */
export const buildStandings = (entries: readonly RankingEntry[]): RaceStanding[] =>
  [...entries].sort(compareEntries).map((entry, index) => ({
    carNumber: entry.carNumber,
    colour: entry.colour,
    emoji: entry.emoji,
    rank: index + 1,
    finishMs: entry.finishMs,
    lapsCompleted: entry.lapsCompleted,
    progress: entry.progress,
    disconnected: entry.disconnected,
    suspect: entry.suspect,
  }));

/** Last place buys the coffee. A suggestion only, never a payment instruction. */
export const findPayerCarNumber = (standings: readonly RaceStanding[]): number =>
  standings.at(-1)?.carNumber ?? 0;

export const buildRaceOutcome = (entries: readonly RankingEntry[]): RaceOutcome => {
  const standings = buildStandings(entries);

  return { standings, payerCarNumber: findPayerCarNumber(standings) };
};
