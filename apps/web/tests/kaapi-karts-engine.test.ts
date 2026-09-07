import { describe, expect, it } from "vitest";

import {
  KAAPI_CIRCUIT,
  KART,
  MIN_PLAUSIBLE_LAP_MS,
  MIN_PLAUSIBLE_RACE_MS,
  RACE_CAP_MS,
  TOTAL_LAPS,
  type TrackDefinition,
} from "../src/features/kaapi-karts/game-contract.js";
import {
  advanceLapTracker,
  buildTrackGeometry,
  closestPointOnTrack,
  createKartState,
  createLapTracker,
  createPhysicsContext,
  createRaceEngine,
  gridStartDistance,
  gridStartPose,
  isOnTrack,
  poseAtDistance,
  steeringRateAt,
  stepKart,
  type KartInput,
  type TrackGeometry,
} from "../src/features/kaapi-karts/engine/index.js";
import { angleDifference, clamp, readNumber } from "../src/features/kaapi-karts/engine/math.js";
import {
  createTrackSample,
  createTrackPose,
} from "../src/features/kaapi-karts/engine/track-geometry.js";

const geometry = buildTrackGeometry(KAAPI_CIRCUIT);
const STEP_SECONDS = 1 / 60;
const STEP_MS = 1000 / 60;

/** A wide-open variant so longitudinal tests are not perturbed by the verge. */
const OPEN_TRACK: TrackDefinition = {
  ...KAAPI_CIRCUIT,
  halfWidth: 5_000,
  boostPads: [],
};
const openGeometry = buildTrackGeometry(OPEN_TRACK);

const openContext = () => createPhysicsContext(OPEN_TRACK, openGeometry);
const realContext = () => createPhysicsContext(KAAPI_CIRCUIT, geometry);

const input = (steer: -1 | 0 | 1, braking = false): KartInput => ({ steer, braking });

// ---------------------------------------------------------------------------
// track-geometry
// ---------------------------------------------------------------------------

describe("track geometry", () => {
  it("expands the control points into a closed loop", () => {
    expect(geometry.count).toBe(KAAPI_CIRCUIT.controlPoints.length * 32);

    const firstX = readNumber(geometry.xs, 0);
    const firstY = readNumber(geometry.ys, 0);
    const lastX = readNumber(geometry.xs, geometry.count - 1);
    const lastY = readNumber(geometry.ys, geometry.count - 1);
    const closingGap = Math.hypot(firstX - lastX, firstY - lastY);
    const averageSpacing = geometry.length / geometry.count;

    // The loop closes: the final vertex is one ordinary step from the first.
    expect(closingGap).toBeLessThan(averageSpacing * 3);

    // Arc length zero sits on the start/finish control point.
    const startControl = KAAPI_CIRCUIT.controlPoints[KAAPI_CIRCUIT.startIndex];
    expect(startControl).toBeDefined();
    expect(
      Math.hypot(firstX - (startControl?.x ?? 0), firstY - (startControl?.y ?? 0)),
    ).toBeLessThan(1);
  });

  it("builds a strictly monotonic arc-length table", () => {
    for (let i = 0; i < geometry.count; i += 1) {
      expect(readNumber(geometry.cumulative, i + 1)).toBeGreaterThan(
        readNumber(geometry.cumulative, i),
      );
    }
    expect(geometry.length).toBe(readNumber(geometry.cumulative, geometry.count));
  });

  it("measures a lap length close to the contract's approximateLapLength", () => {
    const contractLength = KAAPI_CIRCUIT.approximateLapLength;
    const drift = Math.abs(geometry.length - contractLength) / contractLength;
    // Measured 5358.18 world units against the contract's 5358.
    expect(drift).toBeLessThan(0.02);
    expect(geometry.length).toBeGreaterThan(5_250);
    expect(geometry.length).toBeLessThan(5_500);
  });

  it("reports ~zero lateral offset for points on the centreline", () => {
    const pose = createTrackPose();
    const sample = createTrackSample();
    for (let d = 0; d < geometry.length; d += 137) {
      poseAtDistance(geometry, d, pose);
      closestPointOnTrack(geometry, pose.x, pose.y, sample);
      expect(Math.abs(sample.lateralOffset)).toBeLessThan(0.5);
      expect(isOnTrack(geometry, sample.lateralOffset)).toBe(true);
      expect(Math.abs(sample.distanceAlong - d)).toBeLessThan(1);
    }
  });

  it("reports an off-surface lateral offset for points well outside the ribbon", () => {
    const sample = createTrackSample();
    // Well inside the infield, and the empty outer corners of the bigger world.
    const outside: ReadonlyArray<readonly [number, number]> = [
      [675, 1000],
      [1320, 40],
      [40, 1930],
    ];
    for (const point of outside) {
      closestPointOnTrack(geometry, point[0], point[1], sample);
      expect(Math.abs(sample.lateralOffset)).toBeGreaterThan(KAAPI_CIRCUIT.halfWidth);
      expect(isOnTrack(geometry, sample.lateralOffset)).toBe(false);
    }
  });

  it("lays out six distinct, non-overlapping grid slots on the tarmac", () => {
    const poses = Array.from({ length: 6 }, (_, slot) => gridStartPose(geometry, slot));
    const sample = createTrackSample();

    for (const pose of poses) {
      closestPointOnTrack(geometry, pose.x, pose.y, sample);
      expect(isOnTrack(geometry, sample.lateralOffset)).toBe(true);
    }

    for (let a = 0; a < poses.length; a += 1) {
      for (let b = a + 1; b < poses.length; b += 1) {
        const first = poses[a];
        const second = poses[b];
        expect(first).toBeDefined();
        expect(second).toBeDefined();
        const gap = Math.hypot(
          (first?.x ?? 0) - (second?.x ?? 0),
          (first?.y ?? 0) - (second?.y ?? 0),
        );
        // Two kart radii apart at the very least.
        expect(gap).toBeGreaterThan(KART.radius * 2);
      }
    }

    // Every kart starts behind the line, closer to it the better the slot.
    for (let slot = 1; slot < 6; slot += 1) {
      const ahead = gridStartDistance(geometry, slot - 1);
      const behind = gridStartDistance(geometry, slot);
      expect(behind).toBeLessThanOrEqual(ahead);
    }
  });
});

