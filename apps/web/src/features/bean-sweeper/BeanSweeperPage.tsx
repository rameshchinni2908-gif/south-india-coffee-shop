import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import FlagOutlinedIcon from "@mui/icons-material/FlagOutlined";
import HelpOutlineOutlinedIcon from "@mui/icons-material/HelpOutlineOutlined";
import LocalCafeOutlinedIcon from "@mui/icons-material/LocalCafeOutlined";
import RestartAltOutlinedIcon from "@mui/icons-material/RestartAltOutlined";
import { Box, Button, Container, IconButton, Paper, Stack, Typography } from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { SiteHeader } from "../../components/SiteHeader.js";
import {
  GAME_DISPLAY_NAME,
  GRID_SIZE,
  MINE_COUNT,
  STORAGE_BEST_TIME,
  type Board,
} from "./bean-sweeper-contract.js";
import {
  createBoard,
  flagCount,
  hasLost,
  hasWon,
  reveal,
  revealAllMines,
  toggleFlag,
} from "./engine/sweeper.js";

const readBest = (): number | null => {
  try {
    const value = Number.parseInt(window.localStorage.getItem(STORAGE_BEST_TIME) ?? "", 10);
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
};

const faceFor = (cell: Board[number]): string =>
  cell.flagged && !cell.revealed
    ? "\u2691"
    : cell.revealed && cell.mine
      ? "\u2615"
      : cell.revealed && cell.adjacent
        ? String(cell.adjacent)
        : "";
const colourFor = (number: number): string =>
  ["", "#28734f", "#1f6f8b", "#b85f16", "#7d3350", "#6f3219", "#442012", "#442012", "#442012"][
    number
  ] ?? "#442012";

export const BeanSweeperPage = () => {
  const [board, setBoard] = useState<Board>(() => createBoard());
  const [seconds, setSeconds] = useState(0);
  const [best, setBest] = useState(readBest);
  const [started, setStarted] = useState(false);
  const [flagMode, setFlagMode] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const lost = hasLost(board);
  const won = hasWon(board);
  const finished = lost || won;
  const reset = useCallback(() => {
    setBoard(createBoard());
    setSeconds(0);
    setStarted(false);
    setFlagMode(false);
  }, []);

  useEffect(() => {
    if (!started || finished) return undefined;
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1_000);
    return () => window.clearInterval(timer);
  }, [finished, started]);

  useEffect(() => {
    if (!won || (best !== null && seconds >= best)) return;
    setBest(seconds);
    try {
      window.localStorage.setItem(STORAGE_BEST_TIME, String(seconds));
    } catch {
      /* optional */
    }
  }, [best, seconds, won]);

  const resultText = useMemo(() => {
    if (won) return `Cleared in ${seconds}s. Nice pour.`;
    if (lost) return "A bitter bean was found. Try another board.";
    return "Tap a cell to reveal it. Find the beans and avoid the mines.";
  }, [lost, seconds, won]);

  const act = (index: number) => {
    if (finished) return;
    setStarted(true);
    setBoard((current) => {
      if (flagMode) return toggleFlag(current, index);
      const cell = current[index];
      if (cell?.mine) return revealAllMines(current);
      return reveal(current, index);
    });
  };

  return (
    <>
      <SiteHeader />
      <Box component="main" sx={{ py: { xs: 3, md: 5 }, pb: "env(safe-area-inset-bottom)" }}>
        <Container maxWidth="sm">
          <Button
            component={Link}
            to="/games"
            size="small"
            startIcon={<ArrowBackRoundedIcon />}
            sx={{ mb: 1 }}
          >
            Games
          </Button>
          <Stack
            direction="row"
            sx={{ justifyContent: "space-between", alignItems: "flex-start", gap: 2 }}
          >
            <Box>
              <Typography variant="overline" color="secondary.dark">
                Solo - web and mobile
              </Typography>
              <Typography component="h1" variant="h4" sx={{ fontWeight: 850 }}>
                {GAME_DISPLAY_NAME}
              </Typography>
            </Box>
            <Paper variant="outlined" sx={{ px: 1.5, py: 1, textAlign: "center" }}>
              <Typography variant="caption">Best</Typography>
              <Typography sx={{ fontWeight: 900 }}>{best === null ? "-" : `${best}s`}</Typography>
            </Paper>
          </Stack>
          <Stack direction="row" spacing={1} sx={{ mt: 2, alignItems: "center", flexWrap: "wrap" }}>
            <Button variant="contained" startIcon={<RestartAltOutlinedIcon />} onClick={reset}>
              New board
            </Button>
            <Button
              variant={flagMode ? "contained" : "outlined"}
              color={flagMode ? "secondary" : "primary"}
              startIcon={<FlagOutlinedIcon />}
              onClick={() => setFlagMode((value) => !value)}
            >
              {flagMode ? "Flag mode on" : "Flag mode"}
            </Button>
            <IconButton aria-label="How to play" onClick={() => setHelpOpen((value) => !value)}>
              <HelpOutlineOutlinedIcon />
            </IconButton>
            <Typography
              color="text.secondary"
              sx={{ ml: "auto", fontVariantNumeric: "tabular-nums" }}
            >
              {seconds}s - {flagCount(board)}/{MINE_COUNT} flags
            </Typography>
          </Stack>
          {helpOpen ? (
            <Paper variant="outlined" sx={{ mt: 2, p: 2 }}>
              <Typography sx={{ fontWeight: 750 }}>How to play</Typography>
              <Typography variant="body2" color="text.secondary">
                Numbers show how many beans touch a cell. Reveal safe cells and flag the ten hidden
                beans. On desktop, right-click flags a cell too.
              </Typography>
            </Paper>
          ) : null}
          <Paper
            variant="outlined"
            sx={{
              mt: 2,
              p: { xs: 1, sm: 1.5 },
              borderColor: "rgba(111,50,25,.18)",
              background: "linear-gradient(135deg, #fffdf8, #f3e5d2)",
            }}
          >
            <Box
              role="grid"
              aria-label="Bean Sweeper board"
              sx={{
                display: "grid",
                gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)`,
                gap: { xs: 0.5, sm: 0.75 },
                aspectRatio: "1",
                maxWidth: 520,
                mx: "auto",
              }}
            >
              {board.map((cell, index) => (
                <Button
                  key={index}
                  role="gridcell"
                  aria-label={`Row ${Math.floor(index / GRID_SIZE) + 1}, column ${(index % GRID_SIZE) + 1}${cell.revealed ? `, ${cell.mine ? "coffee bean" : cell.adjacent ? `${cell.adjacent} nearby` : "clear"}` : ", hidden"}`}
                  onClick={() => act(index)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setFlagMode(true);
                    setBoard((current) => toggleFlag(current, index));
                  }}
                  sx={{
                    minWidth: 0,
                    minHeight: 0,
                    aspectRatio: "1",
                    p: 0,
                    borderRadius: 1.5,
                    bgcolor: cell.revealed
                      ? cell.mine
                        ? "#f3c9a8"
                        : "rgba(111,50,25,.08)"
                      : "#6f3219",
                    color: cell.revealed ? colourFor(cell.adjacent) : "#fffdf8",
                    fontSize: { xs: 16, sm: 21 },
                    fontWeight: 900,
                    boxShadow: cell.revealed
                      ? "inset 0 0 0 1px rgba(111,50,25,.08)"
                      : "0 2px 0 #442012",
                    "&:hover": { bgcolor: cell.revealed ? "rgba(111,50,25,.14)" : "#8a4526" },
                  }}
                >
                  {faceFor(cell)}
                </Button>
              ))}
            </Box>
          </Paper>
          <Typography
            role="status"
            aria-live="polite"
            sx={{
              mt: 2,
              textAlign: "center",
              color: finished ? "primary.main" : "text.secondary",
              fontWeight: finished ? 750 : 400,
            }}
          >
            {resultText}
          </Typography>
          {!started && !finished ? (
            <Stack sx={{ mt: 1, alignItems: "center" }}>
              <LocalCafeOutlinedIcon sx={{ color: "primary.main" }} />
            </Stack>
          ) : null}
        </Container>
      </Box>
    </>
  );
};
