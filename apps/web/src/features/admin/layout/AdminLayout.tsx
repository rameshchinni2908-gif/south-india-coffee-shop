import CoffeeRoundedIcon from "@mui/icons-material/CoffeeRounded";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import PeopleOutlineRoundedIcon from "@mui/icons-material/PeopleOutlineRounded";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import StorefrontRoundedIcon from "@mui/icons-material/StorefrontRounded";
import {
  Alert,
  AppBar,
  Box,
  Button,
  Chip,
  Container,
  IconButton,
  Stack,
  Toolbar,
  Typography,
} from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Link, Outlet, useNavigate } from "react-router-dom";

import { ADMIN_SESSION_EXPIRED_EVENT } from "../../../lib/api-client.js";
import type { StaffUser } from "../../../types/auth.js";
import { logout } from "../auth/auth-api.js";
import { AUTH_QUERY_KEY } from "../auth/auth-query.js";

export const AdminLayout = ({ user }: { user: StaffUser }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    const handleExpiredSession = () => {
      queryClient.removeQueries({ queryKey: AUTH_QUERY_KEY });
      navigate("/admin/login", { replace: true });
    };

    window.addEventListener(ADMIN_SESSION_EXPIRED_EVENT, handleExpiredSession);

    return () => window.removeEventListener(ADMIN_SESSION_EXPIRED_EVENT, handleExpiredSession);
  }, [navigate, queryClient]);

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: AUTH_QUERY_KEY });
      navigate("/admin/login", { replace: true });
    },
  });

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#f7f2e9" }}>
      <AppBar position="static" elevation={0} sx={{ bgcolor: "primary.dark" }}>
        <Container maxWidth="xl">
          <Toolbar disableGutters sx={{ minHeight: 72, gap: 2 }}>
            <CoffeeRoundedIcon aria-hidden="true" />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h6" noWrap sx={{ fontWeight: 850 }}>
                Coffee Shop Admin
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>
                Shop operations
              </Typography>
            </Box>
            <Stack
              direction="row"
              spacing={1}
              sx={{ ml: "auto", alignItems: "center", display: { xs: "none", sm: "flex" } }}
            >
              <Chip label={`${user.name} · ${user.role}`} color="secondary" size="small" />
              <Button component={Link} to="/" color="inherit" startIcon={<StorefrontRoundedIcon />}>
                Customer menu
              </Button>
              <Button
                color="inherit"
                startIcon={<LogoutRoundedIcon />}
                disabled={logoutMutation.isPending}
                onClick={() => logoutMutation.mutate()}
              >
                Sign out
              </Button>
            </Stack>
            <IconButton
              color="inherit"
              aria-label="Sign out"
              disabled={logoutMutation.isPending}
              onClick={() => logoutMutation.mutate()}
              sx={{ ml: "auto", display: { sm: "none" } }}
            >
              <LogoutRoundedIcon />
            </IconButton>
          </Toolbar>
        </Container>
      </AppBar>
      <Box sx={{ bgcolor: "background.paper", borderBottom: "1px solid", borderColor: "divider" }}>
        <Container maxWidth="xl">
          <Stack direction="row" spacing={1} sx={{ py: 1, overflowX: "auto" }}>
            <Button component={Link} to="/admin/dashboard" startIcon={<DashboardOutlinedIcon />}>
              Dashboard
            </Button>
            <Button component={Link} to="/admin/orders" startIcon={<ReceiptLongOutlinedIcon />}>
              Orders
            </Button>
            <Button component={Link} to="/admin/products" startIcon={<Inventory2OutlinedIcon />}>
              Products
            </Button>
            {user.role === "ADMIN" && (
              <Button component={Link} to="/admin/staff" startIcon={<PeopleOutlineRoundedIcon />}>
                Staff
              </Button>
            )}
          </Stack>
        </Container>
      </Box>
      {logoutMutation.isError && (
        <Container maxWidth="xl" sx={{ mt: 2 }}>
          <Alert severity="error">Sign out failed. Please try again.</Alert>
        </Container>
      )}
      <Outlet context={{ user }} />
    </Box>
  );
};