// ---------------------------------------------------------------------------
// kart-physics
// ---------------------------------------------------------------------------

describe("kart physics", () => {
  it("auto-accelerates toward maxSpeed and never exceeds it", () => {
    const context = openContext();
    const pose = poseAtDistance(geometry, 0);
    const state = createKartState(pose.x, pose.y, pose.heading, 0);
    const coast = input(0);

    let peak = 0;
    for (let i = 0; i < 60 * 6; i += 1) {
      stepKart(state, coast, STEP_SECONDS, context, state);
      peak = Math.max(peak, state.speed);
      expect(state.speed).toBeLessThanOrEqual(KART.maxSpeed + 1e-9);
    }

    expect(peak).toBeCloseTo(KART.maxSpeed, 6);
    expect(state.speed).toBeCloseTo(KART.maxSpeed, 6);
  });

  it("decelerates under braking", () => {
    const context = openContext();
    const pose = poseAtDistance(geometry, 0);
    const state = createKartState(pose.x, pose.y, pose.heading, 0);
    const coast = input(0);
    for (let i = 0; i < 180; i += 1) stepKart(state, coast, STEP_SECONDS, context, state);
    expect(state.speed).toBeCloseTo(KART.maxSpeed, 6);

    const brake = input(0, true);
    const before = state.speed;
    for (let i = 0; i < 30; i += 1) stepKart(state, brake, STEP_SECONDS, context, state);

    expect(state.speed).toBeLessThan(before);
    expect(state.speed).toBeCloseTo(KART.maxSpeed - KART.braking * 0.5, 4);

    // Braking never reverses the kart.
    for (let i = 0; i < 600; i += 1) stepKart(state, brake, STEP_SECONDS, context, state);
    expect(state.speed).toBe(0);
  });

  it("clamps speed to maxSpeed * offTrackSpeedFactor once off the surface", () => {
    const context = realContext();
    // Deep in the infield, far from any part of the ribbon.
    const state = createKartState(500, 400, 0, 0);
    state.speed = KART.maxSpeed;
    state.velocityHeading = 0;

    stepKart(state, input(0), STEP_SECONDS, context, state);

    expect(state.onTrack).toBe(false);
    expect(state.speed).toBeCloseTo(KART.maxSpeed * KART.offTrackSpeedFactor, 6);
  });

  // The barrier is what stops a mistake becoming a lost race. It sits outside
  // the tarmac, so the grass shoulder above still costs speed, but nothing can
  // leave the circuit however hard it is driven at the wall.
  it("never lets a kart past the barrier, even steering hard into it", () => {
    const context = realContext();
    const geometry = context.geometry;
    const limit = geometry.halfWidth * 1.32;
    const pose = gridStartPose(geometry, 0);
    const state = createKartState(pose.x, pose.y, pose.heading, gridStartDistance(geometry, 0));

    // Full lock held for ten seconds: the kart spends the whole time trying to
    // drive straight off the side of the track.
    for (let i = 0; i < 600; i += 1) {
      stepKart(state, input(1), STEP_SECONDS, context, state);
      expect(Math.abs(state.lateralOffset)).toBeLessThanOrEqual(limit + 1e-6);
    }

    expect(Number.isFinite(state.x)).toBe(true);
    expect(Number.isFinite(state.y)).toBe(true);
  });

  it("recovers a kart dumped in the infield back toward the circuit", () => {
    const context = realContext();
    const limit = context.geometry.halfWidth * 1.32;
    const state = createKartState(500, 400, 0, 0);
    state.speed = KART.maxSpeed;

    for (let i = 0; i < 120; i += 1) {
      stepKart(state, input(0), STEP_SECONDS, context, state);
    }

    expect(Math.abs(state.lateralOffset)).toBeLessThanOrEqual(limit + 1e-6);
  });

  it("steers less at top speed than at low speed", () => {
    expect(steeringRateAt(KART.maxSpeed)).toBeLessThan(steeringRateAt(KART.maxSpeed * 0.25));
    expect(steeringRateAt(KART.maxSpeed)).toBeCloseTo(KART.turnRate * KART.highSpeedTurnFactor, 6);

    const turnFrom = (speed: number): number => {
      const context = openContext();
      const state = createKartState(500, 150, 0, 0);
      state.speed = speed;
      const before = state.heading;
      const brake = speed < KART.maxSpeed;
      for (let i = 0; i < 30; i += 1) {
        // Hold the speed steady so we compare steering, not acceleration.
        state.speed = speed;
        stepKart(state, input(1, brake), STEP_SECONDS, context, state);
      }
      return Math.abs(state.heading - before);
    };

    expect(turnFrom(KART.maxSpeed)).toBeLessThan(turnFrom(KART.maxSpeed * 0.25));
  });
});

