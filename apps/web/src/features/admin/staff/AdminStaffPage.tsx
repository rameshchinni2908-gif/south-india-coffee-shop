import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import PersonAddOutlinedIcon from "@mui/icons-material/PersonAddOutlined";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import {
  Alert,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  Container,
  InputAdornment,
  MenuItem,
  Pagination,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Navigate, useOutletContext } from "react-router-dom";

import type { StaffAccount, StaffUser } from "../../../types/auth.js";
import { formatShopDateTime } from "../../orders/order-format.js";
import type { StaffActiveFilter, StaffRoleFilter } from "./staff-api.js";
import { StaffAccountDialog } from "./StaffAccountDialog.js";
import { staffAccountsQuery } from "./staff-queries.js";

const StaffManagement = ({ user }: { user: StaffUser }) => {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<StaffRoleFilter>("ALL");
  const [active, setActive] = useState<StaffActiveFilter>("ALL");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<StaffAccount | null>(null);
  const filters = useMemo(() => ({ page, search, role, active }), [active, page, role, search]);
  const accountsQuery = useQuery(staffAccountsQuery(filters));

  const applySearch = (event: React.FormEvent) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const openCreate = () => {
    setEditingAccount(null);
    setDialogOpen(true);
  };

  return (
    <Box component="main" sx={{ py: { xs: 4, md: 6 } }}>
      <Container maxWidth="xl">
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          sx={{ justifyContent: "space-between", alignItems: { md: "flex-end" } }}
        >
          <Box>
            <Typography variant="overline" color="secondary.dark">
              Access control
            </Typography>
            <Typography component="h1" variant="h3">
              Staff accounts
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 0.75 }}>
              Create staff access, assign administrator permissions, and deactivate accounts.
            </Typography>
          </Box>
          <Button variant="contained" startIcon={<PersonAddOutlinedIcon />} onClick={openCreate}>
            Create staff account
          </Button>
        </Stack>

        <Stack
          component="form"
          direction={{ xs: "column", md: "row" }}
          spacing={1.5}
          onSubmit={applySearch}
          sx={{ my: 4 }}
        >
          <TextField
            label="Search name or email"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            slotProps={{
              htmlInput: { maxLength: 100 },
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchRoundedIcon />
                  </InputAdornment>
                ),
              },
            }}
            sx={{ flex: 1, maxWidth: 520 }}
          />
          <TextField
            select
            label="Role"
            value={role}
            onChange={(event) => {
              setRole(event.target.value as StaffRoleFilter);
              setPage(1);
            }}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="ALL">All roles</MenuItem>
            <MenuItem value="ADMIN">Administrators</MenuItem>
            <MenuItem value="STAFF">Staff</MenuItem>
          </TextField>
          <TextField
            select
            label="Account status"
            value={active}
            onChange={(event) => {
              setActive(event.target.value as StaffActiveFilter);
              setPage(1);
            }}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="ALL">All accounts</MenuItem>
            <MenuItem value="true">Active</MenuItem>
            <MenuItem value="false">Inactive</MenuItem>
          </TextField>
          <Button type="submit" variant="outlined">
            Search
          </Button>
        </Stack>

        {accountsQuery.isPending && (
          <Box
            aria-label="Loading staff accounts"
            sx={{ display: "grid", gridTemplateColumns: { md: "repeat(2, 1fr)" }, gap: 2 }}
          >
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} variant="rounded" height={210} />
            ))}
          </Box>
        )}
        {accountsQuery.isError && (
          <Alert
            severity="error"
            action={<Button onClick={() => void accountsQuery.refetch()}>Try again</Button>}
          >
            Staff accounts could not be loaded.
          </Alert>
        )}
        {accountsQuery.data?.staffAccounts.length === 0 && (
          <Alert severity="info">No staff accounts match these filters.</Alert>
        )}
        {accountsQuery.data && accountsQuery.data.staffAccounts.length > 0 && (
          <>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", lg: "repeat(2, minmax(0, 1fr))" },
                gap: 2,
              }}
            >
              {accountsQuery.data.staffAccounts.map((account) => (
                <Card key={account.id} variant="outlined" component="article">
                  <CardContent sx={{ p: 2.5 }}>
                    <Stack
                      direction="row"
                      spacing={2}
                      sx={{ justifyContent: "space-between", alignItems: "flex-start" }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography component="h2" variant="h5" sx={{ fontWeight: 850 }}>
                          {account.name}
                        </Typography>
                        <Typography color="text.secondary" sx={{ overflowWrap: "anywhere" }}>
                          {account.email}
                        </Typography>
                      </Box>
                      <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
                        {account.id === user.id && <Chip size="small" label="You" />}
                        <Chip
                          size="small"
                          color={account.role === "ADMIN" ? "secondary" : "default"}
                          label={account.role === "ADMIN" ? "Administrator" : "Staff"}
                        />
                        <Chip
                          size="small"
                          color={account.isActive ? "success" : "error"}
                          label={account.isActive ? "Active" : "Inactive"}
                        />
                      </Stack>
                    </Stack>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                      Created {formatShopDateTime(account.createdAt)}
                    </Typography>
                  </CardContent>
                  <CardActions sx={{ px: 2.5, pb: 2.5 }}>
                    <Button
                      startIcon={<EditOutlinedIcon />}
                      onClick={() => {
                        setEditingAccount(account);
                        setDialogOpen(true);
                      }}
                    >
                      Edit account
                    </Button>
                  </CardActions>
                </Card>
              ))}
            </Box>
            {accountsQuery.data.meta.totalPages > 1 && (
              <Stack sx={{ mt: 4, alignItems: "center" }}>
                <Pagination
                  page={accountsQuery.data.meta.page}
                  count={accountsQuery.data.meta.totalPages}
                  onChange={(_event, nextPage) => setPage(nextPage)}
                  color="primary"
                />
              </Stack>
            )}
          </>
        )}
      </Container>

      {dialogOpen && (
        <StaffAccountDialog
          key={editingAccount?.id ?? "new-staff-account"}
          account={editingAccount}
          currentUserId={user.id}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </Box>
  );
};

export const AdminStaffPage = () => {
  const { user } = useOutletContext<{ user: StaffUser }>();

  return user.role === "ADMIN" ? <StaffManagement user={user} /> : <Navigate to="/admin" replace />;
};
