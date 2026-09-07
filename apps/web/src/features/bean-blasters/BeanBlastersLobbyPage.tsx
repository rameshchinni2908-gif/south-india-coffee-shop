import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import HelpOutlineOutlinedIcon from "@mui/icons-material/HelpOutlineOutlined";
import RocketLaunchOutlinedIcon from "@mui/icons-material/RocketLaunchOutlined";
import SportsMmaOutlinedIcon from "@mui/icons-material/SportsMmaOutlined";
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
import { describeArenaError, describeArenaErrorCode, joinRoom } from "./arena-api.js";
import {
  BADGE_COLOURS,
  BADGE_EMOJIS,
  formatBadgeNumber,
  MAX_BADGE_NUMBER,
  MAX_PLAYERS,
  MIN_BADGE_NUMBER,
  MIN_PLAYERS,
  ROOM_CODE_PATTERN,
  ROUND_MS,
} from "./arena-contract.js";
import {
  BEAN_BLASTERS_PATH,
  beanBlastersBattlePath,
  beanBlastersInviteUrl,
  beanBlastersResultsPath,
} from "./arena-paths.js";
import { ArenaEmptyState, ArenaErrorState, ArenaLoadingState } from "./ArenaStates.js";
import { BadgeTile } from "./BadgeTile.js";
import { HowToPlayDialog } from "./BeanBlastersHowToPlayDialog.js";
import { readPlayerId, storePlayerId } from "./arena-player-identity.js";
import { RoomCodeShare } from "./BeanBlastersRoomCodeShare.js";
import { useArenaSocket } from "./use-arena-socket.js";
import { useReducedMotion } from "./use-arena-reduced-motion.js";

const ALL_BADGE_NUMBERS: readonly number[] = Array.from(
  { length: MAX_BADGE_NUMBER - MIN_BADGE_NUMBER + 1 },
  (_, index) => MIN_BADGE_NUMBER + index,
);

const ROUND_SECONDS = Math.round(ROUND_MS / 1_000);

