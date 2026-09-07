import { CssBaseline } from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { environment } from "./config/environment.js";
import { PageLoading } from "./components/PageLoading.js";
import { RouteErrorBoundary } from "./components/RouteErrorBoundary.js";
import { CartProvider } from "./features/cart/CartProvider.js";
import { BEAN_BLASTERS_PATH } from "./features/bean-blasters/arena-paths.js";
import { BEAN_MERGE_PATH } from "./features/bean-merge/merge-paths.js";
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

// The second mini-game, lazy for the same reason and behind the same flag.
const BeanBlastersRoutes = lazy(async () => {
  const module = await import("./features/bean-blasters/bean-blasters-routes.js");

  return { default: module.BeanBlastersRoutes };
});

// The third: single-player, no server involved at all.
const BeanMergeRoutes = lazy(async () => {
  const module = await import("./features/bean-merge/bean-merge-routes.js");

  return { default: module.BeanMergeRoutes };
});

const SecretSipRoutes = lazy(async () => {
  const module = await import("./features/secret-sip/SecretSipPage.js");
  return { default: module.SecretSipRoutes };
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
            <>
              {/* More specific than the `/games/*` splat below, so it wins the
                  match regardless of the order these are declared in. */}
              <Route path={`${BEAN_BLASTERS_PATH}/*`} element={<BeanBlastersRoutes />} />
              <Route path={`${BEAN_MERGE_PATH}/*`} element={<BeanMergeRoutes />} />
              <Route path="/games/secret-sip/*" element={<SecretSipRoutes />} />
              <Route path={`${GAMES_PATH}/*`} element={<KaapiKartsRoutes />} />
            </>
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
