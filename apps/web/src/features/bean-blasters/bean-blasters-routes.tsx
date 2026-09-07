import { Box, CircularProgress } from "@mui/material";
import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { BEAN_BLASTERS_PATH } from "./arena-paths.js";

export {
  BEAN_BLASTERS_PATH,
  GAMES_PATH,
  beanBlastersBattlePath,
  beanBlastersInvitePath,
  beanBlastersInviteUrl,
  beanBlastersLobbyPath,
  beanBlastersResultsPath,
} from "./arena-paths.js";

const BeanBlastersStartPage = lazy(async () => {
  const module = await import("./BeanBlastersStartPage.js");

  return { default: module.BeanBlastersStartPage };
});

const LobbyPage = lazy(async () => {
  const module = await import("./BeanBlastersLobbyPage.js");

  return { default: module.LobbyPage };
});

// The canvas engine only ships with this chunk, so it never reaches the hub.
const BattlePage = lazy(async () => {
  const module = await import("./BattlePage.js");

  return { default: module.BattlePage };
});

const ResultsPage = lazy(async () => {
  const module = await import("./BeanBlastersResultsPage.js");

  return { default: module.ResultsPage };
});

const ArenaRouteLoading = () => (
  <Box
    role="status"
    aria-label="Loading Bean Blasters"
    sx={{ minHeight: "60vh", display: "grid", placeItems: "center" }}
  >
    <CircularProgress />
  </Box>
);

/**
 * The whole `/games/bean-blasters/*` subtree. App.tsx mounts it with a single
 * splat route, ahead of the existing `/games/*` splat:
 *
 * ```tsx
 * <Route path={`${BEAN_BLASTERS_PATH}/*`} element={<BeanBlastersRoutes />} />
 * ```
 */
export const BeanBlastersRoutes = () => (
  <Suspense fallback={<ArenaRouteLoading />}>
    <Routes>
      <Route index element={<BeanBlastersStartPage />} />
      <Route path="r/:code" element={<BeanBlastersStartPage />} />
      <Route path="lobby/:code" element={<LobbyPage />} />
      <Route path="battle/:code" element={<BattlePage />} />
      <Route path="results/:code" element={<ResultsPage />} />
      <Route path="*" element={<Navigate to={BEAN_BLASTERS_PATH} replace />} />
    </Routes>
  </Suspense>
);
