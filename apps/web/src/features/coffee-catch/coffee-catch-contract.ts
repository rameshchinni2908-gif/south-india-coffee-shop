export const GAME_DISPLAY_NAME = "Coffee Catch";
export const GAME_TAGLINE = "Catch the good beans. Save the cup. Beat your best.";
export const GAME_DURATION_MS = 45_000;
export const MAX_LIVES = 3;
export const STORAGE_BEST_SCORE = "coffee-catch:best";

export type CatchItemKind = "bean" | "cherry" | "spill";

export interface CatchItem {
  readonly id: number;
  readonly kind: CatchItemKind;
  readonly x: number;
  readonly y: number;
}
