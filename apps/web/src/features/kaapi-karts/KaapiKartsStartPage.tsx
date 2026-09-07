import AddCircleOutlineOutlinedIcon from "@mui/icons-material/AddCircleOutlineOutlined";
import HelpOutlineOutlinedIcon from "@mui/icons-material/HelpOutlineOutlined";
import LoginOutlinedIcon from "@mui/icons-material/LoginOutlined";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Divider,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { SiteHeader } from "../../components/SiteHeader.js";
import { createRoom, describeGameError, getRoom, joinRoom } from "./game-api.js";
import {
  GAME_DISPLAY_NAME,
  GAME_TAGLINE,
  MAX_PLAYERS,
  MIN_PLAYERS,
  ROOM_CODE_LENGTH,
  ROOM_CODE_PATTERN,
} from "./game-contract.js";
import { kaapiKartsLobbyPath } from "./game-paths.js";
import { hasSeenHowToPlay } from "./game-preferences.js";
import { HowToPlayDialog } from "./HowToPlayDialog.js";
import { readPlayerId, storePlayerId } from "./player-identity.js";

/**
 * Codes are drawn from ROOM_CODE_ALPHABET, which deliberately omits O, I, 0 and
 * 1 so a code read aloud is unambiguous. There is therefore nothing to fold
 * those glyphs onto — they are simply not code characters, so drop them along
 * with any other stray input rather than substituting a look-alike.
 */
const normaliseCode = (value: string): string =>
  value
    .toUpperCase()
    .replace(/[^ABCDEFGHJKLMNPQRSTUVWXYZ23456789]/g, "")
    .slice(0, ROOM_CODE_LENGTH);

