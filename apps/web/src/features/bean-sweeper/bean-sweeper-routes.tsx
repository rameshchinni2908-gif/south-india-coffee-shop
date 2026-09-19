import { Box, CircularProgress } from "@mui/material";
import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";

export { BEAN_SWEEPER_PATH } from "./bean-sweeper-paths.js";

const BeanSweeperPage = lazy(async () => {
  const module = await import("./BeanSweeperPage.js");
  return { default: module.BeanSweeperPage };
});

const Loading = () => (
  <Box
    role="status"
    aria-label="Loading Bean Sweeper"
    sx={{ minHeight: "60vh", display: "grid", placeItems: "center" }}
  >
    <CircularProgress />
  </Box>
);

export const BeanSweeperRoutes = () => (
  <Suspense fallback={<Loading />}>
    <Routes>
      <Route index element={<BeanSweeperPage />} />
    </Routes>
  </Suspense>
);
