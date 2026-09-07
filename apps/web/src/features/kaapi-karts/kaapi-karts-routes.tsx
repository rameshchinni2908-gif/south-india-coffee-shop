import { Box, CircularProgress } from "@mui/material";
import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { KAAPI_KARTS_PATH } from "./game-paths.js";

export {
  GAMES_PATH,
  KAAPI_KARTS_PATH,
  kaapiKartsInvitePath,
  kaapiKartsInviteUrl,
  kaapiKartsLobbyPath,
  kaapiKartsRacePath,
  kaapiKartsResultsPath,
} from "./game-paths.js";

const GamesHubPage = lazy(async () => {
  const module = await import("./GamesHubPage.js");

  return { default: module.GamesHubPage };
});

const KaapiKartsStartPage = lazy(async () => {
  const module = await import("./KaapiKartsStartPage.js");

  return { default: module.KaapiKartsStartPage };
});

const LobbyPage = lazy(async () => {
  const module = await import("./LobbyPage.js");

  return { default: module.LobbyPage };
});

// The canvas engine only ships with this chunk, so it never reaches the hub.
const RacePage = lazy(async () => {
  const module = await import("./RacePage.js");

  return { default: module.RacePage };
});

const ResultsPage = lazy(async () => {
  const module = await import("./ResultsPage.js");

  return { default: module.ResultsPage };
});

const GameRouteLoading = () => (
  <Box
    role="status"
    aria-label="Loading Kaapi Karts"
    sx={{ minHeight: "60vh", display: "grid", placeItems: "center" }}
  >
    <CircularProgress />
  </Box>
);

/**
 * The whole `/games/*` subtree. App.tsx mounts it with a single splat route:
 *
 * ```tsx
 * <Route path={`${GAMES_PATH}/*`} element={<KaapiKartsRoutes />} />
 * ```
 */
export const KaapiKartsRoutes = () => (
  <Suspense fallback={<GameRouteLoading />}>
    <Routes>
      <Route index element={<GamesHubPage />} />
      <Route path="kaapi-karts" element={<KaapiKartsStartPage />} />
      <Route path="kaapi-karts/r/:code" element={<KaapiKartsStartPage />} />
      <Route path="kaapi-karts/lobby/:code" element={<LobbyPage />} />
      <Route path="kaapi-karts/race/:code" element={<RacePage />} />
      <Route path="kaapi-karts/results/:code" element={<ResultsPage />} />
      <Route path="*" element={<Navigate to={KAAPI_KARTS_PATH} replace />} />
    </Routes>
  </Suspense>
);
