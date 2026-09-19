export const GAME_DISPLAY_NAME = "Bean Sweeper";
export const GAME_TAGLINE = "Clear the roast without waking a bitter bean.";
export const GRID_SIZE = 8;
export const MINE_COUNT = 10;
export const STORAGE_BEST_TIME = "bean-sweeper:best-time";

export interface Cell {
  readonly mine: boolean;
  readonly adjacent: number;
  readonly revealed: boolean;
  readonly flagged: boolean;
}

export type Board = readonly Cell[];