// ---------------------------------------------------------------------------
// lap-tracker
// ---------------------------------------------------------------------------

const LAP_LENGTH = 1_000;

/** Feeds a list of arc lengths, one per simulated 100 ms. */
const feed = (
  tracker: ReturnType<typeof createLapTracker>,
  distances: readonly number[],
  startMs = 0,
  stepMs = 100,
): string[] => {
  const ticks: string[] = [];
  let elapsed = startMs;
  for (const distance of distances) {
    elapsed += stepMs;
    ticks.push(advanceLapTracker(tracker, distance, elapsed));
  }
  return ticks;
};

/** One clean lap's worth of arc lengths, ending just past the line. */
const lapSamples = (from: number, to: number, count: number): number[] => {
  const samples: number[] = [];
  for (let i = 1; i <= count; i += 1) {
    samples.push((from + ((to - from) * i) / count) % LAP_LENGTH);
  }
  return samples;
};

describe("lap tracker", () => {
  it("counts a forward crossing once a full lap has been driven", () => {
    const tracker = createLapTracker(LAP_LENGTH, 970);
    // Roll off the grid, over the line (the lights-out crossing is not a lap),
    // then all the way round and over it again.
    const ticks = feed(tracker, lapSamples(970, 970 + LAP_LENGTH + 90, 110));

    expect(ticks.filter((tick) => tick !== "none")).toHaveLength(1);
    expect(tracker.lapsCompleted).toBe(1);
    expect(tracker.lapSplits).toHaveLength(1);
    expect(tracker.lapSplits[0]).toBeGreaterThan(0);
    expect(tracker.progress).toBeGreaterThanOrEqual(1);
    expect(tracker.progress).toBeLessThan(1.1);
  });

  it("ignores a backwards crossing of the line", () => {
    const tracker = createLapTracker(LAP_LENGTH, 30);
    const ticks = feed(tracker, [20, 10, 995, 985, 975]);

    expect(ticks.every((tick) => tick === "none")).toBe(true);
    expect(tracker.lapsCompleted).toBe(0);
    expect(tracker.lapSplits).toHaveLength(0);
    expect(tracker.progress).toBe(0);
  });

  it("ignores a short-cut crossing that skipped most of the lap", () => {
    const tracker = createLapTracker(LAP_LENGTH, 970);
    // Over the line, on to 20% of the lap, then cut back across the infield
    // to just before the line and cross it again.
    feed(tracker, lapSamples(970, 1_200, 30));
    expect(tracker.lapsCompleted).toBe(0);

    const ticks = feed(tracker, [980, 990, 5, 15]);
    expect(ticks.every((tick) => tick === "none")).toBe(true);
    expect(tracker.lapsCompleted).toBe(0);
    expect(tracker.lapSplits).toHaveLength(0);
  });

  it("finishes after TOTAL_LAPS and emits exactly TOTAL_LAPS splits", () => {
    const tracker = createLapTracker(LAP_LENGTH, 970);
    const ticks = feed(
      tracker,
      lapSamples(970, 970 + 90 + TOTAL_LAPS * LAP_LENGTH, 100 * TOTAL_LAPS + 10),
    );

    expect(ticks.filter((tick) => tick === "lap")).toHaveLength(TOTAL_LAPS - 1);
    expect(ticks.filter((tick) => tick === "finish")).toHaveLength(1);
    expect(tracker.lapSplits).toHaveLength(TOTAL_LAPS);
    expect(tracker.finished).toBe(true);
    expect(tracker.finishMs).toBeGreaterThan(0);
    expect(tracker.progress).toBe(TOTAL_LAPS);

    // Nothing counts after the flag.
    expect(advanceLapTracker(tracker, 500, 99_999)).toBe("none");
    expect(tracker.lapSplits).toHaveLength(TOTAL_LAPS);
  });
});

