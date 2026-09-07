import { describe, expect, it } from "vitest";

import {
  MIN_PLAUSIBLE_LAP_MS,
  MIN_PLAUSIBLE_RACE_MS,
  RACE_CAP_MS,
  TOTAL_LAPS,
} from "../src/modules/game/game-contract.js";
import {
  buildRaceOutcome,
  buildStandings,
  clampProgress,
  findPayerCarNumber,
  isPlausibleFinish,
  validateFinish,
  type RankingEntry,
} from "../src/modules/game/standings.js";

const LAP_MS = 36_000;
const CLEAN_SPLITS = [LAP_MS, LAP_MS * 2, LAP_MS * 3];
const CLEAN_FINISH = { finishMs: LAP_MS * 3, lapSplits: CLEAN_SPLITS };

const entry = (overrides: Partial<RankingEntry> & { carNumber: number }): RankingEntry => ({
  colour: "maroon",
  emoji: null,
  finishMs: null,
  lapsCompleted: 0,
  progress: 0,
  disconnected: false,
  suspect: false,
  ...overrides,
});

describe("finish plausibility", () => {
  it("accepts a clean three-lap run", () => {
    expect(isPlausibleFinish(CLEAN_FINISH)).toBe(true);
    expect(validateFinish(CLEAN_FINISH)).toEqual({
      finishMs: LAP_MS * 3,
      lapsCompleted: TOTAL_LAPS,
      progress: TOTAL_LAPS,
      suspect: false,
    });
  });

  it("clamps and flags an impossibly fast race instead of rejecting the player", () => {
    const validated = validateFinish({
      finishMs: MIN_PLAUSIBLE_RACE_MS - 1,
      lapSplits: CLEAN_SPLITS,
    });

    expect(validated.suspect).toBe(true);
    expect(validated.finishMs).toBe(RACE_CAP_MS);
    expect(validated.lapsCompleted).toBe(TOTAL_LAPS);
  });

  it("clamps and flags an impossibly fast lap split", () => {
    const validated = validateFinish({
      finishMs: MIN_PLAUSIBLE_RACE_MS + 5_000,
      lapSplits: [MIN_PLAUSIBLE_LAP_MS - 1, LAP_MS * 2, LAP_MS * 3],
    });

    expect(validated).toMatchObject({ finishMs: RACE_CAP_MS, suspect: true });
  });

  it("rejects the wrong number of laps", () => {
    expect(isPlausibleFinish({ finishMs: LAP_MS * 3, lapSplits: [LAP_MS, LAP_MS * 2] })).toBe(
      false,
    );
    expect(
      isPlausibleFinish({ finishMs: LAP_MS * 4, lapSplits: [...CLEAN_SPLITS, LAP_MS * 4] }),
    ).toBe(false);
  });

  it("rejects non-monotonic splits", () => {
    expect(
      isPlausibleFinish({ finishMs: LAP_MS * 3, lapSplits: [LAP_MS * 2, LAP_MS, LAP_MS * 3] }),
    ).toBe(false);
  });

  it("rejects a finish beyond the hard cap and non-finite numbers", () => {
    expect(isPlausibleFinish({ finishMs: RACE_CAP_MS + 1, lapSplits: CLEAN_SPLITS })).toBe(false);
    expect(isPlausibleFinish({ finishMs: Number.NaN, lapSplits: CLEAN_SPLITS })).toBe(false);
    expect(
      isPlausibleFinish({ finishMs: LAP_MS * 3, lapSplits: [LAP_MS, Number.POSITIVE_INFINITY, 3] }),
    ).toBe(false);
  });

  it("rejects a last split later than the reported finish", () => {
    expect(
      isPlausibleFinish({ finishMs: LAP_MS * 3, lapSplits: [LAP_MS, LAP_MS * 2, LAP_MS * 3 + 1] }),
    ).toBe(false);
  });

  it("clamps untrusted progress reports", () => {
    expect(clampProgress(-4)).toBe(0);
    expect(clampProgress(Number.NaN)).toBe(0);
    expect(clampProgress(99)).toBe(TOTAL_LAPS);
    expect(clampProgress(1.5)).toBe(1.5);
  });
});

describe("standings", () => {
  it("orders finishers by time and puts non-finishers behind them by progress", () => {
    const standings = buildStandings([
      entry({ carNumber: 4, progress: 2.9, lapsCompleted: 2 }),
      entry({ carNumber: 1, finishMs: 120_000, lapsCompleted: 3, progress: 3 }),
      entry({ carNumber: 3, progress: 1.2, lapsCompleted: 1, disconnected: true }),
      entry({ carNumber: 2, finishMs: 110_000, lapsCompleted: 3, progress: 3 }),
    ]);

    expect(standings.map((standing) => standing.carNumber)).toEqual([2, 1, 4, 3]);
    expect(standings.map((standing) => standing.rank)).toEqual([1, 2, 3, 4]);
    expect(standings[3]?.disconnected).toBe(true);
  });

  it("breaks ties deterministically by ascending car number", () => {
    const finisherTie = buildStandings([
      entry({ carNumber: 9, finishMs: 100_000, lapsCompleted: 3, progress: 3 }),
      entry({ carNumber: 2, finishMs: 100_000, lapsCompleted: 3, progress: 3 }),
    ]);
    const nonFinisherTie = buildStandings([
      entry({ carNumber: 7, progress: 1.5 }),
      entry({ carNumber: 5, progress: 1.5 }),
    ]);

    expect(finisherTie.map((standing) => standing.carNumber)).toEqual([2, 9]);
    expect(nonFinisherTie.map((standing) => standing.carNumber)).toEqual([5, 7]);
  });

  it("names the last-placed car as the payer", () => {
    const outcome = buildRaceOutcome([
      entry({ carNumber: 1, finishMs: 130_000, lapsCompleted: 3, progress: 3 }),
      entry({ carNumber: 6, finishMs: 125_000, lapsCompleted: 3, progress: 3 }),
      entry({ carNumber: 3, progress: 0.4, disconnected: true }),
    ]);

    expect(outcome.standings.map((standing) => standing.carNumber)).toEqual([6, 1, 3]);
    expect(outcome.payerCarNumber).toBe(3);
    expect(findPayerCarNumber(outcome.standings)).toBe(3);
  });

  it("keeps a clamped suspect run behind an honest one", () => {
    const outcome = buildRaceOutcome([
      entry({ carNumber: 1, finishMs: RACE_CAP_MS, lapsCompleted: 3, progress: 3, suspect: true }),
      entry({ carNumber: 2, finishMs: 140_000, lapsCompleted: 3, progress: 3 }),
    ]);

    expect(outcome.standings[0]?.carNumber).toBe(2);
    expect(outcome.payerCarNumber).toBe(1);
    expect(outcome.standings[1]?.suspect).toBe(true);
  });
});
