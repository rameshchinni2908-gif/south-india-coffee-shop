import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import FlagOutlinedIcon from "@mui/icons-material/FlagOutlined";
import HelpOutlineOutlinedIcon from "@mui/icons-material/HelpOutlineOutlined";
import SportsScoreOutlinedIcon from "@mui/icons-material/SportsScoreOutlined";
import {
  Alert,
  Box,
  Button,
  Container,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  LinearProgress,
  Paper,
  Stack,
  Switch,
  Typography,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { SiteHeader } from "../../components/SiteHeader.js";
import { CarTile } from "./CarTile.js";
import { describeGameError, describeGameErrorCode, joinRoom } from "./game-api.js";
import {
  CAR_COLOURS,
  CAR_EMOJIS,
  formatCarNumber,
  MAX_CAR_NUMBER,
  MAX_PLAYERS,
  MIN_CAR_NUMBER,
  MIN_PLAYERS,
  ROOM_CODE_PATTERN,
  TOTAL_LAPS,
} from "./game-contract.js";
import {
  KAAPI_KARTS_PATH,
  kaapiKartsInviteUrl,
  kaapiKartsRacePath,
  kaapiKartsResultsPath,
} from "./game-paths.js";
import { GameEmptyState, GameErrorState, GameLoadingState } from "./GameStates.js";
import { HowToPlayDialog } from "./HowToPlayDialog.js";
import { readPlayerId, storePlayerId } from "./player-identity.js";
import { RoomCodeShare } from "./RoomCodeShare.js";
import { useGameSocket } from "./use-game-socket.js";
import { useReducedMotion } from "./use-reduced-motion.js";

const ALL_CAR_NUMBERS: readonly number[] = Array.from(
  { length: MAX_CAR_NUMBER - MIN_CAR_NUMBER + 1 },
  (_, index) => MIN_CAR_NUMBER + index,
);

export const LobbyPage = () => {
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();
  const { code: codeParam } = useParams<{ code?: string }>();
  const code = (codeParam ?? "").toUpperCase();
  const isValidCode = ROOM_CODE_PATTERN.test(code);
  const [showHowTo, setShowHowTo] = useState(false);
  const [showNumberPicker, setShowNumberPicker] = useState(false);

  const membershipQuery = useQuery({
    queryKey: ["game", "membership", code],
    queryFn: ({ signal }) => joinRoom(code, readPlayerId(), signal),
    enabled: isValidCode,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  });

  const playerId = membershipQuery.data?.playerId ?? null;

  useEffect(() => {
    if (playerId) {
      storePlayerId(playerId);
    }
  }, [playerId]);

  const socket = useGameSocket({ code: isValidCode ? code : null, playerId });
  const room = socket.state ?? membershipQuery.data?.room ?? null;
  const status = room?.status ?? null;
  const players = useMemo(
    () => [...(room?.players ?? [])].sort((a, b) => a.carNumber - b.carNumber),
    [room],
  );
  const self = players.find((player) => player.playerId === playerId) ?? null;
  const isHost = Boolean(self?.isHost);
  const readyCount = players.filter((player) => player.isReady).length;
  const canStart = players.length >= MIN_PLAYERS && readyCount === players.length;
  const inLobby = status === "LOBBY";

  const takenNumbers = useMemo(
    () =>
      new Set(
        players.filter((player) => player.playerId !== playerId).map((player) => player.carNumber),
      ),
    [players, playerId],
  );
  const takenColours = useMemo(
    () =>
      new Set(
        players.filter((player) => player.playerId !== playerId).map((player) => player.colour),
      ),
    [players, playerId],
  );

  useEffect(() => {
    // Only the live socket may pull a player out of the lobby: a stale REST
    // snapshot must never drop somebody onto a race they are not connected to.
    if (socket.connection !== "connected") {
      return;
    }

    if (status === "COUNTDOWN" || status === "RACING") {
      navigate(kaapiKartsRacePath(code), { replace: true });
    } else if (status === "RESULTS") {
      navigate(kaapiKartsResultsPath(code), { replace: true });
    }
  }, [code, navigate, socket.connection, status]);

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

  const membershipError = membershipQuery.isError
    ? describeGameError(membershipQuery.error, "We could not join that race room.")
    : null;
  const roomClosed = status === "CLOSED";

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
        <Container maxWidth="lg">
          <Stack
            direction="row"
            spacing={2}
            sx={{ alignItems: "flex-start", justifyContent: "space-between" }}
          >
            <Box>
              <Typography variant="overline" color="secondary.dark">
                Pit lane
              </Typography>
              <Typography component="h1" variant="h3">
                Waiting to race
              </Typography>
              <Typography color="text.secondary" sx={{ mt: 1 }}>
                {TOTAL_LAPS} laps of the Kaapi Circuit. Between {MIN_PLAYERS} and {MAX_PLAYERS}{" "}
                karts.
              </Typography>
            </Box>
            <IconButton
              aria-label="How to play"
              color="primary"
              onClick={() => setShowHowTo(true)}
              sx={{ flexShrink: 0 }}
            >
              <HelpOutlineOutlinedIcon />
            </IconButton>
          </Stack>

          <Box aria-live="polite" sx={{ mt: 2.5 }}>
            {socket.connection === "reconnecting" ? (
              <Alert severity="info" sx={{ mb: 2 }}>
                Reconnecting to the race room…
                <LinearProgress sx={{ mt: 1, borderRadius: 999 }} />
              </Alert>
            ) : null}
            {socket.connection === "offline" ? (
              <Alert
                severity="warning"
                sx={{ mb: 2 }}
                action={
                  <Button color="inherit" size="small" onClick={socket.reconnect}>
                    Retry
                  </Button>
                }
              >
                You are offline. The lobby will not update until the connection returns.
              </Alert>
            ) : null}
            {socket.error ? (
              <Alert
                severity="error"
                sx={{ mb: 2 }}
                onClose={socket.clearError}
                closeText="Dismiss error"
              >
                {describeGameErrorCode(socket.error.code)}
              </Alert>
            ) : null}
          </Box>

          {membershipQuery.isPending ? <GameLoadingState label="Joining the race room…" /> : null}

          {membershipError ? (
            <GameErrorState
              title="We could not join that room"
              message={membershipError}
              actionLabel="Back to Kaapi Karts"
              onAction={() => navigate(KAAPI_KARTS_PATH)}
              secondary={
                <Button variant="outlined" onClick={() => void membershipQuery.refetch()}>
                  Try again
                </Button>
              }
            />
          ) : null}

          {roomClosed ? (
            <GameErrorState
              title="This race room has closed"
              message="Rooms clear themselves out once everyone has left. Start a fresh one whenever you like."
              actionLabel="Back to Kaapi Karts"
              onAction={() => navigate(KAAPI_KARTS_PATH)}
            />
          ) : null}

          {room && !roomClosed && !membershipError ? (
            <Stack spacing={{ xs: 3, md: 4 }} sx={{ mt: 3 }}>
              <RoomCodeShare
                code={room.code}
                shareUrl={kaapiKartsInviteUrl(room.code)}
                reducedMotion={reducedMotion}
              />

              <Box>
                <Stack
                  direction="row"
                  spacing={2}
                  sx={{ alignItems: "baseline", justifyContent: "space-between", mb: 1.5 }}
                >
                  <Typography component="h2" variant="h5" sx={{ fontWeight: 850 }}>
                    On the grid
                  </Typography>
                  <Typography variant="body2" color="text.secondary" aria-live="polite">
                    {readyCount} of {players.length} ready
                  </Typography>
                </Stack>

                {players.length === 0 ? (
                  <GameEmptyState
                    title="Waiting for players"
                    message="Share the code above and the karts will appear here as people join."
                  />
                ) : (
                  <Box
                    component="ul"
                    aria-label="Players in this race room"
                    sx={{
                      listStyle: "none",
                      p: 0,
                      m: 0,
                      display: "grid",
                      gridTemplateColumns: {
                        xs: "1fr",
                        sm: "repeat(2, minmax(0, 1fr))",
                        lg: "repeat(3, minmax(0, 1fr))",
                      },
                      gap: 2,
                    }}
                  >
                    {players.map((player) => (
                      <CarTile
                        key={player.playerId}
                        player={player}
                        isYou={player.playerId === playerId}
                        reducedMotion={reducedMotion}
                      />
                    ))}
                  </Box>
                )}

                {players.length === 1 ? (
                  <Alert severity="info" sx={{ mt: 2 }}>
                    You need at least {MIN_PLAYERS} karts before the race can start.
                  </Alert>
                ) : null}
              </Box>

              <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 3 } }}>
                <Typography component="h2" variant="h5" sx={{ fontWeight: 850 }}>
                  Your kart
                </Typography>
                <Typography color="text.secondary" sx={{ mt: 0.75 }}>
                  {inLobby
                    ? "Change your number, colour and badge until the race starts."
                    : "Your kart is locked in while the race is running."}
                </Typography>

                <Stack spacing={2.5} sx={{ mt: 2.5 }}>
                  <Box>
                    <Typography component="h3" variant="subtitle2" sx={{ fontWeight: 800 }}>
                      Car number
                    </Typography>
                    <Button
                      variant="outlined"
                      disabled={!inLobby}
                      onClick={() => setShowNumberPicker(true)}
                      sx={{ mt: 1, fontVariantNumeric: "tabular-nums", minWidth: 132 }}
                    >
                      {self ? `Car ${formatCarNumber(self.carNumber)}` : "Pick a number"}
                    </Button>
                  </Box>

                  <Box>
                    <Typography
                      component="h3"
                      variant="subtitle2"
                      id="kaapi-colour-label"
                      sx={{ fontWeight: 800 }}
                    >
                      Colour
                    </Typography>
                    <Stack
                      direction="row"
                      role="group"
                      aria-labelledby="kaapi-colour-label"
                      sx={{ mt: 1, flexWrap: "wrap", gap: 1 }}
                    >
                      {CAR_COLOURS.map((colour) => {
                        const isTaken = takenColours.has(colour.id);
                        const isMine = self?.colour === colour.id;

                        return (
                          <Box
                            key={colour.id}
                            component="button"
                            type="button"
                            disabled={!inLobby || isTaken}
                            aria-pressed={isMine}
                            aria-label={`${colour.label}${isTaken ? " (taken)" : ""}`}
                            onClick={() => socket.setCar({ colour: colour.id })}
                            sx={{
                              width: 48,
                              height: 48,
                              borderRadius: "50%",
                              cursor: "pointer",
                              bgcolor: colour.hex,
                              opacity: isTaken ? 0.32 : 1,
                              border: "3px solid",
                              borderColor: isMine ? "text.primary" : "transparent",
                              outlineOffset: 2,
                              "&:disabled": { cursor: "not-allowed" },
                            }}
                          />
                        );
                      })}
                    </Stack>
                  </Box>

                  <Box>
                    <Typography
                      component="h3"
                      variant="subtitle2"
                      id="kaapi-emoji-label"
                      sx={{ fontWeight: 800 }}
                    >
                      Badge (optional)
                    </Typography>
                    <Stack
                      direction="row"
                      role="group"
                      aria-labelledby="kaapi-emoji-label"
                      sx={{ mt: 1, flexWrap: "wrap", gap: 1 }}
                    >
                      {CAR_EMOJIS.map((emoji) => (
                        <Box
                          key={emoji}
                          component="button"
                          type="button"
                          disabled={!inLobby}
                          aria-pressed={self?.emoji === emoji}
                          aria-label={`Badge ${emoji}`}
                          onClick={() => socket.setCar({ emoji })}
                          sx={{
                            width: 48,
                            height: 48,
                            fontSize: 22,
                            lineHeight: 1,
                            borderRadius: 2,
                            cursor: "pointer",
                            bgcolor:
                              self?.emoji === emoji ? "rgba(111, 50, 25, 0.12)" : "transparent",
                            border: "1px solid",
                            borderColor: self?.emoji === emoji ? "primary.main" : "divider",
                          }}
                        >
                          <Box component="span" aria-hidden>
                            {emoji}
                          </Box>
                        </Box>
                      ))}
                    </Stack>
                  </Box>

                  <Divider />

                  <FormControlLabel
                    control={
                      <Switch
                        checked={Boolean(self?.isReady)}
                        disabled={!inLobby}
                        onChange={(event) => socket.setReady(event.target.checked)}
                      />
                    }
                    label="Ready to race"
                    slotProps={{ typography: { sx: { fontWeight: 800 } } }}
                  />
                </Stack>
              </Paper>

              {isHost ? (
                <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 3 } }}>
                  <Typography component="h2" variant="h5" sx={{ fontWeight: 850 }}>
                    Host controls
                  </Typography>
                  <Typography color="text.secondary" sx={{ mt: 0.75 }}>
                    {canStart
                      ? "Everyone is ready. Lights out whenever you are."
                      : `Start unlocks once all ${MIN_PLAYERS}+ karts are ready — or force start anyway.`}
                  </Typography>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mt: 2.5 }}>
                    <Button
                      variant="contained"
                      size="large"
                      startIcon={<SportsScoreOutlinedIcon />}
                      disabled={!inLobby || !canStart}
                      onClick={() => socket.startRace(false)}
                    >
                      Start race
                    </Button>
                    <Button
                      variant="outlined"
                      size="large"
                      startIcon={<FlagOutlinedIcon />}
                      disabled={!inLobby || players.length < MIN_PLAYERS}
                      onClick={() => socket.startRace(true)}
                    >
                      Force start
                    </Button>
                  </Stack>
                </Paper>
              ) : (
                <Alert severity="info" icon={<SportsScoreOutlinedIcon />}>
                  Waiting for the host to start the race.
                </Alert>
              )}

              <Box>
                <Button
                  color="inherit"
                  startIcon={<CloseOutlinedIcon />}
                  onClick={() => {
                    socket.leaveRoom();
                    navigate(KAAPI_KARTS_PATH);
                  }}
                >
                  Leave room
                </Button>
              </Box>
            </Stack>
          ) : null}
        </Container>
      </Box>

      <Dialog
        open={showNumberPicker}
        onClose={() => setShowNumberPicker(false)}
        fullWidth
        maxWidth="xs"
        aria-labelledby="kaapi-number-picker-title"
      >
        <DialogTitle id="kaapi-number-picker-title">Pick a free car number</DialogTitle>
        <DialogContent dividers>
          <Box
            role="group"
            aria-label="Available car numbers"
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(56px, 1fr))",
              gap: 1,
            }}
          >
            {ALL_CAR_NUMBERS.map((carNumber) => {
              const isTaken = takenNumbers.has(carNumber);
              const isMine = self?.carNumber === carNumber;

              return (
                <Button
                  key={carNumber}
                  size="small"
                  variant={isMine ? "contained" : "outlined"}
                  disabled={isTaken || !inLobby}
                  aria-label={`Car number ${formatCarNumber(carNumber)}${
                    isTaken ? " (taken)" : ""
                  }`}
                  onClick={() => {
                    socket.setCar({ carNumber });
                    setShowNumberPicker(false);
                  }}
                  sx={{ minWidth: 0, px: 0, fontVariantNumeric: "tabular-nums" }}
                >
                  {formatCarNumber(carNumber)}
                </Button>
              );
            })}
          </Box>
        </DialogContent>
      </Dialog>

      <HowToPlayDialog open={showHowTo} onClose={() => setShowHowTo(false)} />
    </>
  );
};
