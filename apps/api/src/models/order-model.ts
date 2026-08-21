import { Schema, Types, model } from "mongoose";

import { ORDER_STATUSES } from "../types/order.js";

const orderItemSchema = new Schema(
  {
    productId: { type: Types.ObjectId, ref: "Product", required: true },
    variantId: { type: Types.ObjectId, required: true },
    productName: { type: String, required: true, trim: true, maxlength: 150 },
    variantName: { type: String, required: true, trim: true, maxlength: 80 },
    sku: { type: String, required: true, uppercase: true, trim: true, maxlength: 80 },
    unitPrice: { type: Number, required: true, min: 0, validate: Number.isInteger },
    quantity: { type: Number, required: true, min: 1, validate: Number.isInteger },
    lineTotal: { type: Number, required: true, min: 0, validate: Number.isInteger },
  },
  { _id: false },
);

const orderSchema = new Schema(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      maxlength: 40,
    },
    customerName: { type: String, required: true, trim: true, maxlength: 100 },
    customerMobile: { type: String, required: true, trim: true, maxlength: 13 },
    items: {
      type: [orderItemSchema],
      required: true,
      validate: {
        validator: (items: unknown[]) => items.length > 0,
        message: "At least one order item is required",
      },
    },
    subtotal: { type: Number, required: true, min: 0, validate: Number.isInteger },
    taxAmount: { type: Number, required: true, min: 0, validate: Number.isInteger },
    totalAmount: { type: Number, required: true, min: 0, validate: Number.isInteger },
    paymentMethod: {
      type: String,
      enum: ["PAY_AT_SHOP"],
      required: true,
      default: "PAY_AT_SHOP",
    },
    paymentStatus: {
      type: String,
      enum: ["PENDING", "PAID"],
      required: true,
      default: "PENDING",
    },
    status: {
      type: String,
      enum: ORDER_STATUSES,
      required: true,
      default: "PLACED",
    },
    pickupTime: { type: Date, required: true, index: true },
    notes: { type: String, trim: true, maxlength: 500, default: "" },
  },
  { timestamps: true },
);

orderSchema.index({ customerMobile: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });

export const OrderModel = model("Order", orderSchema);
