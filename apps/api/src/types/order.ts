import type { PaginatedResult } from "./catalog.js";

export const ORDER_STATUSES = [
  "PLACED",
  "CONFIRMED",
  "PREPARING",
  "READY",
  "COMPLETED",
  "CANCELLED",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface OrderItemRecord {
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface OrderRecord {
  id: string;
  orderNumber: string;
  customerName: string;
  customerMobile: string;
  items: OrderItemRecord[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  paymentMethod: "PAY_AT_SHOP";
  paymentStatus: "PENDING" | "PAID";
  status: OrderStatus;
  pickupTime: Date;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

export type NewOrderRecord = Omit<OrderRecord, "id" | "createdAt" | "updatedAt">;

export interface OrderListFilters {
  page: number;
  limit: number;
  search?: string;
  status?: OrderStatus;
  sortBy: "createdAt" | "pickupTime";
  sortOrder: "asc" | "desc";
}

export type OrderListResult = PaginatedResult<OrderRecord>;