export const LobbyPage = () => {
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();
  const { code: codeParam } = useParams<{ code?: string }>();
  const code = (codeParam ?? "").toUpperCase();
  const isValidCode = ROOM_CODE_PATTERN.test(code);
  const [showHowTo, setShowHowTo] = useState(false);
  const [showNumberPicker, setShowNumberPicker] = useState(false);

  const membershipQuery = useQuery({
    queryKey: ["arena", "membership", code],
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

  const socket = useArenaSocket({ code: isValidCode ? code : null, playerId });
  const room = socket.state ?? membershipQuery.data?.room ?? null;
  const status = room?.status ?? null;
  const players = useMemo(
    () => [...(room?.players ?? [])].sort((a, b) => a.badgeNumber - b.badgeNumber),
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
        players
          .filter((player) => player.playerId !== playerId)
          .map((player) => player.badgeNumber),
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
    // snapshot must never drop somebody into a round they are not connected to.
    if (socket.connection !== "connected") {
      return;
    }

    if (status === "COUNTDOWN" || status === "BATTLE") {
      navigate(beanBlastersBattlePath(code), { replace: true });
    } else if (status === "RESULTS") {
      navigate(beanBlastersResultsPath(code), { replace: true });
    }
  }, [code, navigate, socket.connection, status]);

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

  const membershipError = membershipQuery.isError
    ? describeArenaError(membershipQuery.error, "We could not join that arena room.")
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
                Roastery floor
              </Typography>
              <Typography component="h1" variant="h3">
                Waiting to blast
              </Typography>
              <Typography color="text.secondary" sx={{ mt: 1 }}>
                A {ROUND_SECONDS}-second bean fight. Between {MIN_PLAYERS} and {MAX_PLAYERS}{" "}
                baristas.
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
                Reconnecting…
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
                {describeArenaErrorCode(socket.error.code)}
              </Alert>
            ) : null}
          </Box>

          {membershipQuery.isPending ? <ArenaLoadingState label="Joining the arena…" /> : null}

          {membershipError ? (
            <ArenaErrorState
              title="We could not join that room"
              message={membershipError}
              actionLabel="Back to Bean Blasters"
              onAction={() => navigate(BEAN_BLASTERS_PATH)}
              secondary={
                <Button variant="outlined" onClick={() => void membershipQuery.refetch()}>
                  Try again
                </Button>
              }
            />
          ) : null}

          {roomClosed ? (
            <ArenaErrorState
              title="This room has closed"
              message="Rooms clear themselves out once everyone has left. Open a fresh one whenever you like."
              actionLabel="Back to Bean Blasters"
              onAction={() => navigate(BEAN_BLASTERS_PATH)}
            />
          ) : null}

          {room && !roomClosed && !membershipError ? (
            <Stack spacing={{ xs: 3, md: 4 }} sx={{ mt: 3 }}>
              {/* Kept at the top: the host should never have to scroll past the
                  floor and the pickers to find the one button that starts it. */}
              {isHost ? (
                <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 3 } }}>
                  <Typography component="h2" variant="h5" sx={{ fontWeight: 850 }}>
                    Host controls
                  </Typography>
                  <Typography color="text.secondary" sx={{ mt: 0.75 }}>
                    {canStart
                      ? "Everyone is ready. Start whenever you like."
                      : `Start unlocks once all ${MIN_PLAYERS}+ baristas are ready — or force start anyway.`}
                  </Typography>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mt: 2.5 }}>
                    <Button
                      variant="contained"
                      size="large"
                      startIcon={<SportsMmaOutlinedIcon />}
                      disabled={!inLobby || !canStart}
                      onClick={() => socket.startRound(false)}
                    >
                      Start round
                    </Button>
                    <Button
                      variant="outlined"
                      size="large"
                      startIcon={<RocketLaunchOutlinedIcon />}
                      disabled={!inLobby || players.length < MIN_PLAYERS}
                      onClick={() => socket.startRound(true)}
                    >
                      Force start
                    </Button>
                  </Stack>
                </Paper>
              ) : (
                <Alert severity="info" icon={<SportsMmaOutlinedIcon />}>
                  Waiting for the host to start the round.
                </Alert>
              )}

              <RoomCodeShare
                code={room.code}
                shareUrl={beanBlastersInviteUrl(room.code)}
                reducedMotion={reducedMotion}
              />

              <Box>
                <Stack
                  direction="row"
                  spacing={2}
                  sx={{ alignItems: "baseline", justifyContent: "space-between", mb: 1.5 }}
                >
                  <Typography component="h2" variant="h5" sx={{ fontWeight: 850 }}>
                    On the floor
                  </Typography>
                  <Typography variant="body2" color="text.secondary" aria-live="polite">
                    {readyCount} of {players.length} ready
                  </Typography>
                </Stack>

                {players.length === 0 ? (
                  <ArenaEmptyState
                    title="Waiting for players"
                    message="Share the code above and the badges will appear here as people join."
                  />
                ) : (
                  <Box
                    component="ul"
                    aria-label="Players in this arena room"
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
                      <BadgeTile
                        key={player.playerId}
                        player={player}
                        isYou={player.playerId === playerId}
                        reducedMotion={reducedMotion}
                      />
                    ))}
                  </Box>
                )}
              </Box>

              <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 3 } }}>
                <Typography component="h2" variant="h5" sx={{ fontWeight: 850 }}>
                  Your badge
                </Typography>
                <Typography color="text.secondary" sx={{ mt: 0.75 }}>
                  {inLobby
                    ? "Change your number, colour and emoji until the round starts."
                    : "Your badge is locked in while the round is running."}
                </Typography>

                <Stack spacing={2.5} sx={{ mt: 2.5 }}>
                  <Box>
                    <Typography component="h3" variant="subtitle2" sx={{ fontWeight: 800 }}>
                      Badge number
                    </Typography>
                    <Button
                      variant="outlined"
                      disabled={!inLobby}
                      onClick={() => setShowNumberPicker(true)}
                      sx={{ mt: 1, fontVariantNumeric: "tabular-nums", minWidth: 132 }}
                    >
                      {self ? `Badge ${formatBadgeNumber(self.badgeNumber)}` : "Pick a number"}
                    </Button>
                  </Box>

                  <Box>
                    <Typography
                      component="h3"
                      variant="subtitle2"
                      id="bean-colour-label"
                      sx={{ fontWeight: 800 }}
                    >
                      Colour
                    </Typography>
                    <Stack
                      direction="row"
                      role="group"
                      aria-labelledby="bean-colour-label"
                      sx={{ mt: 1, flexWrap: "wrap", gap: 1 }}
                    >
                      {BADGE_COLOURS.map((colour) => {
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
                            onClick={() => socket.setBadge({ colour: colour.id })}
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
                      id="bean-emoji-label"
                      sx={{ fontWeight: 800 }}
                    >
                      Emoji (optional)
                    </Typography>
                    <Stack
                      direction="row"
                      role="group"
                      aria-labelledby="bean-emoji-label"
                      sx={{ mt: 1, flexWrap: "wrap", gap: 1 }}
                    >
                      {BADGE_EMOJIS.map((emoji) => (
                        <Box
                          key={emoji}
                          component="button"
                          type="button"
                          disabled={!inLobby}
                          aria-pressed={self?.emoji === emoji}
                          aria-label={`Emoji ${emoji}`}
                          onClick={() => socket.setBadge({ emoji })}
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
                    label="Ready to blast"
                    slotProps={{ typography: { sx: { fontWeight: 800 } } }}
                  />
                </Stack>
              </Paper>

              <Box>
                <Button
                  color="inherit"
                  startIcon={<CloseOutlinedIcon />}
                  onClick={() => {
                    socket.leaveRoom();
                    navigate(BEAN_BLASTERS_PATH);
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
        aria-labelledby="bean-number-picker-title"
      >
        <DialogTitle id="bean-number-picker-title">Pick a free badge number</DialogTitle>
        <DialogContent dividers>
          <Box
            role="group"
            aria-label="Available badge numbers"
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(56px, 1fr))",
              gap: 1,
            }}
          >
            {ALL_BADGE_NUMBERS.map((badgeNumber) => {
              const isTaken = takenNumbers.has(badgeNumber);
              const isMine = self?.badgeNumber === badgeNumber;

              return (
                <Button
                  key={badgeNumber}
                  size="small"
                  variant={isMine ? "contained" : "outlined"}
                  disabled={isTaken || !inLobby}
                  aria-label={`Badge number ${formatBadgeNumber(badgeNumber)}${
                    isTaken ? " (taken)" : ""
                  }`}
                  onClick={() => {
                    socket.setBadge({ badgeNumber });
                    setShowNumberPicker(false);
                  }}
                  sx={{ minWidth: 0, px: 0, fontVariantNumeric: "tabular-nums" }}
                >
                  {formatBadgeNumber(badgeNumber)}
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
