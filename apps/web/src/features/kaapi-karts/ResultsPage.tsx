import EmojiEventsOutlinedIcon from "@mui/icons-material/EmojiEventsOutlined";
import LocalCafeOutlinedIcon from "@mui/icons-material/LocalCafeOutlined";
import ReplayOutlinedIcon from "@mui/icons-material/ReplayOutlined";
import {
  Alert,
  Box,
  Button,
  Chip,
  Container,
  Divider,
  Fade,
  Grow,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { SiteHeader } from "../../components/SiteHeader.js";
import { describeGameError, describeGameErrorCode, getRaceResult } from "./game-api.js";
import {
  findCarColour,
  formatCarNumber,
  ROOM_CODE_PATTERN,
  TOTAL_LAPS,
  type RaceStanding,
} from "./game-contract.js";
import { KAAPI_KARTS_PATH, kaapiKartsLobbyPath } from "./game-paths.js";
import { GameErrorState, GameLoadingState } from "./GameStates.js";
import { readPlayerId } from "./player-identity.js";
import { useGameSocket } from "./use-game-socket.js";
import { useReducedMotion } from "./use-reduced-motion.js";

const REVEAL_DELAY_MS = 1_400;
const FALLBACK_COLOUR = "#715b50";
const PODIUM_HEIGHTS = [132, 168, 108] as const;

const formatFinish = (standing: RaceStanding): string => {
  if (standing.finishMs === null) {
    return `${standing.lapsCompleted} of ${TOTAL_LAPS} laps`;
  }

  const totalSeconds = standing.finishMs / 1_000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;

  return `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`;
};

interface PodiumStepProps {
  standing: RaceStanding;
  height: number;
  delayMs: number;
  reducedMotion: boolean;
}

const PodiumStep = ({ standing, height, delayMs, reducedMotion }: PodiumStepProps) => {
  const colourHex = findCarColour(standing.colour)?.hex ?? FALLBACK_COLOUR;

  return (
    <Grow in timeout={reducedMotion ? 0 : 480} style={{ transitionDelay: `${delayMs}ms` }}>
      <Box sx={{ textAlign: "center", flex: 1, minWidth: 0 }}>
        <Box
          aria-hidden
          sx={{
            width: 54,
            height: 54,
            mx: "auto",
            mb: 1,
            borderRadius: "50%",
            bgcolor: colourHex,
            color: "#fffdf8",
            display: "grid",
            placeItems: "center",
            fontWeight: 900,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formatCarNumber(standing.carNumber)}
        </Box>
        <Box
          sx={{
            height: reducedMotion ? 96 : height,
            borderRadius: "12px 12px 0 0",
            background: `linear-gradient(180deg, ${colourHex} 0%, rgba(68, 32, 18, 0.9) 100%)`,
            color: "#fffdf8",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            px: 1,
          }}
        >
          <Typography
            component="p"
            sx={{ fontWeight: 900, fontSize: 26, fontVariantNumeric: "tabular-nums" }}
          >
            P{standing.rank}
          </Typography>
          <Typography variant="caption" sx={{ opacity: 0.85, fontVariantNumeric: "tabular-nums" }}>
            {formatFinish(standing)}
          </Typography>
        </Box>
      </Box>
    </Grow>
  );
};

export const ResultsPage = () => {
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();
  const { code: codeParam } = useParams<{ code?: string }>();
  const code = (codeParam ?? "").toUpperCase();
  const isValidCode = ROOM_CODE_PATTERN.test(code);
  const [playerId] = useState(() => readPlayerId());
  const [revealed, setRevealed] = useState(reducedMotion);

  const socket = useGameSocket({ code: isValidCode ? code : null, playerId });
  const fallbackQuery = useQuery({
    queryKey: ["game", "result", code],
    queryFn: ({ signal }) => getRaceResult(code, signal),
    enabled: isValidCode && socket.results === null,
    retry: 1,
  });

  const result = socket.results ?? fallbackQuery.data ?? null;
  const standings = useMemo(
    () => [...(result?.standings ?? [])].sort((a, b) => a.rank - b.rank),
    [result],
  );
  const podium = standings.slice(0, 3);
  const orderedPodium = [podium[1], podium[0], podium[2]];
  const self = socket.state?.players.find((player) => player.playerId === playerId) ?? null;
  const isHost = Boolean(self?.isHost);
  const payer = standings.find((standing) => standing.carNumber === result?.payerCarNumber) ?? null;

  useEffect(() => {
    if (!result || reducedMotion) {
      return;
    }

    const timer = window.setTimeout(() => setRevealed(true), REVEAL_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [reducedMotion, result]);

  useEffect(() => {
    if (socket.status === "LOBBY") {
      navigate(kaapiKartsLobbyPath(code), { replace: true });
    }
  }, [code, navigate, socket.status]);

  if (!isValidCode) {
    return (
      <>
        <SiteHeader />
        <Box component="main" sx={{ py: { xs: 6, md: 9 } }}>
          <Container maxWidth="md">
            <GameErrorState
              title="That room code looks wrong"
              message="Room codes are four characters long and never use O, 0, I or 1."
              actionLabel="Back to Kaapi Karts"
              onAction={() => navigate(KAAPI_KARTS_PATH)}
            />
          </Container>
        </Box>
      </>
    );
  }

  return (
    <>
      <SiteHeader />
      <Box
        component="main"
        sx={{
          py: { xs: 4, md: 7 },
          pb: "calc(32px + env(safe-area-inset-bottom))",
          minHeight: "calc(100vh - 82px)",
        }}
      >
        <Container maxWidth="md">
          <Box sx={{ textAlign: "center" }}>
            <Typography variant="overline" color="secondary.dark">
              Chequered flag
            </Typography>
            <Typography component="h1" variant="h3">
              Final standings
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              Room {code} · {TOTAL_LAPS} laps of the Kaapi Circuit
            </Typography>
          </Box>

          {socket.error ? (
            <Alert severity="error" sx={{ mt: 3 }} onClose={socket.clearError}>
              {describeGameErrorCode(socket.error.code)}
            </Alert>
          ) : null}

          {!result && fallbackQuery.isPending ? (
            <Box sx={{ mt: 4 }}>
              <GameLoadingState label="Collecting the final times…" tiles={3} />
            </Box>
          ) : null}

          {!result && fallbackQuery.isError ? (
            <Box sx={{ mt: 4 }}>
              <GameErrorState
                title="No standings for this room"
                message={describeGameError(
                  fallbackQuery.error,
                  "The race result has expired or the room has closed.",
                )}
                actionLabel="Back to Kaapi Karts"
                onAction={() => navigate(KAAPI_KARTS_PATH)}
                secondary={
                  <Button variant="outlined" onClick={() => void fallbackQuery.refetch()}>
                    Try again
                  </Button>
                }
              />
            </Box>
          ) : null}

          {result ? (
            <>
              <Stack
                direction="row"
                spacing={1.5}
                sx={{ mt: { xs: 4, md: 5 }, alignItems: "flex-end", justifyContent: "center" }}
              >
                {orderedPodium.map((standing, index) =>
                  standing ? (
                    <PodiumStep
                      key={standing.carNumber}
                      standing={standing}
                      height={PODIUM_HEIGHTS[index] ?? 108}
                      delayMs={reducedMotion ? 0 : index * 180}
                      reducedMotion={reducedMotion}
                    />
                  ) : null,
                )}
              </Stack>

              {payer ? (
                <Fade in={revealed} timeout={reducedMotion ? 0 : 420}>
                  <Paper
                    variant="outlined"
                    aria-live="polite"
                    sx={{
                      mt: { xs: 4, md: 5 },
                      p: { xs: 3, md: 4 },
                      textAlign: "center",
                      borderColor: "secondary.main",
                      bgcolor: "rgba(184, 95, 22, 0.06)",
                      "@keyframes kaapiSettle": {
                        "0%": { transform: "scale(1.18) translateY(-10px)", opacity: 0 },
                        "62%": { transform: "scale(0.985) translateY(3px)", opacity: 1 },
                        "100%": { transform: "scale(1) translateY(0)", opacity: 1 },
                      },
                      animation:
                        reducedMotion || !revealed
                          ? "none"
                          : "kaapiSettle 620ms cubic-bezier(0.2, 0.85, 0.25, 1) both",
                    }}
                  >
                    <LocalCafeOutlinedIcon color="secondary" sx={{ fontSize: 46 }} />
                    <Typography component="h2" variant="h4" sx={{ mt: 1, fontWeight: 700 }}>
                      Car {formatCarNumber(payer.carNumber)} buys the coffee
                    </Typography>
                    <Typography color="text.secondary" sx={{ mt: 1.25 }}>
                      Just for fun — settle the bill however you like. Nothing here is charged to an
                      order.
                    </Typography>
                  </Paper>
                </Fade>
              ) : null}

              <Box sx={{ mt: { xs: 4, md: 5 } }}>
                <Typography component="h2" variant="h5" sx={{ fontWeight: 850, mb: 1.5 }}>
                  Every kart
                </Typography>
                <Stack
                  component="ol"
                  aria-label="Full standings"
                  spacing={1}
                  sx={{ listStyle: "none", p: 0, m: 0 }}
                >
                  {standings.map((standing) => {
                    const colourHex = findCarColour(standing.colour)?.hex ?? FALLBACK_COLOUR;
                    const isPayer = standing.carNumber === result.payerCarNumber;

                    return (
                      <Paper
                        key={standing.carNumber}
                        component="li"
                        variant="outlined"
                        sx={{
                          listStyle: "none",
                          p: 1.5,
                          display: "flex",
                          alignItems: "center",
                          gap: 1.5,
                          borderColor: isPayer ? "secondary.main" : "divider",
                        }}
                      >
                        <Typography
                          component="span"
                          sx={{
                            width: 34,
                            fontWeight: 900,
                            color: "text.secondary",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          P{standing.rank}
                        </Typography>
                        <Box
                          aria-hidden
                          sx={{
                            width: 40,
                            height: 40,
                            borderRadius: "50%",
                            bgcolor: colourHex,
                            color: "#fffdf8",
                            display: "grid",
                            placeItems: "center",
                            fontWeight: 900,
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {formatCarNumber(standing.carNumber)}
                        </Box>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography sx={{ fontWeight: 800 }}>
                            Car {formatCarNumber(standing.carNumber)}
                            {standing.emoji ? (
                              <Box component="span" aria-hidden sx={{ ml: 0.75 }}>
                                {standing.emoji}
                              </Box>
                            ) : null}
                          </Typography>
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{ fontVariantNumeric: "tabular-nums" }}
                          >
                            {formatFinish(standing)}
                          </Typography>
                        </Box>
                        <Stack
                          direction="row"
                          spacing={0.75}
                          sx={{
                            ml: "auto",
                            flexWrap: "wrap",
                            gap: 0.75,
                            justifyContent: "flex-end",
                          }}
                        >
                          {standing.rank === 1 ? (
                            <Chip
                              size="small"
                              icon={<EmojiEventsOutlinedIcon fontSize="small" />}
                              label="Winner"
                              color="success"
                            />
                          ) : null}
                          {standing.disconnected ? (
                            <Chip size="small" variant="outlined" label="Disconnected" />
                          ) : null}
                          {standing.suspect ? (
                            <Chip size="small" variant="outlined" label="Time adjusted" />
                          ) : null}
                          {isPayer ? (
                            <Chip size="small" color="secondary" label="Buys coffee" />
                          ) : null}
                        </Stack>
                      </Paper>
                    );
                  })}
                </Stack>
              </Box>

              <Divider sx={{ my: { xs: 4, md: 5 } }} />

              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1.5}
                sx={{ justifyContent: "center" }}
              >
                {isHost ? (
                  <Button
                    variant="contained"
                    size="large"
                    startIcon={<ReplayOutlinedIcon />}
                    onClick={socket.requestRematch}
                  >
                    Rematch
                  </Button>
                ) : (
                  <Alert severity="info" sx={{ flexGrow: 1 }}>
                    Waiting for the host to start a rematch…
                  </Alert>
                )}
                <Button
                  variant="outlined"
                  size="large"
                  onClick={() => {
                    socket.leaveRoom();
                    navigate(KAAPI_KARTS_PATH);
                  }}
                >
                  Leave
                </Button>
              </Stack>
            </>
          ) : null}
        </Container>
      </Box>
    </>
  );
};
