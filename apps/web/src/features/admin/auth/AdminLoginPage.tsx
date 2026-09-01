import { zodResolver } from "@hookform/resolvers/zod";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { BrandLockup } from "../../../components/BrandLockup.js";
import { ApiClientError } from "../../../lib/api-client.js";
import { login } from "./auth-api.js";
import { AUTH_QUERY_KEY } from "./auth-query.js";
import { loginFormSchema, type LoginFormValues } from "./login-schema.js";

export const AdminLoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const {
    formState: { errors },
    handleSubmit,
    register,
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: "", password: "" },
  });
  const loginMutation = useMutation({ mutationFn: login });
  const submitLogin = async (values: LoginFormValues) => {
    try {
      const user = await loginMutation.mutateAsync(values);
      queryClient.setQueryData(AUTH_QUERY_KEY, user);
      const destination = (location.state as { from?: string } | null)?.from ?? "/admin/dashboard";
      navigate(destination, { replace: true });
    } catch {
      // The mutation state renders the API's safe authentication error.
    }
  };
  const errorMessage =
    loginMutation.error instanceof ApiClientError
      ? loginMutation.error.message
      : loginMutation.isError
        ? "Unable to sign in. Please try again."
        : null;

  return (
    <Box
      component="main"
      sx={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        py: 5,
        background:
          "radial-gradient(circle at 15% 15%, rgba(184,95,22,.16), transparent 30%), #fbf6ee",
      }}
    >
      <Container maxWidth="xs">
        <Paper
          elevation={0}
          sx={{ p: { xs: 3, sm: 4 }, border: "1px solid", borderColor: "divider" }}
        >
          <Stack spacing={2.5}>
            <BrandLockup contextLabel="Staff access" />
            <Typography component="h1" variant="h5" sx={{ fontWeight: 850 }}>
              Staff sign in
            </Typography>

            <Typography color="text.secondary">
              Sign in with the staff account created by the admin seed command.
            </Typography>
            {errorMessage && <Alert severity="error">{errorMessage}</Alert>}

            <Stack
              component="form"
              noValidate
              spacing={2}
              onSubmit={(event) => void handleSubmit(submitLogin)(event)}
            >
              <TextField
                label="Email address"
                type="email"
                autoComplete="username"
                {...register("email")}
                error={Boolean(errors.email)}
                helperText={errors.email?.message}
              />
              <TextField
                label="Password"
                type="password"
                autoComplete="current-password"
                {...register("password")}
                error={Boolean(errors.password)}
                helperText={errors.password?.message}
              />
              <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={loginMutation.isPending}
                startIcon={
                  loginMutation.isPending ? <CircularProgress size={18} /> : <LockOutlinedIcon />
                }
              >
                {loginMutation.isPending ? "Signing in…" : "Sign in"}
              </Button>
            </Stack>
            <Button component={Link} to="/" color="inherit">
              Return to customer menu
            </Button>
          </Stack>
        </Paper>
      </Container>
    </Box>
  );
};
