import { Box, CircularProgress, CssBaseline } from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { queryClient } from "./lib/query-client.js";
import { theme } from "./theme.js";

const MenuPage = lazy(async () => {
  const module = await import("./features/menu/MenuPage.js");

  return { default: module.MenuPage };
});

const RouteLoading = () => (
  <Box
    role="status"
    aria-label="Loading menu"
    sx={{ minHeight: "100vh", display: "grid", placeItems: "center" }}
  >
    <CircularProgress />
  </Box>
);

export const AppRoutes = () => (
  <Suspense fallback={<RouteLoading />}>
    <Routes>
      <Route path="/" element={<MenuPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </Suspense>
);

export const App = () => (
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  </ThemeProvider>
);
