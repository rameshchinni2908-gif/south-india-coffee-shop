import CheckCircleOutlineRoundedIcon from "@mui/icons-material/CheckCircleOutlineRounded";
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
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  InputAdornment,
  MenuItem,
  Pagination,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { ApiClientError } from "../../../lib/api-client.js";
import { formatRupees } from "../../../lib/currency.js";
import type { Order } from "../../../types/order.js";
import { ADMIN_PRODUCTS_QUERY_KEY } from "../products/admin-catalog-queries.js";
import { updateOrderStatus } from "../../orders/order-api.js";
import { formatShopDateTime } from "../../orders/order-format.js";
import { adminOrdersQuery, ADMIN_ORDERS_QUERY_KEY } from "../../orders/order-queries.js";
import {
  NEXT_ORDER_STATUSES,
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  type OrderStatus,
} from "../../orders/order-status.js";

const actionLabel: Record<OrderStatus, string> = {
  PLACED: "",
  CONFIRMED: "Confirm order",
  PREPARING: "Start preparing",
  READY: "Mark ready",
  COMPLETED: "Complete order",
  CANCELLED: "Cancel order",
};

const statusColor = (
  status: OrderStatus,
): "default" | "primary" | "secondary" | "success" | "warning" | "error" => {
  switch (status) {
    case "PLACED":
      return "warning";
    case "CONFIRMED":
      return "primary";
    case "PREPARING":
      return "secondary";
    case "READY":
    case "COMPLETED":
      return "success";
    case "CANCELLED":
      return "error";
  }
};

