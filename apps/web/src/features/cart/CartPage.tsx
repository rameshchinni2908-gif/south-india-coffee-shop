import AddRoundedIcon from "@mui/icons-material/AddRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import RemoveRoundedIcon from "@mui/icons-material/RemoveRounded";
import ShoppingBagOutlinedIcon from "@mui/icons-material/ShoppingBagOutlined";
import {
  Box,
  Button,
  Container,
  Divider,
  IconButton,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { Link } from "react-router-dom";

import { SiteHeader } from "../../components/SiteHeader.js";
import { formatRupees } from "../../lib/currency.js";
import { CheckoutForm } from "../checkout/CheckoutForm.js";
import { useCart } from "./use-cart.js";

export const CartPage = () => {
  const { items, subtotal, updateQuantity, removeItem } = useCart();

  return (
    <>
      <SiteHeader />
      <Box component="main" sx={{ py: { xs: 5, md: 8 }, minHeight: "calc(100vh - 82px)" }}>
        <Container maxWidth="lg">
          <Stack spacing={1} sx={{ mb: 4 }}>
            <Typography component="h1" variant="h3">
              Your pickup order
            </Typography>
            <Typography color="text.secondary">
              Review quantities and tell us when you would like to collect it.
            </Typography>
          </Stack>

          {items.length === 0 ? (
            <Paper
              variant="outlined"
              sx={{ p: { xs: 4, md: 7 }, textAlign: "center", borderStyle: "dashed" }}
            >
              <ShoppingBagOutlinedIcon color="primary" sx={{ fontSize: 58 }} />
              <Typography component="h2" variant="h5" sx={{ mt: 2, fontWeight: 850 }}>
                Your cart is empty
              </Typography>
              <Typography color="text.secondary" sx={{ mt: 1, mb: 3 }}>
                Add an available size from today’s menu to begin your pickup order.
              </Typography>
              <Button component={Link} to="/" variant="contained">
                Browse the menu
              </Button>
            </Paper>
          ) : (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1.25fr) minmax(330px, .75fr)" },
                gap: 3,
                alignItems: "start",
              }}
            >
              <Stack spacing={2}>
                {items.map((item) => (
                  <Paper key={item.variantId} variant="outlined" sx={{ p: { xs: 2, sm: 2.5 } }}>
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      spacing={2}
                      sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}
                    >
                      <Box>
                        <Typography component="h2" variant="h6" sx={{ fontWeight: 850 }}>
                          {item.productName}
                        </Typography>
                        <Typography color="text.secondary" variant="body2">
                          {item.variantName} · {item.sku}
                        </Typography>
                        <Typography sx={{ mt: 0.75, fontWeight: 750 }}>
                          {formatRupees(item.unitPrice)} each
                        </Typography>
                      </Box>
                      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                        <IconButton
                          size="small"
                          onClick={() => updateQuantity(item.variantId, item.quantity - 1)}
                          aria-label={`Decrease ${item.productName} ${item.variantName} quantity`}
                        >
                          <RemoveRoundedIcon />
                        </IconButton>
                        <Typography
                          aria-live="polite"
                          sx={{ minWidth: 32, textAlign: "center", fontWeight: 850 }}
                        >
                          {item.quantity}
                        </Typography>
                        <IconButton
                          size="small"
                          disabled={item.quantity >= item.stockQuantity}
                          onClick={() => updateQuantity(item.variantId, item.quantity + 1)}
                          aria-label={`Increase ${item.productName} ${item.variantName} quantity`}
                        >
                          <AddRoundedIcon />
                        </IconButton>
                        <IconButton
                          color="error"
                          onClick={() => removeItem(item.variantId)}
                          aria-label={`Remove ${item.productName} ${item.variantName} from cart`}
                        >
                          <DeleteOutlineRoundedIcon />
                        </IconButton>
                      </Stack>
                    </Stack>
                  </Paper>
                ))}
                <Button component={Link} to="/" sx={{ alignSelf: "flex-start" }}>
                  ← Continue browsing
                </Button>
              </Stack>

              <Paper
                elevation={0}
                sx={{
                  p: { xs: 2.5, sm: 3 },
                  border: "1px solid",
                  borderColor: "rgba(91, 50, 29, 0.14)",
                  boxShadow: "0 18px 50px rgba(74, 37, 20, 0.08)",
                }}
              >
                <Stack direction="row" sx={{ justifyContent: "space-between" }}>
                  <Typography color="text.secondary">Estimated subtotal</Typography>
                  <Typography sx={{ fontWeight: 850 }}>{formatRupees(subtotal)}</Typography>
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  Tax, if configured by the shop, is calculated by the server.
                </Typography>
                <Divider sx={{ my: 2.5 }} />
                <CheckoutForm items={items} />
              </Paper>
            </Box>
          )}
        </Container>
      </Box>
    </>
  );
};
