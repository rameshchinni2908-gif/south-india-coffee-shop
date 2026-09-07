/**
 * Track rendering for Kaapi Karts.
 *
 * Draws the circuit as stacked strokes of one cached path: verge, kerb,
 * tarmac, centre dashes. Colours come from the KAAPI-KARTS.md §9 palette so
 * the canvas sits on the same cream ground as the rest of the app.
 *
 * The path is built once into a `Path2D` where available (every browser we
 * ship to); jsdom has no `Path2D`, so there is a plain fallback tracer.
 */

import type { TrackDefinition } from "../game-contract.js";
import { readNumber } from "./math.js";
import { poseAtDistance, type TrackGeometry, type TrackPose } from "./track-geometry.js";

/** KAAPI-KARTS.md §9 palette, plus the two surface tones the race needs. */
export const TRACK_PALETTE = {
  ground: "#fbf6ee",
  verge: "#ece0ca",
  vergeShadow: "#dfd0b6",
  kerbLight: "#fffdf8",
  kerbDark: "#6f3219",
  tarmac: "#463830",
  tarmacEdge: "#2d1b13",
  centreLine: "rgba(255, 253, 248, 0.26)",
  boostCore: "#f0a44a",
  boostRing: "#b85f16",
  chequerDark: "#2d1b13",
  chequerLight: "#fffdf8",
} as const;

const VERGE_PADDING = 26;
const KERB_PADDING = 8;
const KERB_DASH: number[] = [30, 30];
const CENTRE_DASH: number[] = [26, 36];
const NO_DASH: number[] = [];

const CHEQUER_DEPTH = 22;
const CHEQUER_COLUMNS = 8;
const BOOST_PAD_RADIUS = 30;

export interface TrackRenderer {
  draw(ctx: CanvasRenderingContext2D, timeMs: number, reducedMotion: boolean): void;
}

const hasPath2D = (): boolean => typeof Path2D !== "undefined";

const tracePolyline = (
  target: CanvasRenderingContext2D | Path2D,
  geometry: TrackGeometry,
): void => {
  const { xs, ys, count } = geometry;
  target.moveTo(readNumber(xs, 0), readNumber(ys, 0));
  for (let i = 1; i < count; i += 1) {
    target.lineTo(readNumber(xs, i), readNumber(ys, i));
  }
  target.closePath();
};

const drawChequer = (ctx: CanvasRenderingContext2D, pose: TrackPose, halfWidth: number): void => {
  ctx.save();
  ctx.translate(pose.x, pose.y);
  ctx.rotate(pose.heading);
  const columnHeight = (halfWidth * 2) / CHEQUER_COLUMNS;
  const cellWidth = CHEQUER_DEPTH / 2;
  for (let column = 0; column < CHEQUER_COLUMNS; column += 1) {
    for (let row = 0; row < 2; row += 1) {
      ctx.fillStyle =
        (column + row) % 2 === 0 ? TRACK_PALETTE.chequerLight : TRACK_PALETTE.chequerDark;
      ctx.fillRect(
        -CHEQUER_DEPTH / 2 + row * cellWidth,
        -halfWidth + column * columnHeight,
        cellWidth,
        columnHeight,
      );
    }
  }
  ctx.restore();
};

const drawBoostPads = (
  ctx: CanvasRenderingContext2D,
  track: TrackDefinition,
  timeMs: number,
  reducedMotion: boolean,
): void => {
  const pulse = reducedMotion ? 0.72 : 0.62 + Math.sin(timeMs / 260) * 0.18;
  const pads = track.boostPads;
  for (let i = 0; i < pads.length; i += 1) {
    const pad = pads[i];
    if (!pad) continue;
    ctx.globalAlpha = pulse;
    ctx.fillStyle = TRACK_PALETTE.boostCore;
    ctx.beginPath();
    ctx.arc(pad.x, pad.y, BOOST_PAD_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 4;
    ctx.strokeStyle = TRACK_PALETTE.boostRing;
    ctx.beginPath();
    ctx.arc(pad.x, pad.y, BOOST_PAD_RADIUS, 0, Math.PI * 2);
    ctx.stroke();

    // Chevron, pointing the way round the lap.
    ctx.strokeStyle = TRACK_PALETTE.kerbLight;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(pad.x - 9, pad.y - 11);
    ctx.lineTo(pad.x + 7, pad.y);
    ctx.lineTo(pad.x - 9, pad.y + 11);
    ctx.stroke();
  }
};

/**
 * Builds a renderer bound to one track. Cheap to construct; the heavy path is
 * created lazily on the first draw.
 */
export const createTrackRenderer = (
  geometry: TrackGeometry,
  track: TrackDefinition,
): TrackRenderer => {
  let cachedPath: Path2D | null = null;
  const startPose = poseAtDistance(geometry, 0);

  const applyPath = (ctx: CanvasRenderingContext2D): void => {
    if (hasPath2D()) {
      if (!cachedPath) {
        const path = new Path2D();
        tracePolyline(path, geometry);
        cachedPath = path;
      }
      ctx.stroke(cachedPath);
      return;
    }
    ctx.beginPath();
    tracePolyline(ctx, geometry);
    ctx.stroke();
  };

  const strokeRibbon = (ctx: CanvasRenderingContext2D, width: number, colour: string): void => {
    ctx.lineWidth = width;
    ctx.strokeStyle = colour;
    applyPath(ctx);
  };

  return {
    draw(ctx: CanvasRenderingContext2D, timeMs: number, reducedMotion: boolean): void {
      const halfWidth = geometry.halfWidth;
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.setLineDash(NO_DASH);

      // Verge, then the kerb sandwich, then the tarmac itself.
      strokeRibbon(ctx, (halfWidth + VERGE_PADDING) * 2, TRACK_PALETTE.verge);
      strokeRibbon(ctx, (halfWidth + KERB_PADDING) * 2, TRACK_PALETTE.kerbLight);
      ctx.setLineDash(KERB_DASH);
      strokeRibbon(ctx, (halfWidth + KERB_PADDING) * 2, TRACK_PALETTE.kerbDark);
      ctx.setLineDash(NO_DASH);
      strokeRibbon(ctx, halfWidth * 2, TRACK_PALETTE.tarmac);

      ctx.setLineDash(CENTRE_DASH);
      strokeRibbon(ctx, 3, TRACK_PALETTE.centreLine);
      ctx.setLineDash(NO_DASH);

      drawBoostPads(ctx, track, timeMs, reducedMotion);
      drawChequer(ctx, startPose, halfWidth);
      ctx.restore();
    },
  };
};