// ---------------------------------------------------------------------------
// tuning proof: an auto-driver that follows the centreline
// ---------------------------------------------------------------------------

/** Radius of curvature of the centreline at an arc length. */
const radiusAt = (track: TrackGeometry, distance: number): number => {
  const back = poseAtDistance(track, distance - 20);
  const forward = poseAtDistance(track, distance + 20);
  const curvature = Math.abs(angleDifference(back.heading, forward.heading)) / 40;
  return curvature > 1e-6 ? 1 / curvature : Number.POSITIVE_INFINITY;
};

/**
 * Fastest speed at which the kart's steering can still hold a given radius:
 * v / R = turnRate * (1 + (highSpeedTurnFactor - 1) * v / maxSpeed).
 */
const cornerSpeedForRadius = (radius: number): number =>
  KART.turnRate / (1 / radius + (KART.turnRate * (1 - KART.highSpeedTurnFactor)) / KART.maxSpeed);

const CORNER_SAFETY = 0.86;

const cornerSpeedAhead = (track: TrackGeometry, distance: number): number => {
  let limit: number = KART.maxSpeed;
  for (let ahead = 20; ahead <= 200; ahead += 20) {
    const speed = cornerSpeedForRadius(radiusAt(track, distance + ahead)) * CORNER_SAFETY;
    if (speed < limit) limit = speed;
  }
  return limit;
};

interface AutoDriverResult {
  finishMs: number;
  lapSplits: number[];
  offTrackSteps: number;
  steps: number;
}

/** Drives the centreline for TOTAL_LAPS and reports the race time. */
const runAutoDriver = (): AutoDriverResult => {
  const context = realContext();
  const startDistance = gridStartDistance(geometry, 0);
  const pose = gridStartPose(geometry, 0);
  const state = createKartState(pose.x, pose.y, pose.heading, startDistance);
  const tracker = createLapTracker(geometry.length, startDistance);
  const command: KartInput = { steer: 0, braking: false };
  const aim = createTrackPose();

  let elapsedMs = 0;
  let offTrackSteps = 0;
  let steps = 0;

  while (!tracker.finished && elapsedMs < 300_000) {
    const lookAhead = clamp(state.speed * 0.5, 55, 145);
    poseAtDistance(geometry, state.distanceAlong + lookAhead, aim);
    const desired = Math.atan2(aim.y - state.y, aim.x - state.x);
    const error = angleDifference(state.heading, desired);
    command.steer = error > 0.012 ? 1 : error < -0.012 ? -1 : 0;
    command.braking = state.speed > cornerSpeedAhead(geometry, state.distanceAlong);

    stepKart(state, command, STEP_SECONDS, context, state);
    elapsedMs += STEP_MS;
    steps += 1;
    if (!state.onTrack) offTrackSteps += 1;
    advanceLapTracker(tracker, state.distanceAlong, elapsedMs);
  }

  return {
    finishMs: tracker.finishMs ?? elapsedMs,
    lapSplits: tracker.lapSplits.slice(),
    offTrackSteps,
    steps,
  };
};

