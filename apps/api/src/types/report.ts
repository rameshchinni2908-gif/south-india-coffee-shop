import type { OrderStatus } from "./order.js";

export interface DateRange {
  start: Date;
  end: Date;
}

export interface SalesSummary {
  orderCount: number;
  salesTotal: number;
  itemsSold: number;
}

export interface OrderStatusCount {
  status: OrderStatus;
  count: number;
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

export interface LowStockOverview {
  total: number;
  variants: LowStockVariant[];
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
  changedAt: Date;
}

export interface DashboardSummary {
  generatedAt: Date;
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
