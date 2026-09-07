import { Box, CircularProgress } from "@mui/material";
import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

export { BEAN_MERGE_PATH } from "./merge-paths.js";

const BeanMergePage = lazy(async () => {
  const module = await import("./BeanMergePage.js");

  return { default: module.BeanMergePage };
});

const MergeRouteLoading = () => (
  <Box
    role="status"
    aria-label="Loading Bean Merge"
    sx={{ minHeight: "60vh", display: "grid", placeItems: "center" }}
  >
    <CircularProgress />
  </Box>
);

/**
 * The `/games/bean-merge/*` subtree. App.tsx mounts it with one splat route.
 */
export const BeanMergeRoutes = () => (
  <Suspense fallback={<MergeRouteLoading />}>
    <Routes>
      <Route index element={<BeanMergePage />} />
      <Route path="*" element={<Navigate to="." replace />} />
    </Routes>
  </Suspense>
);
