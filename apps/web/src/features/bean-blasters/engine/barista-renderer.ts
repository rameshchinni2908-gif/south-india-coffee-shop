/**
 * Barista rendering for Bean Blasters.
 *
 * Top-down vector barista: a body in the player's badge colour, an apron, a
 * portafilter held out along the aim, heart pips, and the two-digit badge
 * number. The camera never rotates (BEAN-BLASTERS.md §3a), so the number is
 * simply drawn upright — no counter-rotation is needed, unlike the kart game.
 *
 * Rivals are drawn translucent so a player never loses their own barista in a
 * crowd, and dimmed further while they are away on a refill break.
 *
 * No allocations per call: every value below is a module constant.
 */

import { formatBadgeNumber, HEALTH } from "../arena-contract.js";

/** Rivals are ghosts: their pose is up to a broadcast interval stale (§7a). */
export const GHOST_ALPHA = 0.62;
export const SELF_ALPHA = 1;
/** Off for a refill. Still visible, still a valid target (§5). */
export const DOWNED_ALPHA = 0.28;

const BODY_RADIUS = 20;
const APRON_RADIUS = 12;
const ARM_LENGTH = 26;
const ARM_WIDTH = 7;
const PORTAFILTER_RADIUS = 6;

const HEART_PIP_RADIUS = 3.6;
const HEART_PIP_GAP = 10;
const HEART_PIP_Y = -BODY_RADIUS - 12;

const NUMBER_FONT = "700 15px Inter, system-ui, sans-serif";
const NUMBER_Y = -BODY_RADIUS - 24;

const OUTLINE_COLOUR = "#2d1b13";
const APRON_COLOUR = "rgba(255, 253, 248, 0.86)";
const ARM_COLOUR = "#442012";
const NUMBER_COLOUR = "#fffdf8";
const NUMBER_HALO = "#2d1b13";
const HEART_FULL = "#b85f16";
const HEART_EMPTY = "rgba(45, 27, 19, 0.28)";
const SHIELD_COLOUR = "#1f6f8b";
const AIM_COLOUR = "rgba(184, 95, 22, 0.55)";
const SPLASH_COLOUR = "#b85f16";

/** How far the aim line reaches. Short of a bean's range: it is a hint, not a laser. */
const AIM_LINE_LENGTH = 150;
const AIM_DASH: number[] = [10, 12];
const NO_DASH: number[] = [];

export interface BaristaRenderOptions {
  x: number;
  y: number;
  /** Facing, in radians. Independent of the direction of travel. */
  aim: number;
  colour: string;
  badgeNumber: number;
  alpha: number;
  hearts: number;
  downed: boolean;
  /** Draw the portafilter shield ring. */
  shielded: boolean;
  /** Only the player's own barista shows the aim line. */
  showAim: boolean;
}

export const createBaristaRenderOptions = (
  colour: string,
  badgeNumber: number,
): BaristaRenderOptions => ({
  x: 0,
  y: 0,
  aim: 0,
  colour,
  badgeNumber,
  alpha: SELF_ALPHA,
  hearts: HEALTH.startHearts,
  downed: false,
  shielded: false,
  showAim: false,
});

/** Draws one barista in world coordinates. The caller owns the camera transform. */
export const drawBarista = (ctx: CanvasRenderingContext2D, options: BaristaRenderOptions): void => {
  const { x, y, aim, colour, badgeNumber, hearts, downed, shielded, showAim } = options;
  const alpha = downed ? options.alpha * DOWNED_ALPHA : options.alpha;

  ctx.save();
  ctx.globalAlpha = alpha;

  if (showAim && !downed) {
    ctx.strokeStyle = AIM_COLOUR;
    ctx.lineWidth = 3;
    ctx.setLineDash(AIM_DASH);
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(aim) * (BODY_RADIUS + 6), y + Math.sin(aim) * (BODY_RADIUS + 6));
    ctx.lineTo(x + Math.cos(aim) * AIM_LINE_LENGTH, y + Math.sin(aim) * AIM_LINE_LENGTH);
    ctx.stroke();
    ctx.setLineDash(NO_DASH);
  }

  ctx.translate(x, y);

  // Arm and portafilter, drawn under the body so the body reads as the target.
  ctx.save();
  ctx.rotate(aim);
  ctx.fillStyle = ARM_COLOUR;
  ctx.fillRect(BODY_RADIUS - 4, -ARM_WIDTH / 2, ARM_LENGTH, ARM_WIDTH);
  ctx.beginPath();
  ctx.arc(BODY_RADIUS - 4 + ARM_LENGTH, 0, PORTAFILTER_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Body.
  ctx.beginPath();
  ctx.arc(0, 0, BODY_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = colour;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = OUTLINE_COLOUR;
  ctx.stroke();

  // Apron, offset toward the aim so the barista reads directional at a glance.
  ctx.beginPath();
  ctx.arc(Math.cos(aim) * 4, Math.sin(aim) * 4, APRON_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = APRON_COLOUR;
  ctx.fill();

  if (shielded) {
    ctx.beginPath();
    ctx.arc(0, 0, BODY_RADIUS + 8, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = SHIELD_COLOUR;
    ctx.stroke();
  }

  // Heart pips, centred above the body.
  const total = HEALTH.maxHearts;
  const firstX = -((total - 1) * HEART_PIP_GAP) / 2;
  for (let i = 0; i < total; i += 1) {
    ctx.beginPath();
    ctx.arc(firstX + i * HEART_PIP_GAP, HEART_PIP_Y, HEART_PIP_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = i < hearts ? HEART_FULL : HEART_EMPTY;
    ctx.fill();
  }

  // Badge number. Upright without any counter-rotation, because the camera is
  // fixed-orientation — the whole reason aiming can be absolute.
  ctx.font = NUMBER_FONT;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.strokeStyle = NUMBER_HALO;
  const label = formatBadgeNumber(badgeNumber);
  ctx.strokeText(label, 0, NUMBER_Y);
  ctx.fillStyle = NUMBER_COLOUR;
  ctx.fillText(label, 0, NUMBER_Y);

  ctx.restore();
};

/**
 * A splash decal: coffee grounds on the floor where a bean landed. Purely
 * decorative, and skipped entirely under `prefers-reduced-motion` (§9).
 */
export const drawSplash = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  alpha: number,
): void => {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = SPLASH_COLOUR;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = alpha * 0.6;
  ctx.beginPath();
  ctx.arc(x + radius * 0.7, y - radius * 0.5, radius * 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x - radius * 0.6, y + radius * 0.6, radius * 0.28, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};