export const AdminOrdersPage = () => {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<OrderStatus | "ALL">("ALL");
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const filters = useMemo(() => ({ page, search, status }), [page, search, status]);
  const ordersQuery = useQuery(adminOrdersQuery(filters));
  const statusMutation = useMutation({
    mutationFn: updateOrderStatus,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ADMIN_ORDERS_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: ADMIN_PRODUCTS_QUERY_KEY }),
      ]);
      setCancelTarget(null);
    },
  });
  const mutationError =
    statusMutation.error instanceof ApiClientError
      ? statusMutation.error.message
      : statusMutation.isError
        ? "The order status could not be updated."
        : null;

  const applySearch = (event: React.FormEvent) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
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
              Pickup queue
            </Typography>
            <Typography component="h1" variant="h3">
              Orders
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 0.75 }}>
              Confirm stock, prepare pickups, and move each order through its valid workflow.
            </Typography>
          </Box>
          <Chip
            icon={<CheckCircleOutlineRoundedIcon />}
            label="Refreshes every 30 seconds"
            variant="outlined"
          />
        </Stack>

        {mutationError && (
          <Alert severity="error" sx={{ mt: 3 }}>
            {mutationError}
          </Alert>
        )}

        <Stack
          component="form"
          direction={{ xs: "column", md: "row" }}
          spacing={1.5}
          onSubmit={applySearch}
          sx={{ my: 4 }}
        >
          <TextField
            label="Search order, customer, or mobile"
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
            sx={{ flex: 1, maxWidth: 560 }}
          />
          <TextField
            select
            label="Status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as OrderStatus | "ALL");
              setPage(1);
            }}
            sx={{ minWidth: 190 }}
          >
            <MenuItem value="ALL">All statuses</MenuItem>
            {ORDER_STATUSES.map((orderStatus) => (
              <MenuItem key={orderStatus} value={orderStatus}>
                {ORDER_STATUS_LABELS[orderStatus]}
              </MenuItem>
            ))}
          </TextField>
          <Button type="submit" variant="outlined">
            Search
          </Button>
        </Stack>

        {ordersQuery.isPending && (
          <Stack spacing={2} aria-label="Loading orders">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} variant="rounded" height={250} />
            ))}
          </Stack>
        )}
        {ordersQuery.isError && (
          <Alert
            severity="error"
            action={<Button onClick={() => void ordersQuery.refetch()}>Try again</Button>}
          >
            Orders could not be loaded.
          </Alert>
        )}
        {ordersQuery.data?.orders.length === 0 && (
          <Alert severity="info">No orders match the selected filters.</Alert>
        )}
        {ordersQuery.data && ordersQuery.data.orders.length > 0 && (
          <Stack spacing={2}>
            {ordersQuery.data.orders.map((order) => {
              const nextStatuses = NEXT_ORDER_STATUSES[order.status];
              const isUpdating =
                statusMutation.isPending && statusMutation.variables.id === order.id;

              return (
                <Card key={order.id} variant="outlined" component="article">
                  <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
                    <Stack
                      direction={{ xs: "column", md: "row" }}
                      spacing={2}
                      sx={{ justifyContent: "space-between", alignItems: { md: "flex-start" } }}
                    >
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          ORDER NUMBER
                        </Typography>
                        <Typography component="h2" variant="h5" sx={{ fontWeight: 900 }}>
                          {order.orderNumber}
                        </Typography>
                        <Typography sx={{ mt: 0.75, fontWeight: 750 }}>
                          {order.customerName} · {order.customerMobile}
                        </Typography>
                      </Box>
                      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                        <Chip
                          label={ORDER_STATUS_LABELS[order.status]}
                          color={statusColor(order.status)}
                        />
                        <Typography sx={{ fontWeight: 900 }}>
                          {formatRupees(order.totalAmount)}
                        </Typography>
                      </Stack>
                    </Stack>

                    <Box
                      sx={{
                        display: "grid",
                        gridTemplateColumns: { xs: "1fr", md: "1.2fr .8fr" },
                        gap: 3,
                        mt: 2.5,
                      }}
                    >
                      <Stack spacing={1}>
                        {order.items.map((item) => (
                          <Stack
                            key={`${item.productId}:${item.variantId}`}
                            direction="row"
                            spacing={2}
                            sx={{ justifyContent: "space-between" }}
                          >
                            <Typography variant="body2">
                              {item.quantity} × {item.productName} · {item.variantName}
                            </Typography>
                            <Typography variant="body2" sx={{ fontWeight: 750 }}>
                              {formatRupees(item.lineTotal)}
                            </Typography>
                          </Stack>
                        ))}
                      </Stack>
                      <Stack spacing={0.75}>
                        <Typography variant="body2" color="text.secondary">
                          Pickup: {formatShopDateTime(order.pickupTime)}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Payment: {order.paymentStatus === "PAID" ? "Paid" : "Pay at shop"}
                        </Typography>
                        {order.notes && (
                          <Typography variant="body2" color="text.secondary">
                            Note: {order.notes}
                          </Typography>
                        )}
                      </Stack>
                    </Box>
                  </CardContent>
                  {nextStatuses.length > 0 && (
                    <>
                      <Divider />
                      <CardActions sx={{ p: 2, flexWrap: "wrap", gap: 1 }}>
                        {nextStatuses.map((nextStatus) =>
                          nextStatus === "CANCELLED" ? (
                            <Button
                              key={nextStatus}
                              color="error"
                              disabled={isUpdating}
                              onClick={() => setCancelTarget(order)}
                            >
                              Cancel order
                            </Button>
                          ) : (
                            <Button
                              key={nextStatus}
                              variant="contained"
                              disabled={isUpdating}
                              onClick={() =>
                                statusMutation.mutate({ id: order.id, status: nextStatus })
                              }
                            >
                              {isUpdating ? "Updating…" : actionLabel[nextStatus]}
                            </Button>
                          ),
                        )}
                      </CardActions>
                    </>
                  )}
                </Card>
              );
            })}

            {ordersQuery.data.meta.totalPages > 1 && (
              <Stack sx={{ pt: 2, alignItems: "center" }}>
                <Pagination
                  page={ordersQuery.data.meta.page}
                  count={ordersQuery.data.meta.totalPages}
                  color="primary"
                  onChange={(_event, nextPage) => setPage(nextPage)}
                />
              </Stack>
            )}
          </Stack>
        )}
      </Container>

      <Dialog
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Cancel order?</DialogTitle>
        <DialogContent>
          <Typography>
            {cancelTarget?.orderNumber} will be cancelled. Stock is restored only when this order
            was confirmed but preparation has not started.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCancelTarget(null)} disabled={statusMutation.isPending}>
            Keep order
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={statusMutation.isPending || !cancelTarget}
            onClick={() =>
              cancelTarget && statusMutation.mutate({ id: cancelTarget.id, status: "CANCELLED" })
            }
          >
            {statusMutation.isPending ? "Cancelling…" : "Cancel order"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
