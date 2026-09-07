import { Box } from "@mui/material";
import { useRef, type PointerEvent as ReactPointerEvent } from "react";

import type { Grid } from "./engine/index.js";
import { GRID_SIZE, tileLabel, type Direction } from "./merge-contract.js";
import { MergeTile } from "./MergeTile.js";

/** Ignore a stray tap: a swipe has to travel this far to count. */
const SWIPE_THRESHOLD_PX = 24;

interface MergeBoardProps {
  grid: Grid;
  reducedMotion: boolean;
  onSwipe: (direction: Direction) => void;
}

const cellName = (index: number): string => {
  const row = Math.floor(index / GRID_SIZE) + 1;
  const column = (index % GRID_SIZE) + 1;

  return `Row ${row}, column ${column}`;
};

export const MergeBoard = ({ grid, reducedMotion, onSwipe }: MergeBoardProps) => {
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    startRef.current = { x: event.clientX, y: event.clientY };
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const start = startRef.current;

    startRef.current = null;

    if (!start) {
      return;
    }

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;

    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD_PX) {
      return;
    }

    // The dominant axis wins, so a slightly diagonal thumb still does what the
    // player meant.
    if (Math.abs(dx) > Math.abs(dy)) {
      onSwipe(dx > 0 ? "right" : "left");
      return;
    }

    onSwipe(dy > 0 ? "down" : "up");
  };

  return (
    <Box
      role="grid"
      aria-label="Bean Merge board"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        startRef.current = null;
      }}
      sx={{
        display: "grid",
        gridTemplateRows: `repeat(${GRID_SIZE}, 1fr)`,
        gap: { xs: 1, sm: 1.25 },
        p: { xs: 1, sm: 1.25 },
        borderRadius: 3,
        backgroundColor: "rgba(111, 50, 25, 0.10)",
        // The board is square and never wider than a comfortable thumb reach.
        width: "min(92vw, 420px)",
        aspectRatio: "1 / 1",
        touchAction: "none",
        userSelect: "none",
      }}
    >
      {/*
        Rows are real elements, not a flat list of cells: `role="grid"` requires
        `role="row"` children, and `gridcell` must sit inside one. Flattening the
        DOM to a single CSS grid fails an axe audit for exactly that reason.
      */}
      {Array.from({ length: GRID_SIZE }, (_, row) => (
        <Box
          key={`row-${row}`}
          role="row"
          sx={{
            display: "grid",
            gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)`,
            gap: { xs: 1, sm: 1.25 },
          }}
        >
          {Array.from({ length: GRID_SIZE }, (_, column) => {
            const index = row * GRID_SIZE + column;
            const value = grid[index] ?? 0;

            return (
              <Box
                key={`cell-${index}`}
                role="gridcell"
                aria-label={
                  value === 0
                    ? `${cellName(index)}, empty`
                    : `${cellName(index)}, ${tileLabel(value)}`
                }
                sx={{
                  position: "relative",
                  borderRadius: 2,
                  backgroundColor: "rgba(111, 50, 25, 0.07)",
                }}
              >
                {value === 0 ? null : <MergeTile value={value} reducedMotion={reducedMotion} />}
              </Box>
            );
          })}
        </Box>
      ))}
    </Box>
  );
};
