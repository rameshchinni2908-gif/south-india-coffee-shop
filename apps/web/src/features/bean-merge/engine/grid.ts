/**
 * Bean Merge board logic.
 *
 * Pure and framework-free: every function takes a grid and returns a new one,
 * and all randomness is injected, so the whole game is deterministic under test.
 * The rules these functions must obey are spelled out in BEAN-MERGE.md section 5.
 *
 * A grid is a flat, row-major array of `CELL_COUNT` numbers where 0 is an empty
 * cell. Flat rather than nested because every operation here is a line walk, and
 * lines in three of the four directions are not rows.
 */

import {
  CELL_COUNT,
  CHERRY_SPAWN_CHANCE,
  CHERRY_VALUE,
  DIRECTIONS,
  GRID_SIZE,
  SEED_VALUE,
  WIN_VALUE,
  type Direction,
} from "../merge-contract.js";

export type Grid = readonly number[];

export interface MoveResult {
  readonly grid: Grid;
  /** Sum of the tiles created by this move. */
  readonly gained: number;
  /** False when the move changed nothing, in which case nothing else happened. */
  readonly moved: boolean;
}

export const createEmptyGrid = (): Grid => new Array<number>(CELL_COUNT).fill(0);

export const emptyCells = (grid: Grid): number[] => {
  const cells: number[] = [];

  for (let index = 0; index < grid.length; index += 1) {
    if (grid[index] === 0) {
      cells.push(index);
    }
  }

  return cells;
};

/**
 * Indices of one line, already ordered so that index 0 is the edge the tiles
 * are travelling toward. Collapsing then only ever has to work left-to-right.
 */
const lineIndices = (direction: Direction, line: number): number[] => {
  const indices: number[] = [];

  for (let step = 0; step < GRID_SIZE; step += 1) {
    switch (direction) {
      case "left":
        indices.push(line * GRID_SIZE + step);
        break;
      case "right":
        indices.push(line * GRID_SIZE + (GRID_SIZE - 1 - step));
        break;
      case "up":
        indices.push(step * GRID_SIZE + line);
        break;
      case "down":
        indices.push((GRID_SIZE - 1 - step) * GRID_SIZE + line);
        break;
    }
  }

  return indices;
};

/**
 * Slides a single line toward index 0 and merges equal neighbours.
 *
 * Two rules live here and nowhere else: a tile may merge at most once per move
 * (so [2,2,2,2] gives [4,4], never [8]), and merges resolve from the leading
 * edge (so [2,2,4] gives [4,4], never [2,8]).
 */
export const collapseLine = (line: readonly number[]): { line: number[]; gained: number } => {
  const packed = line.filter((value) => value !== 0);
  const result: number[] = [];
  let gained = 0;

  for (let index = 0; index < packed.length; index += 1) {
    const value = packed[index] ?? 0;

    if (index + 1 < packed.length && packed[index + 1] === value) {
      const merged = value * 2;

      result.push(merged);
      gained += merged;
      // Skip the partner: it has been consumed and cannot merge again.
      index += 1;
      continue;
    }

    result.push(value);
  }

  while (result.length < line.length) {
    result.push(0);
  }

  return { line: result, gained };
};

export const move = (grid: Grid, direction: Direction): MoveResult => {
  const next = grid.slice();
  let gained = 0;
  let moved = false;

  for (let line = 0; line < GRID_SIZE; line += 1) {
    const indices = lineIndices(direction, line);
    const collapsed = collapseLine(indices.map((index) => grid[index] ?? 0));

    gained += collapsed.gained;

    for (let step = 0; step < indices.length; step += 1) {
      const target = indices[step] ?? 0;
      const value = collapsed.line[step] ?? 0;

      if (next[target] !== value) {
        moved = true;
      }

      next[target] = value;
    }
  }

  // A move that changes nothing must not score or spawn.
  return moved ? { grid: next, gained, moved: true } : { grid, gained: 0, moved: false };
};

/**
 * Places one new tile on a random empty cell. Returns the grid untouched when
 * there is no room, which the caller treats as "nothing to do" rather than an
 * error — game-over is decided by `canMove`, not by a full board.
 */
export const spawnTile = (grid: Grid, random: () => number = Math.random): Grid => {
  const empty = emptyCells(grid);

  if (empty.length === 0) {
    return grid;
  }

  const cell = empty[Math.floor(random() * empty.length) % empty.length] ?? empty[0] ?? 0;
  const value = random() < CHERRY_SPAWN_CHANCE ? CHERRY_VALUE : SEED_VALUE;
  const next = grid.slice();

  next[cell] = value;

  return next;
};

/**
 * True while any direction would change the board.
 *
 * Deliberately stricter than "the grid is full": a packed board with an adjacent
 * equal pair is still very much playable, and ending the game there would be a
 * bug players would notice immediately.
 */
export const canMove = (grid: Grid): boolean =>
  DIRECTIONS.some((direction) => move(grid, direction).moved);

export const highestTile = (grid: Grid): number =>
  grid.reduce((best, value) => Math.max(best, value), 0);

export const hasWon = (grid: Grid): boolean => highestTile(grid) >= WIN_VALUE;

/** A fresh board: two tiles, exactly as a new game should open. */
export const createStartingGrid = (random: () => number = Math.random): Grid =>
  spawnTile(spawnTile(createEmptyGrid(), random), random);
