import type { OrderStatus } from "../features/orders/order-status.js";

export interface SalesSummary {
  orderCount: number;
  salesTotal: number;
  itemsSold: number;
}

export interface LowStockVariant {
  productId: string;
  productName: string;
  productSlug: string;
  variantId: string;
  variantName: string;
  sku: string;
  stockQuantity: number;
  lowStockThreshold: number;
  isAvailable: boolean;
}

export interface RecentPriceChange {
  id: string;
  productId: string;
  productName: string;
  variantId: string;
  variantSku: string;
  oldPrice: number;
  newPrice: number;
  changedBy: string;
  changedByName: string;
  changedAt: string;
}

export interface DashboardSummary {
  generatedAt: string;
  timezone: string;
  today: SalesSummary & {
    totalOrders: number;
    statusCounts: Record<OrderStatus, number>;
  };
  month: SalesSummary;
  lowStockTotal: number;
  lowStockVariants: LowStockVariant[];
  recentPriceChanges: RecentPriceChange[];
}
