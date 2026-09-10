import AddRoundedIcon from "@mui/icons-material/AddRounded";
import RemoveRoundedIcon from "@mui/icons-material/RemoveRounded";
import { Box, Button, IconButton, Stack, Typography } from "@mui/material";
import { useEffect, useId } from "react";

import { formatRupees } from "../../lib/currency.js";
import type { Product, ProductVariant } from "../../types/catalog.js";
import { MAX_CART_ITEM_QUANTITY } from "../cart/cart-context.js";
import { useCart } from "../cart/use-cart.js";

export const ProductVariantControl = ({
  product,
  variant,
}: {
  product: Product;
  variant: ProductVariant;
}) => {
  const { items, addItem, updateQuantity, syncItem } = useCart();
  const statusId = useId();
  const quantity = items.find((item) => item.variantId === variant.id)?.quantity ?? 0;
  const stock = variant.isAvailable ? variant.stockQuantity : 0;
  const limit = Math.min(stock, MAX_CART_ITEM_QUANTITY);
  const label = `${product.name} ${variant.name}`;
  const item = {
    productId: product.id,
    productName: product.name,
    variantId: variant.id,
    variantName: variant.name,
    sku: variant.sku,
    unitPrice: variant.price,
    stockQuantity: stock,
  };

  useEffect(() => {
    syncItem({
      productId: product.id,
      productName: product.name,
      variantId: variant.id,
      variantName: variant.name,
      sku: variant.sku,
      unitPrice: variant.price,
      stockQuantity: stock,
    });
  }, [
    product.id,
    product.name,
    variant.id,
    variant.name,
    variant.sku,
    variant.price,
    stock,
    syncItem,
  ]);

  const stockMessage =
    stock === 0
      ? variant.stockQuantity === 0
        ? "Out of stock"
        : "Currently unavailable"
      : quantity > stock
        ? `Only ${stock} available. Reduce your quantity.`
        : quantity >= limit
          ? stock <= MAX_CART_ITEM_QUANTITY
            ? `All ${stock} available added`
            : `Limit of ${MAX_CART_ITEM_QUANTITY} per order`
          : stock <= product.lowStockThreshold
            ? `Only ${stock} available`
            : "Available";

  return (
    <Box
      role="group"
      aria-label={label}
      sx={{
        p: 1.5,
        borderRadius: 2.5,
        border: "1px solid",
        borderColor: quantity > 0 ? "primary.light" : "divider",
        bgcolor: quantity > 0 ? "rgba(111, 50, 25, 0.045)" : "background.paper",
        transition: "background-color 180ms ease, border-color 180ms ease",
        "@media (prefers-reduced-motion: reduce)": { transition: "none" },
      }}
    >
      <Stack
        direction="row"
        sx={{ justifyContent: "space-between", alignItems: "baseline", gap: 1 }}
      >
        <Typography variant="body2" sx={{ fontWeight: 750 }}>
          {variant.name}
        </Typography>
        <Typography variant="body2" sx={{ fontWeight: 850 }}>
          {formatRupees(variant.price)}
        </Typography>
      </Stack>
      <Typography
        id={statusId}
        variant="caption"
        aria-live="polite"
        sx={{
          display: "block",
          mt: 0.5,
          mb: 1.25,
          color:
            stock === 0 || quantity > stock
              ? "error.main"
              : quantity >= limit
                ? "primary.main"
                : "text.secondary",
        }}
      >
        {stockMessage}
        {stock === 0 && quantity > 0 ? ". Remove from your cart to continue." : ""}
      </Typography>
      {quantity > 0 ? (
        <Stack
          direction="row"
          sx={{ alignItems: "center", justifyContent: "space-between", gap: 1 }}
        >
          <Typography variant="body2" color="primary.main" sx={{ fontWeight: 750 }}>
            In your cart
          </Typography>
          <Stack
            direction="row"
            sx={{
              alignItems: "center",
              borderRadius: 2,
              border: "1px solid",
              borderColor: "primary.main",
              bgcolor: "background.paper",
              flexShrink: 0,
            }}
          >
            <IconButton
              color="primary"
              aria-label={`Decrease ${label} quantity`}
              onClick={() => updateQuantity(variant.id, quantity - 1)}
              sx={{ width: 44, height: 44 }}
            >
              <RemoveRoundedIcon />
            </IconButton>
            <Typography
              component="output"
              aria-label={`${label} quantity in cart`}
              aria-live="polite"
              sx={{
                minWidth: 28,
                textAlign: "center",
                fontWeight: 850,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {quantity}
            </Typography>
            <IconButton
              color="primary"
              aria-label={`Increase ${label} quantity`}
              aria-describedby={statusId}
              disabled={quantity >= limit}
              onClick={() => addItem(item)}
              sx={{ width: 44, height: 44 }}
            >
              <AddRoundedIcon />
            </IconButton>
          </Stack>
        </Stack>
      ) : (
        <Button
          variant="outlined"
          fullWidth
          disabled={stock === 0}
          startIcon={stock > 0 ? <AddRoundedIcon /> : undefined}
          aria-label={stock > 0 ? `Add ${label} to cart` : `${label} ${stockMessage.toLowerCase()}`}
          aria-describedby={statusId}
          onClick={() => addItem(item)}
          sx={{ minHeight: 44 }}
        >
          {stock > 0 ? "Add" : "Unavailable"}
        </Button>
      )}
    </Box>
  );
};
