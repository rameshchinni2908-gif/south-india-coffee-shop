import PlayArrowOutlinedIcon from "@mui/icons-material/PlayArrowOutlined";
import SportsScoreOutlinedIcon from "@mui/icons-material/SportsScoreOutlined";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Fade,
  Stack,
  Typography,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { SiteHeader } from "../../components/SiteHeader.js";
import { pingGameHealth } from "./game-api.js";
import { GAME_DISPLAY_NAME, GAME_TAGLINE, MAX_PLAYERS, MIN_PLAYERS } from "./game-contract.js";
import { KAAPI_KARTS_PATH } from "./game-paths.js";
import { useReducedMotion } from "./use-reduced-motion.js";

const SLOW_WAKE_MS = 1_500;

export const GamesHubPage = () => {
  const reducedMotion = useReducedMotion();
  const [wakeTimedOut, setWakeTimedOut] = useState(false);
  // The API sleeps on the free tier; ping it now so tapping Play feels instant.
  const healthQuery = useQuery({
    queryKey: ["game", "health"],
    queryFn: ({ signal }) => pingGameHealth(signal),
    retry: 1,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!healthQuery.isPending) {
      return;
    }

    const timer = window.setTimeout(() => setWakeTimedOut(true), SLOW_WAKE_MS);

    return () => window.clearTimeout(timer);
  }, [healthQuery.isPending]);

  return (
    <>
      <SiteHeader />
      <Box component="main" sx={{ py: { xs: 5, md: 8 }, minHeight: "calc(100vh - 82px)" }}>
        <Container maxWidth="lg">
          <Box sx={{ maxWidth: 660 }}>
            <Typography variant="overline" color="secondary.dark">
              While you wait
            </Typography>
            <Typography component="h1" variant="h3">
              Games at the table
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 1.25, fontSize: 17 }}>
              Short, silly things to play on your phones between ordering and collecting. Nothing
              here touches your order or your bill.
            </Typography>
          </Box>

          <Box aria-live="polite" sx={{ mt: 3, maxWidth: 660 }}>
            {healthQuery.isPending && wakeTimedOut ? (
              <Alert severity="info" icon={<CircularProgress size={18} />}>
                Waking the track… the game server sleeps when nobody is racing.
              </Alert>
            ) : null}
            {healthQuery.isError ? (
              <Alert
                severity="warning"
                action={
                  <Button color="inherit" size="small" onClick={() => void healthQuery.refetch()}>
                    Try again
                  </Button>
                }
              >
                The game server did not answer. You can still open the room screen and retry.
              </Alert>
            ) : null}
          </Box>

          <Box
            component="ul"
            sx={{
              listStyle: "none",
              p: 0,
              mt: { xs: 4, md: 5 },
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                sm: "repeat(2, minmax(0, 1fr))",
                lg: "repeat(3, minmax(0, 1fr))",
              },
              gap: { xs: 2, sm: 2.5 },
            }}
          >
            <Fade in timeout={reducedMotion ? 0 : 420}>
              <Box component="li" sx={{ listStyle: "none", display: "flex" }}>
                <Card
                  variant="outlined"
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    width: "100%",
                    overflow: "hidden",
                    borderColor: "rgba(111, 50, 25, 0.18)",
                  }}
                >
                  <Box
                    aria-hidden
                    sx={{
                      height: 150,
                      display: "grid",
                      placeItems: "center",
                      color: "#fffdf8",
                      background: "linear-gradient(135deg, #6f3219 0%, #a85d36 52%, #b85f16 100%)",
                    }}
                  >
                    <SportsScoreOutlinedIcon sx={{ fontSize: 62, opacity: 0.92 }} />
                  </Box>
                  <CardContent sx={{ flexGrow: 1, p: { xs: 2.5, md: 3 } }}>
                    <Stack direction="row" spacing={1} sx={{ mb: 1.25, flexWrap: "wrap", gap: 1 }}>
                      <Chip size="small" label={`${MIN_PLAYERS}–${MAX_PLAYERS} players`} />
                      <Chip size="small" variant="outlined" label="Under 2½ minutes" />
                    </Stack>
                    <Typography component="h2" variant="h5" sx={{ fontWeight: 850 }}>
                      {GAME_DISPLAY_NAME}
                    </Typography>
                    <Typography color="text.secondary" sx={{ mt: 1 }}>
                      {GAME_TAGLINE}
                    </Typography>
                  </CardContent>
                  <Box sx={{ px: { xs: 2.5, md: 3 }, pb: { xs: 2.5, md: 3 } }}>
                    <Button
                      component={Link}
                      to={KAAPI_KARTS_PATH}
                      variant="contained"
                      fullWidth
                      startIcon={<PlayArrowOutlinedIcon />}
                    >
                      Play {GAME_DISPLAY_NAME}
                    </Button>
                  </Box>
                </Card>
              </Box>
            </Fade>
          </Box>

          <Typography variant="body2" color="text.secondary" sx={{ mt: 4, maxWidth: 660 }}>
            More games may appear here later. Results are just for fun and are never linked to an
            order, a payment, or anyone’s account.
          </Typography>
        </Container>
      </Box>
    </>
  );
};
