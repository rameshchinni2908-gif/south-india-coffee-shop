import { zodResolver } from "@hookform/resolvers/zod";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Divider,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";

import { SiteHeader } from "../../components/SiteHeader.js";
import { ApiClientError } from "../../lib/api-client.js";
import { formatRupees } from "../../lib/currency.js";
import type { Order } from "../../types/order.js";
import { trackOrder } from "./order-api.js";
import { formatShopDateTime } from "./order-format.js";
import { orderTrackingSchema, type OrderTrackingValues } from "./order-tracking-schema.js";
import { ORDER_STATUS_LABELS, type OrderStatus } from "./order-status.js";

const PROGRESS_STATUSES: OrderStatus[] = ["PLACED", "CONFIRMED", "PREPARING", "READY", "COMPLETED"];

const TrackingResult = ({ order }: { order: Order }) => {
  const currentStep = PROGRESS_STATUSES.indexOf(order.status);

  return (
    <Paper variant="outlined" sx={{ p: { xs: 3, md: 4 } }} aria-live="polite">
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}
      >
        <Box>
          <Typography variant="overline" color="text.secondary">
            Order number
          </Typography>
          <Typography component="h2" variant="h4">
            {order.orderNumber}
          </Typography>
        </Box>
        <Chip
          label={ORDER_STATUS_LABELS[order.status]}
          color={order.status === "CANCELLED" ? "error" : "success"}
          icon={order.status === "CANCELLED" ? undefined : <CheckCircleRoundedIcon />}
        />
      </Stack>

      {order.status === "CANCELLED" ? (
        <Alert severity="error" sx={{ mt: 3 }}>
          This order was cancelled. Please contact the shop if you need help.
        </Alert>
      ) : (
        <Stack direction="row" spacing={1} sx={{ mt: 3, overflowX: "auto", pb: 0.5 }}>
          {PROGRESS_STATUSES.map((status, index) => (
            <Chip
              key={status}
              label={ORDER_STATUS_LABELS[status]}
              color={index <= currentStep ? "primary" : "default"}
              variant={index <= currentStep ? "filled" : "outlined"}
              size="small"
            />
          ))}
        </Stack>
      )}

      <Divider sx={{ my: 3 }} />
      <Stack spacing={1.25}>
        <Stack direction="row" sx={{ justifyContent: "space-between", gap: 2 }}>
          <Typography color="text.secondary">Pickup time</Typography>
          <Typography sx={{ fontWeight: 750, textAlign: "right" }}>
            {formatShopDateTime(order.pickupTime)}
          </Typography>
        </Stack>
        <Stack direction="row" sx={{ justifyContent: "space-between", gap: 2 }}>
          <Typography color="text.secondary">Items</Typography>
          <Typography sx={{ fontWeight: 750 }}>
            {order.items.reduce((total, item) => total + item.quantity, 0)}
          </Typography>
        </Stack>
        <Stack direction="row" sx={{ justifyContent: "space-between", gap: 2 }}>
          <Typography color="text.secondary">Payment</Typography>
          <Typography sx={{ fontWeight: 750 }}>
            {order.paymentStatus === "PAID" ? "Paid" : "Pay at shop"}
          </Typography>
        </Stack>
        <Stack direction="row" sx={{ justifyContent: "space-between", gap: 2 }}>
          <Typography variant="h6">Total</Typography>
          <Typography variant="h6" color="primary" sx={{ fontWeight: 900 }}>
            {formatRupees(order.totalAmount)}
          </Typography>
        </Stack>
      </Stack>
    </Paper>
  );
};

export const OrderTrackingPage = () => {
  const trackingMutation = useMutation({ mutationFn: trackOrder });
  const {
    formState: { errors },
    handleSubmit,
    register,
  } = useForm<OrderTrackingValues>({
    resolver: zodResolver(orderTrackingSchema),
    defaultValues: { orderNumber: "", customerMobile: "" },
  });
  const submitError =
    trackingMutation.error instanceof ApiClientError
      ? trackingMutation.error.message
      : trackingMutation.isError
        ? "We could not find that order. Check the details and try again."
        : null;

  const submitTracking = async (values: OrderTrackingValues) => {
    const parsedValues = orderTrackingSchema.parse(values);

    try {
      await trackingMutation.mutateAsync(parsedValues);
    } catch {
      // The mutation state renders the API's safe error message below.
    }
  };

  return (
    <>
      <SiteHeader />
      <Box component="main" sx={{ py: { xs: 5, md: 8 }, minHeight: "calc(100vh - 82px)" }}>
        <Container maxWidth="md">
          <Box sx={{ maxWidth: 620, mb: 4 }}>
            <Typography variant="overline" color="secondary.dark">
              Pickup status
            </Typography>
            <Typography component="h1" variant="h3">
              Track your order
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              Enter the order number and mobile number used when the pickup order was placed.
            </Typography>
          </Box>

          <Paper
            component="form"
            noValidate
            variant="outlined"
            onSubmit={(event) => void handleSubmit(submitTracking)(event)}
            sx={{ p: { xs: 3, md: 4 }, mb: 3 }}
          >
            <Stack spacing={2}>
              {submitError && <Alert severity="error">{submitError}</Alert>}
              <TextField
                label="Order number"
                placeholder="SIC-20260821-0001"
                autoComplete="off"
                {...register("orderNumber")}
                error={Boolean(errors.orderNumber)}
                helperText={errors.orderNumber?.message}
              />
              <TextField
                label="Mobile number"
                placeholder="9876543210"
                autoComplete="tel"
                inputMode="tel"
                {...register("customerMobile")}
                error={Boolean(errors.customerMobile)}
                helperText={errors.customerMobile?.message}
              />
              <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={trackingMutation.isPending}
                startIcon={
                  trackingMutation.isPending ? (
                    <CircularProgress size={18} />
                  ) : (
                    <SearchRoundedIcon />
                  )
                }
              >
                {trackingMutation.isPending ? "Checking…" : "Track order"}
              </Button>
            </Stack>
          </Paper>

          {trackingMutation.data && <TrackingResult order={trackingMutation.data} />}
        </Container>
      </Box>
    </>
  );
};