export const KaapiKartsStartPage = () => {
  const navigate = useNavigate();
  const { code: codeFromLink } = useParams<{ code?: string }>();
  const [code, setCode] = useState(() => normaliseCode(codeFromLink ?? ""));
  const [showHowTo, setShowHowTo] = useState(() => !hasSeenHowToPlay());
  const isCodeComplete = ROOM_CODE_PATTERN.test(code);

  // Adjusted during render rather than in an effect so an invite link never
  // paints the empty field first.
  const [lastLinkCode, setLastLinkCode] = useState(codeFromLink);

  if (lastLinkCode !== codeFromLink) {
    setLastLinkCode(codeFromLink);

    if (codeFromLink) {
      setCode(normaliseCode(codeFromLink));
    }
  }

  const previewQuery = useQuery({
    queryKey: ["game", "room-preview", code],
    queryFn: ({ signal }) => getRoom(code, signal),
    enabled: isCodeComplete,
    retry: false,
    staleTime: 5_000,
  });

  const createMutation = useMutation({
    mutationFn: () => createRoom(),
    onSuccess: (room) => {
      storePlayerId(room.playerId);
      navigate(kaapiKartsLobbyPath(room.code));
    },
  });

  const joinMutation = useMutation({
    mutationFn: (roomCode: string) => joinRoom(roomCode, readPlayerId()),
    onSuccess: (joined, roomCode) => {
      storePlayerId(joined.playerId);
      navigate(kaapiKartsLobbyPath(joined.room?.code ?? roomCode));
    },
  });

  const createError = createMutation.isError
    ? describeGameError(createMutation.error, "The race room could not be created. Try again.")
    : null;
  const joinError = joinMutation.isError
    ? describeGameError(joinMutation.error, "We could not join that race room. Try again.")
    : null;
  const previewError =
    previewQuery.isError && !joinError
      ? describeGameError(previewQuery.error, "We could not read that room.")
      : null;
  const previewRoom = previewQuery.data ?? null;

  const submitJoin = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isCodeComplete || joinMutation.isPending) {
      return;
    }

    joinMutation.mutate(code);
  };

  return (
    <>
      <SiteHeader />
      <Box component="main" sx={{ py: { xs: 5, md: 8 }, minHeight: "calc(100vh - 82px)" }}>
        <Container maxWidth="md">
          <Stack
            direction="row"
            spacing={2}
            sx={{ alignItems: "flex-start", justifyContent: "space-between" }}
          >
            <Box sx={{ maxWidth: 560 }}>
              <Typography variant="overline" color="secondary.dark">
                Table game
              </Typography>
              <Typography component="h1" variant="h3">
                {GAME_DISPLAY_NAME}
              </Typography>
              <Typography color="text.secondary" sx={{ mt: 1.25, fontSize: 17 }}>
                {GAME_TAGLINE} Start a room and share the code, or join the one already on someone
                else’s phone.
              </Typography>
            </Box>
            <Button
              startIcon={<HelpOutlineOutlinedIcon />}
              onClick={() => setShowHowTo(true)}
              sx={{ flexShrink: 0 }}
            >
              How to play
            </Button>
          </Stack>

          <Box
            sx={{
              mt: { xs: 4, md: 5 },
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
              gap: { xs: 2.5, md: 3 },
              alignItems: "stretch",
            }}
          >
            <Paper variant="outlined" sx={{ p: { xs: 3, md: 4 }, display: "flex" }}>
              <Stack spacing={2} sx={{ width: "100%" }}>
                <Box>
                  <Typography component="h2" variant="h5" sx={{ fontWeight: 850 }}>
                    Create a room
                  </Typography>
                  <Typography color="text.secondary" sx={{ mt: 1 }}>
                    You become the host and get a four-character code to read out. {MIN_PLAYERS} to{" "}
                    {MAX_PLAYERS} karts can line up on the grid.
                  </Typography>
                </Box>
                {createError ? <Alert severity="error">{createError}</Alert> : null}
                <Button
                  variant="contained"
                  size="large"
                  onClick={() => createMutation.mutate()}
                  disabled={createMutation.isPending}
                  startIcon={
                    createMutation.isPending ? (
                      <CircularProgress size={18} />
                    ) : (
                      <AddCircleOutlineOutlinedIcon />
                    )
                  }
                  sx={{ mt: "auto" }}
                >
                  {createMutation.isPending ? "Opening the pit lane…" : "Create room"}
                </Button>
              </Stack>
            </Paper>

            <Paper
              component="form"
              noValidate
              onSubmit={submitJoin}
              variant="outlined"
              sx={{ p: { xs: 3, md: 4 } }}
            >
              <Stack spacing={2}>
                <Box>
                  <Typography component="h2" variant="h5" sx={{ fontWeight: 850 }}>
                    Join with a code
                  </Typography>
                  <Typography color="text.secondary" sx={{ mt: 1 }}>
                    Four characters, no O, 0, I or 1 — so it is never ambiguous read aloud.
                  </Typography>
                </Box>

                <TextField
                  label="Room code"
                  value={code}
                  onChange={(event) => setCode(normaliseCode(event.target.value))}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  error={Boolean(joinError)}
                  helperText={
                    joinError ??
                    (code.length > 0 && !isCodeComplete
                      ? `Room codes are ${ROOM_CODE_LENGTH} characters long.`
                      : "For example: KAPX")
                  }
                  slotProps={{
                    htmlInput: {
                      maxLength: ROOM_CODE_LENGTH,
                      inputMode: "text",
                      "aria-describedby": "kaapi-join-status",
                      style: {
                        fontSize: 30,
                        fontWeight: 800,
                        letterSpacing: "0.34em",
                        textAlign: "center",
                        fontVariantNumeric: "tabular-nums",
                      },
                    },
                  }}
                />

                <Box id="kaapi-join-status" aria-live="polite" sx={{ minHeight: 0 }}>
                  {previewQuery.isFetching && isCodeComplete ? (
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                      <CircularProgress size={16} />
                      <Typography variant="body2" color="text.secondary">
                        Looking up room {code}…
                      </Typography>
                    </Stack>
                  ) : null}
                  {previewRoom && !previewQuery.isFetching ? (
                    <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
                      <Chip
                        size="small"
                        color={previewRoom.status === "LOBBY" ? "success" : "default"}
                        label={
                          previewRoom.status === "LOBBY"
                            ? `${previewRoom.players.length} of ${MAX_PLAYERS} on the grid`
                            : "Race in progress"
                        }
                      />
                    </Stack>
                  ) : null}
                  {previewError && !previewQuery.isFetching ? (
                    <Alert severity="warning" variant="outlined">
                      {previewError}
                    </Alert>
                  ) : null}
                </Box>

                <Button
                  type="submit"
                  variant="contained"
                  size="large"
                  disabled={!isCodeComplete || joinMutation.isPending}
                  startIcon={
                    joinMutation.isPending ? <CircularProgress size={18} /> : <LoginOutlinedIcon />
                  }
                >
                  {joinMutation.isPending ? "Joining…" : "Join room"}
                </Button>
              </Stack>
            </Paper>
          </Box>

          <Divider sx={{ my: { xs: 4, md: 5 } }} />
          <Typography variant="body2" color="text.secondary">
            No names, no sign-in, no chat. Rooms disappear on their own after an hour, and the “who
            buys the coffee” result is a suggestion, never a payment instruction.
          </Typography>
        </Container>
      </Box>

      <HowToPlayDialog open={showHowTo} onClose={() => setShowHowTo(false)} />
    </>
  );
};
