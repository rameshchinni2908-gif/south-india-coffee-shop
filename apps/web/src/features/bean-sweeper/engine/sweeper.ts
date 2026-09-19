import { GRID_SIZE, MINE_COUNT, type Board, type Cell } from "../bean-sweeper-contract.js";

const cellCount = GRID_SIZE * GRID_SIZE;

const neighboursOf = (index: number): number[] => {
  const row = Math.floor(index / GRID_SIZE);
  const column = index % GRID_SIZE;
  const neighbours: number[] = [];

  for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
    for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
      if (rowOffset === 0 && columnOffset === 0) continue;
      const nextRow = row + rowOffset;
      const nextColumn = column + columnOffset;
      if (nextRow >= 0 && nextRow < GRID_SIZE && nextColumn >= 0 && nextColumn < GRID_SIZE) {
        neighbours.push(nextRow * GRID_SIZE + nextColumn);
      }
    }
  }

  return neighbours;
};

export const createBoard = (random: () => number = Math.random): Board => {
  const mines = new Set<number>();
  while (mines.size < MINE_COUNT) mines.add(Math.floor(random() * cellCount));

  return Array.from({ length: cellCount }, (_, index): Cell => ({
    mine: mines.has(index),
    adjacent: neighboursOf(index).filter((neighbour) => mines.has(neighbour)).length,
    revealed: false,
    flagged: false,
  }));
};

export const reveal = (board: Board, index: number): Board => {
  const start = board[index];
  if (!start || start.flagged || start.revealed) return board;

  const next = board.slice();
  const queue = [index];
  const visited = new Set<number>();

  while (queue.length) {
    const currentIndex = queue.shift();
    if (currentIndex === undefined || visited.has(currentIndex)) continue;
    visited.add(currentIndex);
    const current = next[currentIndex];
    if (!current || current.flagged || current.revealed || current.mine) continue;
    next[currentIndex] = { ...current, revealed: true };
    if (current.adjacent === 0) {
      for (const neighbour of neighboursOf(currentIndex)) queue.push(neighbour);
    }
  }

  return next;
};

export const revealAllMines = (board: Board): Board =>
  board.map((cell) => (cell.mine ? { ...cell, revealed: true } : cell));

export const toggleFlag = (board: Board, index: number): Board => {
  const cell = board[index];
  if (!cell || cell.revealed) return board;
  const flags = board.filter((candidate) => candidate.flagged).length;
  if (!cell.flagged && flags >= MINE_COUNT) return board;
  const next = board.slice();
  next[index] = { ...cell, flagged: !cell.flagged };
  return next;
};

export const hasLost = (board: Board): boolean => board.some((cell) => cell.revealed && cell.mine);

export const hasWon = (board: Board): boolean => board.every((cell) => cell.mine || cell.revealed);

export const flagCount = (board: Board): number => board.filter((cell) => cell.flagged).length;
