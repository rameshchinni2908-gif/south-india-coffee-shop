import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import LocalCafeOutlinedIcon from "@mui/icons-material/LocalCafeOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import TrendingUpRoundedIcon from "@mui/icons-material/TrendingUpRounded";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  Divider,
  LinearProgress,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { formatRupees } from "../../../lib/currency.js";
import { formatShopDateTime } from "../../orders/order-format.js";
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  type OrderStatus,
} from "../../orders/order-status.js";
import { dashboardQuery } from "./dashboard-query.js";

const MetricCard = ({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
}) => (
  <Card variant="outlined" sx={{ height: "100%" }}>
    <CardContent sx={{ p: 3 }}>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <Box>
          <Typography variant="overline" color="text.secondary">
            {label}
          </Typography>
          <Typography variant="h4" sx={{ mt: 0.5, fontWeight: 900 }}>
            {value}
          </Typography>
        </Box>
        <Box
          sx={{
            width: 46,
            height: 46,
            borderRadius: 3,
            display: "grid",
            placeItems: "center",
            bgcolor: "rgba(111, 50, 25, 0.09)",
            color: "primary.main",
          }}
        >
          {icon}
        </Box>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
        {detail}
      </Typography>
    </CardContent>
  </Card>
);

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

const DashboardLoading = () => (
  <Stack spacing={3} aria-label="Loading dashboard">
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" },
        gap: 2,
      }}
    >
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} variant="rounded" height={170} />
      ))}
    </Box>
    <Skeleton variant="rounded" height={320} />
  </Stack>
);

