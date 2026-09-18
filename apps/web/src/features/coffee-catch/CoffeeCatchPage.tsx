import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import HelpOutlineOutlinedIcon from "@mui/icons-material/HelpOutlineOutlined";
import LocalCafeOutlinedIcon from "@mui/icons-material/LocalCafeOutlined";
import RestartAltOutlinedIcon from "@mui/icons-material/RestartAltOutlined";
import { Box, Button, Container, IconButton, Paper, Stack, Typography } from "@mui/material";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { SiteHeader } from "../../components/SiteHeader.js";
import {
  GAME_DISPLAY_NAME,
  GAME_DURATION_MS,
  MAX_LIVES,
  STORAGE_BEST_SCORE,
  type CatchItem,
  type CatchItemKind,
} from "./coffee-catch-contract.js";
import { COFFEE_CATCH_PATH } from "./coffee-catch-paths.js";

const readBest = (): number => {
  try {
    return Number.parseInt(window.localStorage.getItem(STORAGE_BEST_SCORE) ?? "0", 10) || 0;
  } catch {
    return 0;
  }
};

const ITEM_SYMBOL: Record<CatchItemKind, string> = { bean: "●", cherry: "✦", spill: "✕" };
const ITEM_COLOUR: Record<CatchItemKind, string> = {
  bean: "#6f3219",
  cherry: "#b85f16",
  spill: "#9a3e35",
};