describe("race tuning", () => {
  it("completes three clean laps inside the 90-150 s window", () => {
    const result = runAutoDriver();

    const lapDurations = result.lapSplits.map(
      (split, index) => split - (index === 0 ? 0 : (result.lapSplits[index - 1] ?? 0)),
    );

    // Surfaced in the run output so the tuning stays honest.
    console.log(
      `[kaapi-karts] spline length ${geometry.length.toFixed(1)} u | ` +
        `race ${(result.finishMs / 1000).toFixed(2)} s | ` +
        `laps ${lapDurations.map((lap) => (lap / 1000).toFixed(2)).join(", ")} s | ` +
        `off-track ${((result.offTrackSteps / result.steps) * 100).toFixed(1)}%`,
    );

    expect(result.lapSplits).toHaveLength(TOTAL_LAPS);
    expect(result.finishMs).toBeGreaterThan(90_000);
    expect(result.finishMs).toBeLessThan(150_000);

    for (const lap of lapDurations) {
      expect(lap).toBeGreaterThan(28_000);
      expect(lap).toBeLessThan(50_000);
    }

    // A centreline driver should barely touch the verge.
    expect(result.offTrackSteps / result.steps).toBeLessThan(0.05);
  });

  // Guards the engine/server seam: `lapSplits` are CUMULATIVE ms, and the server
  // clamps any finish whose inter-split deltas fall under MIN_PLAUSIBLE_LAP_MS.
  // Emitting per-lap durations here would flag every honest race as suspect.
  it("emits a finish the server's plausibility rule accepts", () => {
    const result = runAutoDriver();

    expect(result.lapSplits).toHaveLength(TOTAL_LAPS);
    expect(result.finishMs).toBeGreaterThanOrEqual(MIN_PLAUSIBLE_RACE_MS);
    expect(result.finishMs).toBeLessThanOrEqual(RACE_CAP_MS);

    let previous = 0;
    for (const split of result.lapSplits) {
      expect(split - previous).toBeGreaterThanOrEqual(MIN_PLAUSIBLE_LAP_MS);
      previous = split;
    }

    expect(previous).toBeLessThanOrEqual(result.finishMs);
  });
});

// ---------------------------------------------------------------------------
// race-engine: jsdom has no 2D context, the simulation must still work
// ---------------------------------------------------------------------------

describe("race engine", () => {
  it("constructs and tears down without a 2D context", () => {
    const canvas = document.createElement("canvas");
    let hudCalls = 0;
    let finishes = 0;

    const engine = createRaceEngine({
      canvas,
      track: KAAPI_CIRCUIT,
      selfCarNumber: 7,
      selfColour: "#6f3219",
      gridSlot: 2,
      reducedMotion: true,
      onLap: () => undefined,
      onFinish: () => {
        finishes += 1;
      },
      onBroadcast: () => undefined,
      onHud: () => {
        hudCalls += 1;
      },
    });

    const snapshot = engine.getSnapshot();
    expect(snapshot.lap).toBe(0);
    expect(snapshot.progress).toBe(0);
    expect(snapshot.speed).toBe(0);
    expect(snapshot.boostReady).toBe(true);

    const gridPose = gridStartPose(geometry, 2);
    expect(snapshot.x).toBeCloseTo(gridPose.x, 6);
    expect(snapshot.y).toBeCloseTo(gridPose.y, 6);

    engine.setSteering(1);
    engine.setBraking(true);
    engine.upsertGhost({
      carNumber: 12,
      colour: "#1f6f8b",
      x: 500,
      y: 150,
      heading: 0,
      lap: 1,
      progress: 1.5,
    });
    engine.upsertGhost({
      carNumber: 12,
      colour: "#1f6f8b",
      x: 520,
      y: 155,
      heading: 0.1,
      lap: 1,
      progress: 1.6,
    });
    engine.removeGhost(12);
    engine.removeGhost(99);

    engine.mount(Date.now() + 60_000);

    engine.forceFinish();
    engine.forceFinish();
    expect(finishes).toBe(1);
    expect(hudCalls).toBeGreaterThanOrEqual(0);

    engine.destroy();
    engine.destroy();
  });
});