export const AdminDashboardPage = () => {
  const summaryQuery = useQuery(dashboardQuery);
  const summary = summaryQuery.data;

  return (
    <Box component="main" sx={{ py: { xs: 4, md: 6 } }}>
      <Container maxWidth="xl">
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          sx={{ justifyContent: "space-between", alignItems: { md: "flex-end" }, mb: 4 }}
        >
          <Box>
            <Typography variant="overline" color="secondary.dark">
              Shop overview
            </Typography>
            <Typography component="h1" variant="h3">
              Dashboard
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 0.75 }}>
              Sales count completed pay-at-shop orders. Times use the configured shop timezone.
            </Typography>
          </Box>
          <Button
            component={Link}
            to="/admin/orders"
            variant="contained"
            endIcon={<ArrowForwardRoundedIcon />}
          >
            Open order queue
          </Button>
        </Stack>

        {summaryQuery.isPending && <DashboardLoading />}
        {summaryQuery.isError && (
          <Alert
            severity="error"
            action={<Button onClick={() => void summaryQuery.refetch()}>Try again</Button>}
          >
            Dashboard data could not be loaded.
          </Alert>
        )}

        {summary && (
          <Stack spacing={3}>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr",
                  sm: "repeat(2, 1fr)",
                  lg: "repeat(4, 1fr)",
                },
                gap: 2,
              }}
            >
              <MetricCard
                label="Today's orders"
                value={String(summary.today.totalOrders)}
                detail={`${summary.today.itemsSold} item(s) sold in completed orders`}
                icon={<ReceiptLongOutlinedIcon />}
              />
              <MetricCard
                label="Today's sales"
                value={formatRupees(summary.today.salesTotal)}
                detail={`${summary.today.orderCount} completed order(s)`}
                icon={<PaymentsOutlinedIcon />}
              />
              <MetricCard
                label="This month's sales"
                value={formatRupees(summary.month.salesTotal)}
                detail={`${summary.month.orderCount} completed order(s) · ${summary.month.itemsSold} items`}
                icon={<TrendingUpRoundedIcon />}
              />
              <MetricCard
                label="Low-stock variants"
                value={String(summary.lowStockTotal)}
                detail="Active variants at or below their stock threshold"
                icon={<Inventory2OutlinedIcon />}
              />
            </Box>

            <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 3 } }}>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={2}
                sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}
              >
                <Box>
                  <Typography component="h2" variant="h5">
                    Today's order activity
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    New orders grouped by their current status
                  </Typography>
                </Box>
                <Chip label={summary.timezone} variant="outlined" size="small" />
              </Stack>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "repeat(2, 1fr)", md: "repeat(6, 1fr)" },
                  gap: 1.5,
                  mt: 3,
                }}
              >
                {ORDER_STATUSES.map((status) => (
                  <Box
                    key={status}
                    sx={{ p: 2, borderRadius: 3, bgcolor: "rgba(111, 50, 25, 0.045)" }}
                  >
                    <Chip
                      label={ORDER_STATUS_LABELS[status]}
                      color={statusColor(status)}
                      size="small"
                    />
                    <Typography variant="h4" sx={{ mt: 1.5, fontWeight: 900 }}>
                      {summary.today.statusCounts[status]}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Paper>

            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", lg: "minmax(0, .9fr) minmax(0, 1.1fr)" },
                gap: 3,
                alignItems: "start",
              }}
            >
              <Paper variant="outlined" sx={{ overflow: "hidden" }}>
                <Stack
                  direction="row"
                  sx={{ justifyContent: "space-between", alignItems: "center", p: 3 }}
                >
                  <Box>
                    <Typography component="h2" variant="h5">
                      Low stock
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Lowest quantities appear first
                      {summary.lowStockTotal > summary.lowStockVariants.length
                        ? ` · Showing ${summary.lowStockVariants.length} of ${summary.lowStockTotal}`
                        : ""}
                    </Typography>
                  </Box>
                  <Button component={Link} to="/admin/products" size="small">
                    Manage
                  </Button>
                </Stack>
                <Divider />
                {summary.lowStockVariants.length === 0 ? (
                  <Alert severity="success" sx={{ m: 2 }}>
                    No active products are below their stock threshold.
                  </Alert>
                ) : (
                  <Stack divider={<Divider flexItem />}>
                    {summary.lowStockVariants.map((variant) => {
                      const stockProgress =
                        variant.lowStockThreshold === 0
                          ? variant.stockQuantity === 0
                            ? 0
                            : 100
                          : Math.min(
                              100,
                              (variant.stockQuantity / variant.lowStockThreshold) * 100,
                            );

                      return (
                        <Box key={variant.variantId} sx={{ p: 2.5 }}>
                          <Stack direction="row" sx={{ justifyContent: "space-between", gap: 2 }}>
                            <Box>
                              <Typography sx={{ fontWeight: 850 }}>
                                {variant.productName}
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                {variant.variantName} · {variant.sku}
                              </Typography>
                            </Box>
                            <Chip
                              label={`${variant.stockQuantity} left`}
                              color={variant.stockQuantity === 0 ? "error" : "warning"}
                              size="small"
                            />
                          </Stack>
                          <LinearProgress
                            variant="determinate"
                            value={stockProgress}
                            color={variant.stockQuantity === 0 ? "error" : "warning"}
                            sx={{ mt: 1.5, height: 7, borderRadius: 999 }}
                          />
                          <Typography variant="caption" color="text.secondary">
                            Alert threshold: {variant.lowStockThreshold}
                            {!variant.isAvailable ? " · Marked unavailable" : ""}
                          </Typography>
                        </Box>
                      );
                    })}
                  </Stack>
                )}
              </Paper>

              <Paper variant="outlined" sx={{ overflow: "hidden" }}>
                <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", p: 3 }}>
                  <LocalCafeOutlinedIcon color="primary" />
                  <Box>
                    <Typography component="h2" variant="h5">
                      Recent price history
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Latest recorded variant price changes
                    </Typography>
                  </Box>
                </Stack>
                <Divider />
                {summary.recentPriceChanges.length === 0 ? (
                  <Alert severity="info" sx={{ m: 2 }}>
                    Price changes will appear here after a product price is updated.
                  </Alert>
                ) : (
                  <TableContainer>
                    <Table size="small" aria-label="Recent price history">
                      <TableHead>
                        <TableRow>
                          <TableCell>Product</TableCell>
                          <TableCell>Price change</TableCell>
                          <TableCell>Changed by</TableCell>
                          <TableCell>Time</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {summary.recentPriceChanges.map((change) => (
                          <TableRow key={change.id}>
                            <TableCell>
                              <Typography variant="body2" sx={{ fontWeight: 800 }}>
                                {change.productName}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {change.variantSku}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
                                <Typography variant="body2" color="text.secondary">
                                  {formatRupees(change.oldPrice)}
                                </Typography>
                                <ArrowForwardRoundedIcon fontSize="small" />
                                <Typography variant="body2" sx={{ fontWeight: 850 }}>
                                  {formatRupees(change.newPrice)}
                                </Typography>
                              </Stack>
                            </TableCell>
                            <TableCell>{change.changedByName}</TableCell>
                            <TableCell sx={{ whiteSpace: "nowrap" }}>
                              {formatShopDateTime(change.changedAt)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </Paper>
            </Box>
          </Stack>
        )}
      </Container>
    </Box>
  );
};
