/**
 * Bean Merge constants.
 *
 * Unlike the other two mini-games this one has no server, so there is no second
 * copy of this file to keep in step — nothing here crosses a wire. See
 * BEAN-MERGE.md section 3.
 */

export const GAME_DISPLAY_NAME = "Bean Merge";
export const GAME_TAGLINE =
  "Swipe to merge beans, all the way up to a davara. One player, no rush.";

export const GRID_SIZE = 4;
export const CELL_COUNT = GRID_SIZE * GRID_SIZE;

/** Reaching this wins. Play carries on afterwards. */
export const WIN_VALUE = 2048;

export const SEED_VALUE = 2;
export const CHERRY_VALUE = 4;
/** How often a spawn is a cherry rather than a seed. */
export const CHERRY_SPAWN_CHANCE = 0.1;

export type Direction = "up" | "down" | "left" | "right";

export const DIRECTIONS: readonly Direction[] = ["up", "down", "left", "right"];

export interface TileFace {
  /** What the tile is called. The value is shown small beneath it. */
  readonly name: string;
  readonly background: string;
  readonly foreground: string;
}

/**
 * The coffee ladder: a seed becomes a cherry becomes a bean, and eventually the
 * tumbler-and-davara a filter coffee is actually served in. Milk is deliberately
 * pale so the climb has a visual breath before the last three rungs darken.
 */
export const TILE_FACES: Readonly<Record<number, TileFace>> = {
  2: { name: "Seed", background: "#efe3d2", foreground: "#715b50" },
  4: { name: "Cherry", background: "#e9c9b4", foreground: "#6b4630" },
  8: { name: "Green bean", background: "#a8bf95", foreground: "#2f4a2c" },
  16: { name: "Roast", background: "#c98a4b", foreground: "#fffdf8" },
  32: { name: "Grind", background: "#b06a2c", foreground: "#fffdf8" },
  64: { name: "Filter", background: "#98561f", foreground: "#fffdf8" },
  128: { name: "Decoction", background: "#7a3f17", foreground: "#fffdf8" },
  256: { name: "Milk", background: "#d9c7a6", foreground: "#4a3524" },
  512: { name: "Kaapi", background: "#6f3219", foreground: "#fffdf8" },
  1024: { name: "Tumbler", background: "#8a5a1c", foreground: "#fffdf8" },
  2048: { name: "Davara", background: "#442012", foreground: "#f6c453" },
};

/** Anything past the davara is simply itself, in the trophy colours. */
export const BEYOND_FACE: TileFace = {
  name: "",
  background: "#2d1b13",
  foreground: "#f6c453",
};

export const faceFor = (value: number): TileFace => TILE_FACES[value] ?? BEYOND_FACE;

/** What a screen reader reads for one tile. */
export const tileLabel = (value: number): string => {
  const face = TILE_FACES[value];

  return face ? `${face.name}, ${value}` : `${value}`;
};

export const STORAGE_BEST_SCORE = "bean-merge:best";
export const STORAGE_SEEN_HOW_TO = "bean-merge:seenHowTo";
