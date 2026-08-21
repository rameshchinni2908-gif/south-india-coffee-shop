import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import { Box, Button, Chip, Container, Divider, Paper, Stack, Typography } from "@mui/material";
import { Link, useLocation, useParams } from "react-router-dom";

import { SiteHeader } from "../../components/SiteHeader.js";
import { formatRupees } from "../../lib/currency.js";
import type { Order } from "../../types/order.js";
import { readOrderConfirmation } from "./confirmation-storage.js";

const formatPickupTime = (value: string): string =>
  new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

export const OrderConfirmationPage = () => {
  const { orderNumber = "" } = useParams();
  const location = useLocation();
  const state = location.state as { order?: Order } | null;
  const order =
    state?.order?.orderNumber === orderNumber ? state.order : readOrderConfirmation(orderNumber);

  return (
    <>
      <SiteHeader />
      <Box component="main" sx={{ py: { xs: 5, md: 9 }, minHeight: "calc(100vh - 82px)" }}>
        <Container maxWidth="sm">
          {!order ? (
            <Paper variant="outlined" sx={{ p: { xs: 3, md: 5 }, textAlign: "center" }}>
              <Typography component="h1" variant="h4">
                Confirmation unavailable
              </Typography>
              <Typography color="text.secondary" sx={{ mt: 1.5, mb: 3 }}>
                This confirmation is stored only on the device that placed the order.
              </Typography>
              <Button component={Link} to="/" variant="contained">
                Return to menu
              </Button>
            </Paper>
          ) : (
            <Paper
              elevation={0}
              sx={{
                p: { xs: 3, md: 5 },
                textAlign: "center",
                border: "1px solid",
                borderColor: "rgba(40, 115, 79, 0.22)",
                boxShadow: "0 22px 65px rgba(74, 37, 20, 0.1)",
              }}
            >
              <CheckCircleRoundedIcon color="success" sx={{ fontSize: 72 }} />
              <Typography component="h1" variant="h3" sx={{ mt: 2 }}>
                Order placed
              </Typography>
              <Typography color="text.secondary" sx={{ mt: 1 }}>
                Thanks, {order.customerName}. The shop has received your pickup order.
              </Typography>
              <Chip label={order.status} color="success" variant="outlined" sx={{ mt: 2 }} />

              <Stack spacing={1.5} sx={{ mt: 4, textAlign: "left" }}>
                <Stack direction="row" sx={{ justifyContent: "space-between", gap: 2 }}>
                  <Typography color="text.secondary">Order number</Typography>
                  <Typography sx={{ fontWeight: 850 }}>{order.orderNumber}</Typography>
                </Stack>
                <Stack direction="row" sx={{ justifyContent: "space-between", gap: 2 }}>
                  <Typography color="text.secondary">Pickup time</Typography>
                  <Typography sx={{ fontWeight: 750, textAlign: "right" }}>
                    {formatPickupTime(order.pickupTime)}
                  </Typography>
                </Stack>
                <Stack direction="row" sx={{ justifyContent: "space-between", gap: 2 }}>
                  <Typography color="text.secondary">Payment</Typography>
                  <Typography sx={{ fontWeight: 750 }}>Pay at shop</Typography>
                </Stack>
                <Divider />
                <Stack direction="row" sx={{ justifyContent: "space-between", gap: 2 }}>
                  <Typography variant="h6">Total</Typography>
                  <Typography variant="h6" color="primary" sx={{ fontWeight: 900 }}>
                    {formatRupees(order.totalAmount)}
                  </Typography>
                </Stack>
              </Stack>

              <Button component={Link} to="/" variant="contained" sx={{ mt: 4 }}>
                Back to menu
              </Button>
            </Paper>
          )}
        </Container>
      </Box>
    </>
  );
};
