/**
 * Arena rendering for Bean Blasters.
 *
 * Draws the roastery floor as flat vector primitives: floor, boards, the solid
 * wall band, crates, and the four power-up pads with their icons. No textures
 * and no images — one round is meant to cost a few hundred KB of data, not a
 * sprite sheet (BEAN-BLASTERS.md §13).
 *
 * Colours come from the "Arena palette" in §9 so the canvas sits on the same
 * cream ground as the rest of the shop.
 *
 * Every constant below is module scope: `draw` allocates nothing.
 */

import type { PowerUpKind } from "../arena-contract.js";
import type { ArenaGeometry, ArenaRect } from "./arena-geometry.js";

/** BEAN-BLASTERS.md §9, "Arena palette", plus the tones the canvas needs. */
export const ARENA_PALETTE = {
  ground: "#fbf6ee",
  floor: "#efe3d2",
  boards: "#d8c4a8",
  wall: "#6f3219",
  wallEdge: "#442012",
  cover: "#8a5a1c",
  coverTop: "#a3742f",
  coverEdge: "#442012",
  bean: "#3f2415",
  splash: "#b85f16",
  grout: "rgba(111, 50, 25, 0.07)",
  padEmpty: "rgba(111, 50, 25, 0.16)",
  padRing: "#b85f16",
  padCore: "#fffdf8",
  padIcon: "#442012",
} as const;

/** Floor tile pitch. Big enough that a phone draws a handful of lines, not a grid. */
const TILE_SIZE = 200;
const BOARDS_DEPTH = 14;
const COVER_RADIUS = 8;
const COVER_TOP_INSET = 6;
const PAD_RADIUS = 26;

export interface ArenaRenderer {
  /**
   * @param pads one entry per `arena.padPoints`; null means the pad is empty.
   */
  draw(
    ctx: CanvasRenderingContext2D,
    pads: readonly (PowerUpKind | null)[],
    timeMs: number,
    reducedMotion: boolean,
  ): void;
}

const roundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void => {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
};

const drawCrate = (ctx: CanvasRenderingContext2D, rect: ArenaRect): void => {
  const width = rect.x2 - rect.x1;
  const height = rect.y2 - rect.y1;

  roundedRect(ctx, rect.x1, rect.y1, width, height, COVER_RADIUS);
  ctx.fillStyle = ARENA_PALETTE.cover;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = ARENA_PALETTE.coverEdge;
  ctx.stroke();

  // A lighter inset lid, so a crate reads as solid from above rather than as a
  // hole in the floor.
  roundedRect(
    ctx,
    rect.x1 + COVER_TOP_INSET,
    rect.y1 + COVER_TOP_INSET,
    Math.max(width - COVER_TOP_INSET * 2, 2),
    Math.max(height - COVER_TOP_INSET * 2, 2),
    COVER_RADIUS / 2,
  );
  ctx.fillStyle = ARENA_PALETTE.coverTop;
  ctx.fill();
};

const drawRapidIcon = (ctx: CanvasRenderingContext2D, x: number, y: number): void => {
  ctx.beginPath();
  ctx.moveTo(x + 3, y - 12);
  ctx.lineTo(x - 7, y + 2);
  ctx.lineTo(x - 1, y + 2);
  ctx.lineTo(x - 3, y + 12);
  ctx.lineTo(x + 7, y - 2);
  ctx.lineTo(x + 1, y - 2);
  ctx.closePath();
  ctx.fill();
};

const drawTripleIcon = (ctx: CanvasRenderingContext2D, x: number, y: number): void => {
  for (let i = -1; i <= 1; i += 1) {
    ctx.beginPath();
    ctx.arc(x + i * 8, y + Math.abs(i) * 4, 4, 0, Math.PI * 2);
    ctx.fill();
  }
};

const drawShieldIcon = (ctx: CanvasRenderingContext2D, x: number, y: number): void => {
  ctx.beginPath();
  ctx.moveTo(x, y - 12);
  ctx.lineTo(x + 9, y - 7);
  ctx.lineTo(x + 9, y + 3);
  ctx.quadraticCurveTo(x + 9, y + 10, x, y + 13);
  ctx.quadraticCurveTo(x - 9, y + 10, x - 9, y + 3);
  ctx.lineTo(x - 9, y - 7);
  ctx.closePath();
  ctx.fill();
};

const drawRefillIcon = (ctx: CanvasRenderingContext2D, x: number, y: number): void => {
  // A cup: the refill is a heart back, and a heart is the HUD's own icon.
  ctx.beginPath();
  ctx.moveTo(x - 8, y - 8);
  ctx.lineTo(x + 6, y - 8);
  ctx.lineTo(x + 4, y + 9);
  ctx.lineTo(x - 6, y + 9);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + 8, y - 2, 4.5, -Math.PI / 2, Math.PI / 2);
  ctx.lineWidth = 3;
  ctx.stroke();
};

