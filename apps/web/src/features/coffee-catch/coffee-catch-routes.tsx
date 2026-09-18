import { Box, CircularProgress } from "@mui/material";
import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";

export { COFFEE_CATCH_PATH } from "./coffee-catch-paths.js";

const CoffeeCatchPage = lazy(async () => {
  const module = await import("./CoffeeCatchPage.js");
  return { default: module.CoffeeCatchPage };
});

const Loading = () => (
  <Box
    role="status"
    aria-label="Loading Coffee Catch"
    sx={{ minHeight: "60vh", display: "grid", placeItems: "center" }}
  >
    <CircularProgress />
  </Box>
);

export const CoffeeCatchRoutes = () => (
  <Suspense fallback={<Loading />}>
    <Routes>
      <Route index element={<CoffeeCatchPage />} />
    </Routes>
  </Suspense>
);
