import { Schema, Types, model } from "mongoose";

const priceHistorySchema = new Schema(
  {
    productId: {
      type: Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    variantId: {
      type: Types.ObjectId,
      required: true,
    },
    variantSku: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    oldPrice: {
      type: Number,
      required: true,
      min: 0,
      validate: Number.isInteger,
    },
    newPrice: {
      type: Number,
      required: true,
      min: 0,
      validate: Number.isInteger,
    },
    changedBy: {
      type: Types.ObjectId,
      ref: "User",
      required: true,
    },
    changedAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: false,
    versionKey: false,
  },
);

priceHistorySchema.index({ productId: 1, changedAt: -1 });

export const PriceHistoryModel = model("PriceHistory", priceHistorySchema);
