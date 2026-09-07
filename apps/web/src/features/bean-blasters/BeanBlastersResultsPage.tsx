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
import { describeArenaError, describeArenaErrorCode, getArenaResult } from "./arena-api.js";
import {
  findBadgeColour,
  formatBadgeNumber,
  ROOM_CODE_PATTERN,
  ROUND_MS,
  type ArenaStanding,
} from "./arena-contract.js";
import { BEAN_BLASTERS_PATH, beanBlastersLobbyPath } from "./arena-paths.js";
import { ArenaErrorState, ArenaLoadingState } from "./ArenaStates.js";
import { readPlayerId } from "./arena-player-identity.js";
import { useArenaSocket } from "./use-arena-socket.js";
import { useReducedMotion } from "./use-arena-reduced-motion.js";

const REVEAL_DELAY_MS = 1_400;
const FALLBACK_COLOUR = "#715b50";
const PODIUM_HEIGHTS = [132, 168, 108] as const;
const ROUND_SECONDS = Math.round(ROUND_MS / 1_000);

const formatScore = (standing: ArenaStanding): string =>
  `${standing.hits} landed · ${standing.taken} taken`;

interface PodiumStepProps {
  standing: ArenaStanding;
  height: number;
  delayMs: number;
  reducedMotion: boolean;
}

const PodiumStep = ({ standing, height, delayMs, reducedMotion }: PodiumStepProps) => {
  const colourHex = findBadgeColour(standing.colour)?.hex ?? FALLBACK_COLOUR;

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
          {formatBadgeNumber(standing.badgeNumber)}
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
            {standing.hits} splash{standing.hits === 1 ? "" : "es"}
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

  const socket = useArenaSocket({ code: isValidCode ? code : null, playerId });
  const fallbackQuery = useQuery({
    queryKey: ["arena", "result", code],
    queryFn: ({ signal }) => getArenaResult(code, signal),
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
  const payer =
    standings.find((standing) => standing.badgeNumber === result?.payerBadgeNumber) ?? null;

  useEffect(() => {
    if (!result || reducedMotion) {
      return;
    }

    const timer = window.setTimeout(() => setRevealed(true), REVEAL_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [reducedMotion, result]);

  useEffect(() => {
    if (socket.status === "LOBBY") {
      navigate(beanBlastersLobbyPath(code), { replace: true });
    }
  }, [code, navigate, socket.status]);

  if (!isValidCode) {
    return (
      <>
        <SiteHeader />
        <Box component="main" sx={{ py: { xs: 6, md: 9 } }}>
          <Container maxWidth="md">
            <ArenaErrorState
              title="That room code looks wrong"
              message="Room codes are four characters long and never use O, 0, I or 1."
              actionLabel="Back to Bean Blasters"
              onAction={() => navigate(BEAN_BLASTERS_PATH)}
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
              Whistle
            </Typography>
            <Typography component="h1" variant="h3">
              Final standings
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              Room {code} · {ROUND_SECONDS} seconds on the roastery floor
            </Typography>
          </Box>

          {socket.error ? (
            <Alert severity="error" sx={{ mt: 3 }} onClose={socket.clearError}>
              {describeArenaErrorCode(socket.error.code)}
            </Alert>
          ) : null}

          {!result && fallbackQuery.isPending ? (
            <Box sx={{ mt: 4 }}>
              <ArenaLoadingState label="Counting the splashes…" tiles={3} />
            </Box>
          ) : null}

          {!result && fallbackQuery.isError ? (
            <Box sx={{ mt: 4 }}>
              <ArenaErrorState
                title="No standings for this room"
                message={describeArenaError(
                  fallbackQuery.error,
                  "The round result has expired or the room has closed.",
                )}
                actionLabel="Back to Bean Blasters"
                onAction={() => navigate(BEAN_BLASTERS_PATH)}
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
                      key={standing.badgeNumber}
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
                      "@keyframes beanSettle": {
                        "0%": { transform: "scale(1.18) translateY(-10px)", opacity: 0 },
                        "62%": { transform: "scale(0.985) translateY(3px)", opacity: 1 },
                        "100%": { transform: "scale(1) translateY(0)", opacity: 1 },
                      },
                      animation:
                        reducedMotion || !revealed
                          ? "none"
                          : "beanSettle 620ms cubic-bezier(0.2, 0.85, 0.25, 1) both",
                    }}
                  >
                    <LocalCafeOutlinedIcon color="secondary" sx={{ fontSize: 46 }} />
                    <Typography component="h2" variant="h4" sx={{ mt: 1, fontWeight: 700 }}>
                      Badge {formatBadgeNumber(payer.badgeNumber)} buys the coffee
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
                  Every badge
                </Typography>
                <Stack
                  component="ol"
                  aria-label="Full standings"
                  spacing={1}
                  sx={{ listStyle: "none", p: 0, m: 0 }}
                >
                  {standings.map((standing) => {
                    const colourHex = findBadgeColour(standing.colour)?.hex ?? FALLBACK_COLOUR;
                    const isPayer = standing.badgeNumber === result.payerBadgeNumber;

                    return (
                      <Paper
                        key={standing.badgeNumber}
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
                          {formatBadgeNumber(standing.badgeNumber)}
                        </Box>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography sx={{ fontWeight: 800 }}>
                            Badge {formatBadgeNumber(standing.badgeNumber)}
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
                            {formatScore(standing)}
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
                            <Chip size="small" variant="outlined" label="Movement adjusted" />
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
                    navigate(BEAN_BLASTERS_PATH);
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
