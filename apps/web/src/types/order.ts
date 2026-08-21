export interface OrderItem {
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  customerName: string;
  customerMobile: string;
  items: OrderItem[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  paymentMethod: "PAY_AT_SHOP";
  paymentStatus: "PENDING" | "PAID";
  status: "PLACED" | "CONFIRMED" | "PREPARING" | "READY" | "COMPLETED" | "CANCELLED";
  pickupTime: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}