const drawPadIcon = (
  ctx: CanvasRenderingContext2D,
  kind: PowerUpKind,
  x: number,
  y: number,
): void => {
  ctx.fillStyle = ARENA_PALETTE.padIcon;
  ctx.strokeStyle = ARENA_PALETTE.padIcon;
  if (kind === "RAPID") drawRapidIcon(ctx, x, y);
  else if (kind === "TRIPLE") drawTripleIcon(ctx, x, y);
  else if (kind === "SHIELD") drawShieldIcon(ctx, x, y);
  else drawRefillIcon(ctx, x, y);
};

/** Builds a renderer bound to one arena. Cheap to construct, cheap to draw. */
export const createArenaRenderer = (geometry: ArenaGeometry): ArenaRenderer => {
  const arena = geometry.arena;
  const interiorWidth = geometry.maxX - geometry.minX;
  const interiorHeight = geometry.maxY - geometry.minY;

  const drawFloor = (ctx: CanvasRenderingContext2D): void => {
    ctx.fillStyle = ARENA_PALETTE.floor;
    ctx.fillRect(geometry.minX, geometry.minY, interiorWidth, interiorHeight);

    ctx.lineWidth = 2;
    ctx.strokeStyle = ARENA_PALETTE.grout;
    ctx.beginPath();
    for (let x = geometry.minX + TILE_SIZE; x < geometry.maxX; x += TILE_SIZE) {
      ctx.moveTo(x, geometry.minY);
      ctx.lineTo(x, geometry.maxY);
    }
    for (let y = geometry.minY + TILE_SIZE; y < geometry.maxY; y += TILE_SIZE) {
      ctx.moveTo(geometry.minX, y);
      ctx.lineTo(geometry.maxX, y);
    }
    ctx.stroke();
  };

  const drawWall = (ctx: CanvasRenderingContext2D): void => {
    // The wall band is drawn as a stroke centred on the interior edge, so its
    // inner face lands exactly where the physics stops a barista.
    const inset = arena.wallInset;
    ctx.lineWidth = inset;
    ctx.strokeStyle = ARENA_PALETTE.wall;
    ctx.strokeRect(
      geometry.minX - inset / 2,
      geometry.minY - inset / 2,
      interiorWidth + inset,
      interiorHeight + inset,
    );

    // Boards: a lighter kick-plate hugging the inside of the wall.
    ctx.lineWidth = BOARDS_DEPTH;
    ctx.strokeStyle = ARENA_PALETTE.boards;
    ctx.strokeRect(
      geometry.minX + BOARDS_DEPTH / 2,
      geometry.minY + BOARDS_DEPTH / 2,
      interiorWidth - BOARDS_DEPTH,
      interiorHeight - BOARDS_DEPTH,
    );

    ctx.lineWidth = 3;
    ctx.strokeStyle = ARENA_PALETTE.wallEdge;
    ctx.strokeRect(geometry.minX, geometry.minY, interiorWidth, interiorHeight);
  };

  return {
    draw(
      ctx: CanvasRenderingContext2D,
      pads: readonly (PowerUpKind | null)[],
      timeMs: number,
      reducedMotion: boolean,
    ): void {
      ctx.save();
      ctx.lineJoin = "round";
      ctx.lineCap = "butt";

      drawFloor(ctx);
      drawWall(ctx);

      for (let i = 0; i < geometry.obstacles.length; i += 1) {
        const rect = geometry.obstacles[i];
        if (!rect) continue;
        drawCrate(ctx, rect);
      }

      const pulse = reducedMotion ? 0.78 : 0.66 + Math.sin(timeMs / 320) * 0.14;
      for (let i = 0; i < arena.padPoints.length; i += 1) {
        const point = arena.padPoints[i];
        if (!point) continue;
        const kind = pads[i] ?? null;

        if (kind === null) {
          ctx.globalAlpha = 1;
          ctx.lineWidth = 3;
          ctx.strokeStyle = ARENA_PALETTE.padEmpty;
          ctx.beginPath();
          ctx.arc(point.x, point.y, PAD_RADIUS, 0, Math.PI * 2);
          ctx.stroke();
          continue;
        }

        ctx.globalAlpha = pulse;
        ctx.fillStyle = ARENA_PALETTE.padCore;
        ctx.beginPath();
        ctx.arc(point.x, point.y, PAD_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.lineWidth = 4;
        ctx.strokeStyle = ARENA_PALETTE.padRing;
        ctx.beginPath();
        ctx.arc(point.x, point.y, PAD_RADIUS, 0, Math.PI * 2);
        ctx.stroke();
        drawPadIcon(ctx, kind, point.x, point.y);
      }

      ctx.globalAlpha = 1;
      ctx.restore();
    },
  };
};

/** One bean in flight. Drawn from the pool, in world coordinates. */
export const drawBean = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
): void => {
  ctx.fillStyle = ARENA_PALETTE.bean;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
};
