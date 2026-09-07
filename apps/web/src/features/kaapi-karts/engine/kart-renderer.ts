/**
 * Kart rendering for Kaapi Karts.
 *
 * Top-down vector kart: tyres, body in the player's colour, a light cockpit
 * and the two-digit car number. The number is drawn after the rotation is
 * undone so it always reads upright, whichever way the kart is pointing.
 *
 * No allocations per call: every value below is a module constant.
 */

import { formatCarNumber } from "../game-contract.js";

/** Ghost karts are translucent so the player never loses their own kart. */
export const GHOST_ALPHA = 0.45;
export const SELF_ALPHA = 1;

const BODY_LENGTH = 42;
const BODY_WIDTH = 26;
const BODY_RADIUS = 7;
const TYRE_LENGTH = 12;
const TYRE_WIDTH = 6;
const TYRE_INSET_X = 12;
const NUMBER_FONT = "700 15px Inter, system-ui, sans-serif";

const TYRE_COLOUR = "#241812";
const OUTLINE_COLOUR = "#2d1b13";
const COCKPIT_COLOUR = "rgba(255, 253, 248, 0.82)";
const NUMBER_COLOUR = "#fffdf8";
const NUMBER_HALO = "#2d1b13";
const BOOST_FLAME = "#f0a44a";

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

export interface KartRenderOptions {
  x: number;
  y: number;
  heading: number;
  colour: string;
  carNumber: number;
  alpha: number;
  boosting: boolean;
}

/**
 * Draws one kart in world coordinates. The caller owns the camera transform.
 */
export const drawKart = (ctx: CanvasRenderingContext2D, options: KartRenderOptions): void => {
  const { x, y, heading, colour, carNumber, alpha, boosting } = options;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(heading);

  if (boosting) {
    ctx.fillStyle = BOOST_FLAME;
    ctx.globalAlpha = alpha * 0.75;
    ctx.beginPath();
    ctx.moveTo(-BODY_LENGTH / 2, -7);
    ctx.lineTo(-BODY_LENGTH / 2 - 16, 0);
    ctx.lineTo(-BODY_LENGTH / 2, 7);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = alpha;
  }

  // Tyres, drawn under the body.
  ctx.fillStyle = TYRE_COLOUR;
  for (let sx = -1; sx <= 1; sx += 2) {
    for (let sy = -1; sy <= 1; sy += 2) {
      ctx.fillRect(
        sx * TYRE_INSET_X - TYRE_LENGTH / 2,
        sy * (BODY_WIDTH / 2) - TYRE_WIDTH / 2,
        TYRE_LENGTH,
        TYRE_WIDTH,
      );
    }
  }

  // Body.
  roundedRect(ctx, -BODY_LENGTH / 2, -BODY_WIDTH / 2, BODY_LENGTH, BODY_WIDTH, BODY_RADIUS);
  ctx.fillStyle = colour;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = OUTLINE_COLOUR;
  ctx.stroke();

  // Cockpit, offset forward so the kart reads directional at a glance.
  ctx.fillStyle = COCKPIT_COLOUR;
  roundedRect(ctx, 1, -7, 13, 14, 5);
  ctx.fill();

  // Undo the rotation so the number stays upright.
  ctx.rotate(-heading);
  ctx.font = NUMBER_FONT;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.strokeStyle = NUMBER_HALO;
  const label = formatCarNumber(carNumber);
  ctx.strokeText(label, 0, -BODY_WIDTH / 2 - 12);
  ctx.fillStyle = NUMBER_COLOUR;
  ctx.fillText(label, 0, -BODY_WIDTH / 2 - 12);

  ctx.restore();
};
