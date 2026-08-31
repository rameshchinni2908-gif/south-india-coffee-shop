import { Schema, Types, model } from "mongoose";

const productVariantSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    sku: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      maxlength: 80,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
      validate: Number.isInteger,
    },
    stockQuantity: {
      type: Number,
      required: true,
      min: 0,
      validate: Number.isInteger,
    },
    isAvailable: {
      type: Boolean,
      required: true,
      default: true,
    },
  },
  { _id: true, id: false },
);

const productSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 170,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1_000,
    },
    categoryId: {
      type: Types.ObjectId,
      ref: "Category",
      required: true,
      index: true,
    },
    imageUrl: {
      type: String,
      trim: true,
      maxlength: 2_048,
      default: "",
    },
    isVegetarian: {
      type: Boolean,
      required: true,
      default: true,
    },
    variants: {
      type: [productVariantSchema],
      required: true,
      validate: {
        validator: (variants: unknown[]) => variants.length > 0,
        message: "At least one product variant is required",
      },
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true,
    },
    isArchived: {
      type: Boolean,
      required: true,
      default: false,
      index: true,
    },
    archivedAt: {
      type: Date,
      default: null,
    },
    archivedBy: {
      type: Types.ObjectId,
      ref: "User",
      default: null,
    },
    lowStockThreshold: {
      type: Number,
      required: true,
      min: 0,
      default: 5,
      validate: Number.isInteger,
    },
  },
  { timestamps: true },
);

productSchema.index({ "variants.sku": 1 }, { unique: true });
productSchema.index({ isActive: 1, isArchived: 1, categoryId: 1 });
productSchema.index({ name: 1 });

export const ProductModel = model("Product", productSchema);