export const CoffeeCatchPage = () => {
  const [items, setItems] = useState<CatchItem[]>([]);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(MAX_LIVES);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION_MS);
  const [playing, setPlaying] = useState(false);
  const [best, setBest] = useState(readBest);
  const nextId = useRef(0);
  const lastFrame = useRef<number | null>(null);
  const spawnClock = useRef(0);

  const start = useCallback(() => {
    setItems([]);
    setScore(0);
    setLives(MAX_LIVES);
    setTimeLeft(GAME_DURATION_MS);
    setPlaying(true);
    lastFrame.current = null;
    spawnClock.current = 0;
  }, []);

  const finish = useCallback(() => {
    setPlaying(false);
    setItems([]);
  }, []);

  useEffect(() => {
    if (!playing) return undefined;

    let frame = 0;
    const tick = (now: number) => {
      if (lastFrame.current === null) lastFrame.current = now;
      const elapsed = Math.min(80, now - lastFrame.current);
      lastFrame.current = now;
      spawnClock.current += elapsed;

      setTimeLeft((current) => {
        const next = Math.max(0, current - elapsed);
        if (next === 0) finish();
        return next;
      });

      if (spawnClock.current > 620) {
        spawnClock.current = 0;
        const kind: CatchItemKind =
          Math.random() < 0.14 ? "spill" : Math.random() < 0.2 ? "cherry" : "bean";
        setItems((current) => [
          ...current,
          { id: nextId.current++, kind, x: 8 + Math.random() * 84, y: -8 },
        ]);
      }

      setItems((current) => {
        const moved: CatchItem[] = [];
        let missed = 0;
        for (const item of current) {
          const y = item.y + elapsed * 0.055;
          if (y > 92) missed += item.kind === "spill" ? 0 : 1;
          else moved.push({ ...item, y });
        }
        if (missed > 0) setLives((currentLives) => Math.max(0, currentLives - missed));
        return moved;
      });

      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [finish, playing]);

  useEffect(() => {
    if (lives <= 0 && playing) finish();
  }, [finish, lives, playing]);

  useEffect(() => {
    if (score > best) {
      setBest(score);
      try {
        window.localStorage.setItem(STORAGE_BEST_SCORE, String(score));
      } catch {
        /* optional */
      }
    }
  }, [best, score]);

  const catchItem = (item: CatchItem) => {
    setItems((current) => current.filter((candidate) => candidate.id !== item.id));
    if (item.kind === "spill") setLives((current) => Math.max(0, current - 1));
    else setScore((current) => current + (item.kind === "cherry" ? 3 : 1));
  };

  const over = !playing && (timeLeft === 0 || lives === 0);

  return (
    <>
      <SiteHeader />
      <Box component="main" sx={{ py: { xs: 3, md: 5 }, pb: "env(safe-area-inset-bottom)" }}>
        <Container maxWidth="sm">
          <Stack
            direction="row"
            sx={{ justifyContent: "space-between", alignItems: "flex-start", gap: 2 }}
          >
            <Box>
              <Button
                component={Link}
                to="/games"
                size="small"
                startIcon={<ArrowBackRoundedIcon />}
                sx={{ mb: 1 }}
              >
                Games
              </Button>
              <Typography variant="overline" color="secondary.dark">
                Solo · 45 seconds
              </Typography>
              <Typography component="h1" variant="h4" sx={{ fontWeight: 850 }}>
                {GAME_DISPLAY_NAME}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1}>
              <Paper variant="outlined" sx={{ px: 1.5, py: 1, textAlign: "center" }}>
                <Typography variant="caption">Score</Typography>
                <Typography sx={{ fontWeight: 900 }}>{score}</Typography>
              </Paper>
              <Paper variant="outlined" sx={{ px: 1.5, py: 1, textAlign: "center" }}>
                <Typography variant="caption">Best</Typography>
                <Typography sx={{ fontWeight: 900 }}>{best}</Typography>
              </Paper>
            </Stack>
          </Stack>
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            Tap beans and cherries before they fall. Avoid the spills.
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 2, alignItems: "center" }}>
            <Button variant="contained" startIcon={<RestartAltOutlinedIcon />} onClick={start}>
              {playing ? "Restart" : "Start game"}
            </Button>
            <Typography
              color="text.secondary"
              sx={{ ml: "auto", fontVariantNumeric: "tabular-nums" }}
            >
              {Math.ceil(timeLeft / 1000)}s · {"●".repeat(lives)}
              {"○".repeat(MAX_LIVES - lives)}
            </Typography>
            <IconButton aria-label="How to play" title="How to play">
              <HelpOutlineOutlinedIcon />
            </IconButton>
          </Stack>
          <Box
            sx={{
              mt: 2,
              position: "relative",
              height: { xs: 430, sm: 500 },
              overflow: "hidden",
              borderRadius: 4,
              bgcolor: "#f3e5d2",
              border: "1px solid rgba(111,50,25,.18)",
              backgroundImage:
                "linear-gradient(180deg, rgba(255,255,255,.45), transparent 45%, rgba(111,50,25,.08))",
            }}
          >
            {!playing ? (
              <Stack
                sx={{
                  position: "absolute",
                  inset: 0,
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  p: 3,
                }}
                spacing={1.5}
              >
                <LocalCafeOutlinedIcon sx={{ fontSize: 56, color: "primary.main" }} />
                <Typography variant="h5" sx={{ fontWeight: 800 }}>
                  {over ? `Final score: ${score}` : "Ready for a quick break?"}
                </Typography>
                <Typography color="text.secondary">
                  {over
                    ? "Try again and beat your best."
                    : "A one-handed coffee-catching game for the wait."}
                </Typography>
              </Stack>
            ) : null}
            {items.map((item) => (
              <Button
                key={item.id}
                onClick={() => catchItem(item)}
                aria-label={item.kind === "spill" ? "Avoid spill" : `Catch ${item.kind}`}
                sx={{
                  position: "absolute",
                  left: `${item.x}%`,
                  top: `${item.y}%`,
                  minWidth: 48,
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  color: ITEM_COLOUR[item.kind],
                  fontSize: 30,
                  lineHeight: 1,
                  transform: "translate(-50%, -50%)",
                  transition: "top 50ms linear",
                  touchAction: "manipulation",
                }}
              >
                {ITEM_SYMBOL[item.kind]}
              </Button>
            ))}
          </Box>
        </Container>
      </Box>
    </>
  );
};
