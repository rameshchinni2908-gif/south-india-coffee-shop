import Grid4x4OutlinedIcon from "@mui/icons-material/Grid4x4Outlined";
import PlayArrowOutlinedIcon from "@mui/icons-material/PlayArrowOutlined";
import SportsMmaOutlinedIcon from "@mui/icons-material/SportsMmaOutlined";
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
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { SiteHeader } from "../../components/SiteHeader.js";
import { environment } from "../../config/environment.js";
// --- Bean Blasters card ---
// The hub is the one shared surface the second game is allowed to touch.
// Removing Bean Blasters means removing these two imports and the <GameCard>
// below that uses them. See BEAN-BLASTERS.md section 3 rule 7.
import {
  GAME_DISPLAY_NAME as BLASTERS_NAME,
  GAME_TAGLINE as BLASTERS_TAGLINE,
  MAX_PLAYERS as BLASTERS_MAX_PLAYERS,
  MIN_PLAYERS as BLASTERS_MIN_PLAYERS,
} from "../bean-blasters/arena-contract.js";
import { BEAN_BLASTERS_PATH } from "../bean-blasters/arena-paths.js";
// --- end Bean Blasters card ---
// --- Bean Merge card ---
import {
  GAME_DISPLAY_NAME as MERGE_NAME,
  GAME_TAGLINE as MERGE_TAGLINE,
} from "../bean-merge/merge-contract.js";
import { BEAN_MERGE_PATH } from "../bean-merge/merge-paths.js";
// --- end Bean Merge card ---
import { pingGameHealth } from "./game-api.js";
import { GAME_DISPLAY_NAME, GAME_TAGLINE, MAX_PLAYERS, MIN_PLAYERS } from "./game-contract.js";
import { KAAPI_KARTS_PATH } from "./game-paths.js";
import { useReducedMotion } from "./use-reduced-motion.js";

const SLOW_WAKE_MS = 1_500;

interface GameCardProps {
  name: string;
  tagline: string;
  path: string;
  chips: readonly string[];
  gradient: string;
  icon: ReactNode;
  reducedMotion: boolean;
}

/**
 * One tile in the hub grid. Extracted when the second game arrived so the two
 * cards cannot drift apart visually.
 */
const GameCard = ({ name, tagline, path, chips, gradient, icon, reducedMotion }: GameCardProps) => (
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
            background: gradient,
          }}
        >
          {icon}
        </Box>
        <CardContent sx={{ flexGrow: 1, p: { xs: 2.5, md: 3 } }}>
          <Stack direction="row" spacing={1} sx={{ mb: 1.25, flexWrap: "wrap", gap: 1 }}>
            {chips.map((label, index) => (
              <Chip
                key={label}
                size="small"
                variant={index === 0 ? "filled" : "outlined"}
                label={label}
              />
            ))}
          </Stack>
          <Typography component="h2" variant="h5" sx={{ fontWeight: 850 }}>
            {name}
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            {tagline}
          </Typography>
        </CardContent>
        <Box sx={{ px: { xs: 2.5, md: 3 }, pb: { xs: 2.5, md: 3 } }}>
          <Button
            component={Link}
            to={path}
            variant="contained"
            fullWidth
            startIcon={<PlayArrowOutlinedIcon />}
          >
            Play {name}
          </Button>
        </Box>
      </Card>
    </Box>
  </Fade>
);

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
            {environment.gameSocketMisconfigured ? (
              <Alert severity="error">
                Live racing is misconfigured on this deployment: set{" "}
                <strong>VITE_GAME_SOCKET_URL</strong> to the API origin and redeploy. Until then the
                lobby will never connect.
              </Alert>
            ) : null}
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
            <GameCard
              name={GAME_DISPLAY_NAME}
              tagline={GAME_TAGLINE}
              path={KAAPI_KARTS_PATH}
              chips={[`${MIN_PLAYERS}–${MAX_PLAYERS} players`, "Under 2½ minutes"]}
              gradient="linear-gradient(135deg, #6f3219 0%, #a85d36 52%, #b85f16 100%)"
              icon={<SportsScoreOutlinedIcon sx={{ fontSize: 62, opacity: 0.92 }} />}
              reducedMotion={reducedMotion}
            />
            {/* --- Bean Blasters card --- */}
            <GameCard
              name={BLASTERS_NAME}
              tagline={BLASTERS_TAGLINE}
              path={BEAN_BLASTERS_PATH}
              chips={[`${BLASTERS_MIN_PLAYERS}–${BLASTERS_MAX_PLAYERS} players`, "2 minutes"]}
              gradient="linear-gradient(135deg, #7d3350 0%, #b85f16 55%, #8a5a1c 100%)"
              icon={<SportsMmaOutlinedIcon sx={{ fontSize: 62, opacity: 0.92 }} />}
              reducedMotion={reducedMotion}
            />
            {/* --- end Bean Blasters card --- */}
            {/* --- Bean Merge card --- */}
            <GameCard
              name={MERGE_NAME}
              tagline={MERGE_TAGLINE}
              path={BEAN_MERGE_PATH}
              chips={["1 player", "No timer"]}
              gradient="linear-gradient(135deg, #28734f 0%, #8a5a1c 55%, #c98a4b 100%)"
              icon={<Grid4x4OutlinedIcon sx={{ fontSize: 62, opacity: 0.92 }} />}
              reducedMotion={reducedMotion}
            />
            {/* --- end Bean Merge card --- */}
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
