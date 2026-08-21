import { zodResolver } from "@hookform/resolvers/zod";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import { Alert, Button, CircularProgress, Stack, TextField, Typography } from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";

import { ApiClientError } from "../../lib/api-client.js";
import type { CartItem } from "../cart/cart-context.js";
import { useCart } from "../cart/use-cart.js";
import {
  checkoutFormSchema,
  toPickupIso,
  toShopDateTimeInput,
  type CheckoutFormValues,
} from "./checkout-schema.js";
import { saveOrderConfirmation } from "./confirmation-storage.js";
import { createOrder } from "./order-api.js";

interface CheckoutFormProps {
  items: CartItem[];
}

export const CheckoutForm = ({ items }: CheckoutFormProps) => {
  const navigate = useNavigate();
  const { clearCart } = useCart();
  const [checkoutStartedAt] = useState(() => Date.now());
  const earliestPickupTime = useMemo(
    () => toShopDateTimeInput(new Date(checkoutStartedAt + 15 * 60 * 1000)),
    [checkoutStartedAt],
  );
  const defaultPickupTime = useMemo(
    () => toShopDateTimeInput(new Date(checkoutStartedAt + 30 * 60 * 1000)),
    [checkoutStartedAt],
  );
  const {
    formState: { errors },
    handleSubmit,
    register,
  } = useForm<CheckoutFormValues>({
    resolver: zodResolver(checkoutFormSchema),
    defaultValues: {
      customerName: "",
      customerMobile: "",
      pickupTime: defaultPickupTime,
      notes: "",
    },
  });
  const orderMutation = useMutation({ mutationFn: createOrder });

  const submitOrder = async (values: CheckoutFormValues) => {
    try {
      const order = await orderMutation.mutateAsync({
        customerName: values.customerName,
        customerMobile: values.customerMobile,
        pickupTime: toPickupIso(values.pickupTime),
        notes: values.notes,
        items: items.map((item) => ({
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
        })),
      });

      saveOrderConfirmation(order);
      clearCart();
      navigate(`/order-confirmation/${order.orderNumber}`, { state: { order } });
    } catch {
      // The mutation state renders the API's safe error message without leaving the checkout page.
    }
  };
  const submitError =
    orderMutation.error instanceof ApiClientError
      ? orderMutation.error.message
      : orderMutation.isError
        ? "We could not place your order. Please try again."
        : null;

  return (
    <Stack
      component="form"
      noValidate
      spacing={2}
      onSubmit={(event) => void handleSubmit(submitOrder)(event)}
    >
      <Typography component="h2" variant="h5" sx={{ fontWeight: 850 }}>
        Pickup details
      </Typography>
      <Typography color="text.secondary" variant="body2">
        We’ll use these details only to prepare and identify this pickup order.
      </Typography>

      {submitError && <Alert severity="error">{submitError}</Alert>}

      <TextField
        label="Customer name"
        autoComplete="name"
        {...register("customerName")}
        error={Boolean(errors.customerName)}
        helperText={errors.customerName?.message}
      />
      <TextField
        label="Mobile number"
        autoComplete="tel"
        inputMode="tel"
        placeholder="9876543210"
        {...register("customerMobile")}
        error={Boolean(errors.customerMobile)}
        helperText={errors.customerMobile?.message ?? "Enter a 10-digit Indian mobile number"}
      />
      <TextField
        label="Expected pickup time"
        type="datetime-local"
        {...register("pickupTime")}
        error={Boolean(errors.pickupTime)}
        helperText={errors.pickupTime?.message ?? "Shop time: Asia/Kolkata"}
        slotProps={{
          inputLabel: { shrink: true },
          htmlInput: { min: earliestPickupTime },
        }}
      />
      <TextField
        label="Order notes (optional)"
        multiline
        minRows={3}
        placeholder="For example: less sugar"
        {...register("notes")}
        error={Boolean(errors.notes)}
        helperText={errors.notes?.message}
      />

      <Alert severity="info" icon={<AccessTimeRoundedIcon />}>
        Your final total is recalculated using current prices when the order is placed.
      </Alert>
      <Button
        type="submit"
        variant="contained"
        size="large"
        disabled={orderMutation.isPending}
        startIcon={orderMutation.isPending ? <CircularProgress size={18} /> : <LockOutlinedIcon />}
      >
        {orderMutation.isPending ? "Placing order…" : "Place pickup order"}
      </Button>
      <Typography variant="caption" color="text.secondary" sx={{ textAlign: "center" }}>
        No online payment. Pay at the shop when you collect your order.
      </Typography>
    </Stack>
  );
};
