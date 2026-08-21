import { Alert, Box, Button, CircularProgress } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { Navigate, useLocation } from "react-router-dom";

import { ApiClientError } from "../../../lib/api-client.js";
import { AdminLayout } from "../layout/AdminLayout.js";
import { currentUserQuery } from "./auth-query.js";

export const AdminGate = () => {
  const location = useLocation();
  const userQuery = useQuery(currentUserQuery);

  if (userQuery.isPending) {
    return (
      <Box
        role="status"
        aria-label="Checking staff session"
        sx={{ minHeight: "100vh", display: "grid", placeItems: "center" }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (
    userQuery.error instanceof ApiClientError &&
    (userQuery.error.status === 401 || userQuery.error.status === 403)
  ) {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  }

  if (userQuery.isError) {
    return (
      <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", p: 3 }}>
        <Alert
          severity="error"
          action={<Button onClick={() => void userQuery.refetch()}>Try again</Button>}
        >
          The staff session could not be checked.
        </Alert>
      </Box>
    );
  }

  return <AdminLayout user={userQuery.data} />;
};
