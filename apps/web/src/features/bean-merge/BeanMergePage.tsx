import HelpOutlineOutlinedIcon from "@mui/icons-material/HelpOutlineOutlined";
import RestartAltOutlinedIcon from "@mui/icons-material/RestartAltOutlined";
import UndoOutlinedIcon from "@mui/icons-material/UndoOutlined";
import { Alert, Box, Button, Container, IconButton, Paper, Stack, Typography } from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { SiteHeader } from "../../components/SiteHeader.js";
import { canMove, createStartingGrid, hasWon, move, spawnTile, type Grid } from "./engine/index.js";
import { GAME_DISPLAY_NAME, WIN_VALUE, type Direction } from "./merge-contract.js";
import { MergeBoard } from "./MergeBoard.js";
import { MergeHowToDialog } from "./MergeHowToDialog.js";
import {
  hasSeenHowTo,
  readBestScore,
  storeBestScore,
  storeSeenHowTo,
} from "./merge-preferences.js";
import { useReducedMotion } from "./use-merge-reduced-motion.js";

interface Snapshot {
  grid: Grid;
  score: number;
}

const KEY_DIRECTIONS: Readonly<Record<string, Direction>> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  w: "up",
  a: "left",
  s: "down",
  d: "right",
  W: "up",
  A: "left",
  S: "down",
  D: "right",
};

const ScorePanel = ({ label, value }: { label: string; value: number }) => (
  <Paper
    variant="outlined"
    sx={{
      px: { xs: 1.25, sm: 2 },
      py: 1,
      minWidth: { xs: 74, sm: 92 },
      textAlign: "center",
      borderColor: "rgba(111, 50, 25, 0.18)",
    }}
  >
    <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.4 }}>
      {label}
    </Typography>
    <Typography sx={{ fontWeight: 900, fontSize: 20, fontVariantNumeric: "tabular-nums" }}>
      {value}
    </Typography>
  </Paper>
);

