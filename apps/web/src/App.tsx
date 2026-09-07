import { CssBaseline } from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { environment } from "./config/environment.js";
import { PageLoading } from "./components/PageLoading.js";
import { RouteErrorBoundary } from "./components/RouteErrorBoundary.js";
import { CartProvider } from "./features/cart/CartProvider.js";
import { GAMES_PATH } from "./features/kaapi-karts/game-paths.js";
import { queryClient } from "./lib/query-client.js";
import { theme } from "./theme.js";

const MenuPage = lazy(async () => {
  const module = await import("./features/menu/MenuPage.js");

  return { default: module.MenuPage };
});

const CartPage = lazy(async () => {
  const module = await import("./features/cart/CartPage.js");

  return { default: module.CartPage };
});

const OrderConfirmationPage = lazy(async () => {
  const module = await import("./features/checkout/OrderConfirmationPage.js");

  return { default: module.OrderConfirmationPage };
});

const OrderTrackingPage = lazy(async () => {
  const module = await import("./features/orders/OrderTrackingPage.js");

  return { default: module.OrderTrackingPage };
});

const AdminLoginPage = lazy(async () => {
  const module = await import("./features/admin/auth/AdminLoginPage.js");

  return { default: module.AdminLoginPage };
});

const AdminGate = lazy(async () => {
  const module = await import("./features/admin/auth/AdminGate.js");

  return { default: module.AdminGate };
});

const AdminProductsPage = lazy(async () => {
  const module = await import("./features/admin/products/AdminProductsPage.js");

  return { default: module.AdminProductsPage };
});

const AdminOrdersPage = lazy(async () => {
  const module = await import("./features/admin/orders/AdminOrdersPage.js");

  return { default: module.AdminOrdersPage };
});

const AdminDashboardPage = lazy(async () => {
  const module = await import("./features/admin/dashboard/AdminDashboardPage.js");

  return { default: module.AdminDashboardPage };
});

const AdminStaffPage = lazy(async () => {
  const module = await import("./features/admin/staff/AdminStaffPage.js");

  return { default: module.AdminStaffPage };
});

// Lazy so neither the game screens nor the canvas engine reach the main chunk.
const KaapiKartsRoutes = lazy(async () => {
  const module = await import("./features/kaapi-karts/kaapi-karts-routes.js");

  return { default: module.KaapiKartsRoutes };
});

export const AppRoutes = () => (
  <CartProvider>
    <RouteErrorBoundary>
      <Suspense fallback={<PageLoading />}>
        <Routes>
          <Route path="/" element={<MenuPage />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/order-confirmation/:orderNumber" element={<OrderConfirmationPage />} />
          <Route path="/track-order" element={<OrderTrackingPage />} />
          {environment.gameEnabled ? (
            <Route path={`${GAMES_PATH}/*`} element={<KaapiKartsRoutes />} />
          ) : null}
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route element={<AdminGate />}>
            <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
            <Route path="/admin/orders" element={<AdminOrdersPage />} />
            <Route path="/admin/products" element={<AdminProductsPage />} />
            <Route path="/admin/staff" element={<AdminStaffPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </RouteErrorBoundary>
  </CartProvider>
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
