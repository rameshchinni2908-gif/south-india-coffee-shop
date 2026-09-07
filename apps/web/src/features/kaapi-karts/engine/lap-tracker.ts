/**
 * Lap counting for Kaapi Karts.
 *
 * Turns the kart's arc length around the spline into laps, splits and a
 * fractional `progress`. Because the geometry puts arc length zero on the
 * start/finish line, a crossing is simply a wrap of `distanceAlong`.
 *
 * Anti-cheat rules baked in:
 * - a lap only counts on a *forward* crossing;
 * - and only when at least `MIN_LAP_FRACTION` of a lap has actually been
 *   travelled since the previous crossing, so cutting the infield or
 *   reversing over the line does nothing.
 *
 * Pure module: the state object is caller-owned and mutated in place, so the
 * hot path allocates nothing except the occasional split push.
 */

import { TOTAL_LAPS } from "../game-contract.js";
import { clamp } from "./math.js";

/** Share of a lap that must be covered before a crossing is honoured. */
export const MIN_LAP_FRACTION = 0.9;

export type LapTick = "none" | "lap" | "finish";

export interface LapTrackerState {
  readonly lapLength: number;
  readonly totalLaps: number;
  /** Arc length seen on the previous update, used to detect wraps. */
  lastDistance: number;
  /** Net forward distance travelled since the last honoured crossing. */
  travelled: number;
  lapsCompleted: number;
  /** Fractional laps travelled, clamped to 0..totalLaps. */
  progress: number;
  /** Elapsed time at the last honoured crossing. */
  lastCrossingMs: number;
  /** Duration of the most recently completed lap, for the HUD. */
  lastLapMs: number;
  /**
   * Cumulative elapsed ms at each honoured line crossing — NOT per-lap
   * durations. The server validates these as a strictly increasing series and
   * rejects a finish whose inter-split deltas are implausibly small, so this
   * must stay cumulative. See `race:finish` in `game-contract.ts`.
   */
  lapSplits: number[];
  finished: boolean;
  finishMs: number | null;
}

export const createLapTracker = (
  lapLength: number,
  startDistance: number,
  totalLaps: number = TOTAL_LAPS,
): LapTrackerState => ({
  lapLength,
  totalLaps,
  lastDistance: startDistance,
  travelled: 0,
  lapsCompleted: 0,
  progress: 0,
  lastCrossingMs: 0,
  lastLapMs: 0,
  lapSplits: [],
  finished: false,
  finishMs: null,
});

const recomputeProgress = (state: LapTrackerState): void => {
  const fraction = state.lapLength > 0 ? state.travelled / state.lapLength : 0;
  state.progress = clamp(state.lapsCompleted + fraction, 0, state.totalLaps);
};

/**
 * Feeds one sample into the tracker.
 *
 * Returns `"lap"` when a lap was banked (read `lastLapMs` / `lapSplits`),
 * `"finish"` when that lap was the last one, and `"none"` otherwise.
 */
export const advanceLapTracker = (
  state: LapTrackerState,
  distanceAlong: number,
  elapsedMs: number,
): LapTick => {
  const lapLength = state.lapLength;
  if (lapLength <= 0 || state.finished) {
    state.lastDistance = distanceAlong;
    return "none";
  }

  const half = lapLength / 2;
  let delta = distanceAlong - state.lastDistance;
  let crossedForward = false;

  if (delta < -half) {
    // Wrapped past the line going forwards.
    delta += lapLength;
    crossedForward = true;
  } else if (delta > half) {
    // Wrapped past the line going backwards.
    delta -= lapLength;
  }

  state.lastDistance = distanceAlong;
  state.travelled += delta;

  if (!crossedForward) {
    recomputeProgress(state);
    return "none";
  }

  if (state.travelled < lapLength * MIN_LAP_FRACTION) {
    // Short cut or a bounce over the line — not a lap.
    recomputeProgress(state);
    return "none";
  }

  state.lapsCompleted += 1;
  state.travelled -= lapLength;
  state.lastLapMs = elapsedMs - state.lastCrossingMs;
  state.lastCrossingMs = elapsedMs;
  state.lapSplits.push(elapsedMs);

  if (state.lapsCompleted >= state.totalLaps) {
    state.finished = true;
    state.finishMs = elapsedMs;
    state.travelled = 0;
    state.progress = state.totalLaps;
    return "finish";
  }

  recomputeProgress(state);
  return "lap";
};