export const BeanMergePage = () => {
  const reducedMotion = useReducedMotion();
  const [grid, setGrid] = useState<Grid>(() => createStartingGrid());
  const [score, setScore] = useState(0);
  const [storedBest, setStoredBest] = useState(() => readBestScore());
  const [previous, setPrevious] = useState<Snapshot | null>(null);
  const [howToOpen, setHowToOpen] = useState(() => !hasSeenHowTo());
  const [winDismissed, setWinDismissed] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  // Read inside the key handler, which is registered once.
  const howToOpenRef = useRef(howToOpen);

  useEffect(() => {
    howToOpenRef.current = howToOpen;
  }, [howToOpen]);

  const won = hasWon(grid);
  const stuck = useMemo(() => !canMove(grid), [grid]);
  // Derived rather than stored, so beating your best needs no state update and
  // cannot cascade a render. `storedBest` only moves when a game is restarted.
  const best = Math.max(storedBest, score);

  // Writing to localStorage is not a state update, so this stays a plain effect:
  // the run is banked as it happens, not only when the player starts a new game.
  useEffect(() => {
    if (score > storedBest) {
      storeBestScore(score);
    }
  }, [score, storedBest]);

  const applyMove = useCallback((direction: Direction) => {
    setGrid((current) => {
      const result = move(current, direction);

      // A move that changes nothing must not score, spawn, or become an undo step.
      if (!result.moved) {
        return current;
      }

      setScore((currentScore) => {
        setPrevious({ grid: current, score: currentScore });

        const nextScore = currentScore + result.gained;

        setAnnouncement(
          result.gained > 0 ? `Merged for ${result.gained}. Score ${nextScore}.` : "",
        );

        return nextScore;
      });

      return spawnTile(result.grid);
    });
  }, []);

  const startNewGame = useCallback(() => {
    // Bank the finished run before the score resets, or the derived best would
    // drop back to whatever was last persisted.
    setStoredBest((current) => Math.max(current, score));
    setGrid(createStartingGrid());
    setScore(0);
    setPrevious(null);
    setWinDismissed(false);
    setAnnouncement("New game started.");
  }, [score]);

  const undo = useCallback(() => {
    setPrevious((snapshot) => {
      if (!snapshot) {
        return null;
      }

      setGrid(snapshot.grid);
      setScore(snapshot.score);
      setAnnouncement(`Move undone. Score ${snapshot.score}.`);

      // Only one step is kept, so undoing spends it.
      return null;
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (howToOpenRef.current) {
        return;
      }

      const direction = KEY_DIRECTIONS[event.key];

      if (!direction) {
        return;
      }

      // Stop the arrow keys scrolling the page under the board.
      event.preventDefault();
      applyMove(direction);
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [applyMove]);

  const closeHowTo = (): void => {
    setHowToOpen(false);
    storeSeenHowTo();
  };

  return (
    <>
      <SiteHeader />
      <Box component="main" sx={{ py: { xs: 3, md: 5 }, pb: "env(safe-area-inset-bottom)" }}>
        <Container maxWidth="sm">
          <Stack
            direction="row"
            sx={{ alignItems: "flex-start", justifyContent: "space-between", gap: 2 }}
          >
            <Box>
              <Typography variant="overline" color="secondary.dark">
                Solo · no rush
              </Typography>
              {/* Shrunk on xs so the name stays on one line beside the scores;
                  at h4 it wrapped and pushed the board down the phone screen. */}
              <Typography
                component="h1"
                variant="h4"
                sx={{
                  fontWeight: 800,
                  fontSize: { xs: "1.6rem", sm: "2.125rem" },
                  lineHeight: 1.15,
                }}
              >
                {GAME_DISPLAY_NAME}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <ScorePanel label="Score" value={score} />
              <ScorePanel label="Best" value={best} />
            </Stack>
          </Stack>

          <Stack direction="row" spacing={1} sx={{ mt: 2, alignItems: "center" }}>
            <Button
              variant="contained"
              startIcon={<RestartAltOutlinedIcon />}
              onClick={startNewGame}
            >
              New game
            </Button>
            <Button
              variant="outlined"
              startIcon={<UndoOutlinedIcon />}
              onClick={undo}
              disabled={previous === null}
            >
              Undo
            </Button>
            <Box sx={{ flexGrow: 1 }} />
            <IconButton aria-label="How to play" onClick={() => setHowToOpen(true)}>
              <HelpOutlineOutlinedIcon />
            </IconButton>
          </Stack>

          <Box aria-live="polite" sx={{ mt: 2 }}>
            {won && !winDismissed ? (
              <Alert
                severity="success"
                action={
                  <Button color="inherit" size="small" onClick={() => setWinDismissed(true)}>
                    Keep going
                  </Button>
                }
              >
                You reached the davara. Keep merging for a higher score.
              </Alert>
            ) : null}
            {stuck ? (
              <Alert
                severity="info"
                action={
                  <Button color="inherit" size="small" onClick={startNewGame}>
                    Play again
                  </Button>
                }
              >
                No moves left — you finished on {score}.
              </Alert>
            ) : null}
          </Box>

          <Box sx={{ mt: 2, display: "flex", justifyContent: "center" }}>
            <MergeBoard grid={grid} reducedMotion={reducedMotion} onSwipe={applyMove} />
          </Box>

          <Typography color="text.secondary" sx={{ mt: 2.5, fontSize: 14, textAlign: "center" }}>
            Swipe the board, or use the arrow keys. Equal tiles merge and climb toward the davara (
            {WIN_VALUE}).
          </Typography>

          {/* Announced to screen readers only; the board itself is fully labelled. */}
          <Box
            aria-live="polite"
            sx={{
              position: "absolute",
              // Must be "1px", not 1: MUI's sx treats a bare 0-1 number as a
              // fraction, so `width: 1` compiles to 100% and this silently
              // becomes a full-screen invisible box that doubles the page height.
              width: "1px",
              height: "1px",
              overflow: "hidden",
              clip: "rect(0 0 0 0)",
              whiteSpace: "nowrap",
            }}
          >
            {stuck ? `No moves left. Final score ${score}.` : announcement}
          </Box>
        </Container>
      </Box>

      <MergeHowToDialog open={howToOpen} reducedMotion={reducedMotion} onClose={closeHowTo} />
    </>
  );
};
