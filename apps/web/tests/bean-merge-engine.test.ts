import { describe, expect, it } from "vitest";

import {
  canMove,
  collapseLine,
  createEmptyGrid,
  createStartingGrid,
  emptyCells,
  hasWon,
  highestTile,
  move,
  spawnTile,
  type Grid,
} from "../src/features/bean-merge/engine/index.js";
import {
  CELL_COUNT,
  CHERRY_VALUE,
  SEED_VALUE,
  WIN_VALUE,
} from "../src/features/bean-merge/merge-contract.js";

/** Rows in, flat grid out — keeps the fixtures readable as a board. */
const gridOf = (rows: number[][]): Grid => rows.flat();

/** Deterministic stand-in for Math.random: replays the numbers it is given. */
const sequence = (values: number[]): (() => number) => {
  let index = 0;

  return () => values[index++ % values.length] ?? 0;
};

describe("bean merge engine", () => {
  describe("collapseLine", () => {
    it("slides tiles to the leading edge", () => {
      expect(collapseLine([0, 2, 0, 4]).line).toEqual([2, 4, 0, 0]);
    });

    it("merges a pair and scores the tile it created", () => {
      const result = collapseLine([2, 2, 0, 0]);

      expect(result.line).toEqual([4, 0, 0, 0]);
      expect(result.gained).toBe(4);
    });

    /** The rule that stops a full row collapsing into a single huge tile. */
    it("merges each tile at most once per move", () => {
      const result = collapseLine([2, 2, 2, 2]);

      expect(result.line).toEqual([4, 4, 0, 0]);
      expect(result.gained).toBe(8);
    });

    /** [2,2,4] must not become [2,8]: merges resolve from the leading edge. */
    it("resolves merges from the leading edge", () => {
      expect(collapseLine([2, 2, 4, 0]).line).toEqual([4, 4, 0, 0]);
    });

    it("leaves unequal neighbours alone", () => {
      const result = collapseLine([2, 4, 8, 16]);

      expect(result.line).toEqual([2, 4, 8, 16]);
      expect(result.gained).toBe(0);
    });

    it("merges the far pair after closing a gap", () => {
      expect(collapseLine([4, 0, 0, 4]).line).toEqual([8, 0, 0, 0]);
    });
  });

  describe("move", () => {
    it("slides and merges to the left", () => {
      const result = move(
        gridOf([
          [2, 2, 0, 0],
          [0, 0, 0, 0],
          [0, 0, 0, 0],
          [0, 0, 0, 0],
        ]),
        "left",
      );

      expect(result.moved).toBe(true);
      expect(result.gained).toBe(4);
      expect(result.grid.slice(0, 4)).toEqual([4, 0, 0, 0]);
    });

    it("is mirrored when swiped right", () => {
      const result = move(
        gridOf([
          [2, 2, 0, 0],
          [0, 0, 0, 0],
          [0, 0, 0, 0],
          [0, 0, 0, 0],
        ]),
        "right",
      );

      expect(result.grid.slice(0, 4)).toEqual([0, 0, 0, 4]);
    });

    it("slides and merges upward down a column", () => {
      const result = move(
        gridOf([
          [2, 0, 0, 0],
          [2, 0, 0, 0],
          [4, 0, 0, 0],
          [4, 0, 0, 0],
        ]),
        "up",
      );

      expect(result.gained).toBe(12);
      expect([result.grid[0], result.grid[4], result.grid[8], result.grid[12]]).toEqual([
        4, 8, 0, 0,
      ]);
    });

    it("slides and merges downward down a column", () => {
      const result = move(
        gridOf([
          [2, 0, 0, 0],
          [2, 0, 0, 0],
          [0, 0, 0, 0],
          [0, 0, 0, 0],
        ]),
        "down",
      );

      expect([result.grid[0], result.grid[4], result.grid[8], result.grid[12]]).toEqual([
        0, 0, 0, 4,
      ]);
    });

    /** No change means no score and no spawn, so the caller must be able to tell. */
    it("reports a move that changes nothing and keeps the grid identical", () => {
      const grid = gridOf([
        [2, 4, 8, 16],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ]);
      const result = move(grid, "left");

      expect(result.moved).toBe(false);
      expect(result.gained).toBe(0);
      expect(result.grid).toBe(grid);
    });

    it("does not mutate the grid it was given", () => {
      const grid = gridOf([
        [2, 2, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ]);
      const before = [...grid];

      move(grid, "left");

      expect([...grid]).toEqual(before);
    });

    it("merges independently on every row at once", () => {
      const result = move(
        gridOf([
          [2, 2, 0, 0],
          [4, 4, 0, 0],
          [8, 8, 0, 0],
          [0, 0, 0, 0],
        ]),
        "left",
      );

      expect(result.gained).toBe(4 + 8 + 16);
      expect([result.grid[0], result.grid[4], result.grid[8]]).toEqual([4, 8, 16]);
    });
  });

  describe("spawning", () => {
    it("puts a tile on an empty cell", () => {
      const grid = spawnTile(createEmptyGrid(), sequence([0, 0.5]));

      expect(grid.filter((value) => value !== 0)).toHaveLength(1);
    });

    it("returns the grid untouched when there is no room", () => {
      const full = gridOf([
        [2, 4, 2, 4],
        [4, 2, 4, 2],
        [2, 4, 2, 4],
        [4, 2, 4, 2],
      ]);

      expect(spawnTile(full, sequence([0, 0]))).toBe(full);
    });

    it("spawns a cherry only on the unlucky roll", () => {
      // Second value is the tile roll: below the 0.1 chance gives a cherry.
      expect(spawnTile(createEmptyGrid(), sequence([0, 0.05])).filter(Boolean)).toEqual([
        CHERRY_VALUE,
      ]);
      expect(spawnTile(createEmptyGrid(), sequence([0, 0.5])).filter(Boolean)).toEqual([
        SEED_VALUE,
      ]);
    });

    it("opens a new game with exactly two tiles", () => {
      const grid = createStartingGrid(sequence([0, 0.5, 0.9, 0.5]));

      expect(grid.filter((value) => value !== 0)).toHaveLength(2);
      expect(emptyCells(grid)).toHaveLength(CELL_COUNT - 2);
    });
  });

  describe("game over", () => {
    it("is not over while there is still room to slide", () => {
      expect(
        canMove(
          gridOf([
            [2, 4, 0, 0],
            [0, 0, 0, 0],
            [0, 0, 0, 0],
            [0, 0, 0, 0],
          ]),
        ),
      ).toBe(true);
    });

    /** A full board is not automatically game over — only a locked one is. */
    it("is not over on a full board that still has an adjacent pair", () => {
      expect(
        canMove(
          gridOf([
            [2, 2, 8, 16],
            [32, 64, 128, 256],
            [512, 1024, 2, 4],
            [8, 16, 32, 64],
          ]),
        ),
      ).toBe(true);
    });

    it("is over when no direction changes anything", () => {
      expect(
        canMove(
          gridOf([
            [2, 4, 2, 4],
            [4, 2, 4, 2],
            [2, 4, 2, 4],
            [4, 2, 4, 2],
          ]),
        ),
      ).toBe(false);
    });
  });

  describe("progress", () => {
    it("reports the highest tile", () => {
      expect(
        highestTile(
          gridOf([
            [2, 4, 8, 16],
            [0, 0, 0, 512],
            [0, 0, 0, 0],
            [0, 0, 0, 0],
          ]),
        ),
      ).toBe(512);
    });

    it("wins at a davara and stays won beyond it", () => {
      expect(hasWon(createEmptyGrid())).toBe(false);

      const won = createEmptyGrid().slice();

      won[0] = WIN_VALUE;
      expect(hasWon(won)).toBe(true);

      const beyond = createEmptyGrid().slice();

      beyond[0] = WIN_VALUE * 2;
      expect(hasWon(beyond)).toBe(true);
    });
  });
});
