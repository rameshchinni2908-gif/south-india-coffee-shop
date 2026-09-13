export interface KnowledgeDocument {
  id: string;
  title: string;
  content: string;
  keywords: string[];
}

// Curated application facts, not live shop data. Recheck the cited source when its behavior changes.
export const SHOP_KNOWLEDGE_DOCUMENTS: readonly KnowledgeDocument[] = [
  {
    id: "pickup-ordering",
    title: "Placing a pickup order",
    content:
      "Customers choose products and sizes on the menu, adjust quantities with the plus/minus controls, and open /cart to checkout. Checkout requires a customer name, Indian mobile number, and a pickup time in the future; notes are optional. No customer account is required. Each product size allows at most 20 units per order and the order allows at most 20 distinct product-size entries. The server rechecks current availability and stock, calculates the total, and saves the product names and prices with the order. Sold-out or unavailable sizes cannot be ordered. The application supports pickup, not delivery.",
    keywords: ["pickup", "checkout", "cart", "quantity", "place order", "delivery", "customer"],
  },
  {
    id: "payment-at-shop",
    title: "Payment at the shop",
    content:
      "Orders use PAY_AT_SHOP. The application does not collect online payments. A new order has payment status PENDING; completing the order changes payment status to PAID. The server calculates the payable total using current product prices and configured tax. Specific payment methods accepted at the counter, such as cash, card, or UPI, are not confirmed in this knowledge base; ask the shop owner before promising one. A saved order is not proof that payment was collected.",
    keywords: ["payment", "online", "cash", "card", "UPI", "pending", "paid", "tax"],
  },
  {
    id: "order-tracking",
    title: "Tracking a pickup order",
    content:
      "Customers open /track-order and enter the order number and the same mobile number used at checkout. Both must match the saved order. If no matching order is found, check the order number and checkout mobile number. The tracking page shows the order's current status. Tracking does not require a customer account and does not change the order. Staff can search and filter the order queue at /admin/orders after signing in.",
    keywords: ["track", "progress", "order number", "mobile", "status", "order queue"],
  },
  {
    id: "order-status-stock",
    title: "Order status, cancellation, and stock changes",
    content:
      "Staff process orders at /admin/orders through PLACED -> CONFIRMED -> PREPARING -> READY -> COMPLETED. Only PLACED and CONFIRMED orders can move to CANCELLED. PREPARING and READY cannot be cancelled through the current workflow; COMPLETED and CANCELLED are final. Checkout validates stock, but stock is reduced only when staff confirm an order. Confirmation checks stock again and can fail if insufficient stock remains. Cancelling a CONFIRMED order restores its stock atomically. Cancelling a PLACED order does not restore stock because that order has not reduced it. The assistant explains this flow; these notes do not grant it permission to change orders.",
    keywords: ["order", "status", "cancel", "confirm", "prepare", "ready", "complete", "stock"],
  },
  {
    id: "product-management",
    title: "Managing products, prices, and availability",
    content:
      "Sign in and open /admin/products to create or edit products, categories, sizes, prices, stock quantities, and availability. ADMIN and STAFF can perform these catalog updates. Set stock and availability for the relevant size; adding stock alone does not enable a size whose availability is turned off. The customer menu shows active, nonarchived products from active categories. All items includes sold-out products with ordering disabled; Available now filters them out. An orderable size must have availability enabled and stock greater than zero. Existing variant price changes create price-history records. Only ADMIN can archive products. Archiving preserves historical orders and their saved prices.",
    keywords: [
      "product",
      "price",
      "category",
      "variant",
      "size",
      "availability",
      "restock",
      "archive",
      "soldout",
    ],
  },
  {
    id: "staff-permissions",
    title: "Staff accounts and administrator permissions",
    content:
      "Active ADMIN and STAFF accounts can sign in, manage products and stock, and process orders. Only ADMIN can archive products, manage staff accounts, and use the admin shop assistant. At /admin/staff an administrator can create ADMIN or STAFF accounts, edit names and email addresses, reset passwords, and activate or deactivate access. An administrator cannot deactivate their own account or change their own role. Customer checkout and order tracking do not require a staff account. Passwords and private credentials are not part of the assistant's knowledge.",
    keywords: ["staff", "admin", "role", "permission", "account", "login", "password", "access"],
  },
  {
    id: "sales-report-semantics",
    title: "Understanding daily orders and sales reports",
    content:
      "The dashboard's daily order total and status counts include orders created during that shop-calendar day, grouped by their current status. Sales include only orders currently COMPLETED whose updatedAt falls in the report period; an order created on an earlier day can contribute to today's sales. These are different groups: do not subtract completed-sales order count from today's created-order total to calculate pending orders. Sales are revenue, not profit. Daily and monthly boundaries use the configured SHOP_TIMEZONE. Stored money is integer paise; 100 paise equals one rupee. Knowledge notes contain no current sales figures; use the live shop summary for today's values.",
    keywords: [
      "sales",
      "report",
      "revenue",
      "profit",
      "dashboard",
      "statistics",
      "total",
      "paise",
      "timezone",
    ],
  },
  {
    id: "low-stock-report-semantics",
    title: "Understanding the low-stock report",
    content:
      "Low stock means a product size's stockQuantity is less than or equal to that product's lowStockThreshold. The report checks active, nonarchived products and includes sizes even if their availability is turned off. This report does not separately filter category activity. Its total counts low-stock sizes, not distinct products. The displayed list contains at most 10 sizes, sorted by lowest stock first; the total may exceed the number displayed. Low-stock quantities are current inventory values, not sales forecasts or ingredient quantities. Use the live shop summary for actual stock values; these knowledge notes do not contain current stock.",
    keywords: ["low stock", "threshold", "inventory", "report", "forecast", "ingredient"],
  },
  {
    id: "unconfirmed-shop-details",
    title: "Unconfirmed opening hours, address, and contact details",
    content:
      "This knowledge base has no confirmed shop opening or closing hours, holiday schedule, street address, directions, telephone number, or public contact email. Do not infer these details from a pickup time, a user's account, or the application name. Ask the shop owner to provide and confirm the requested information before advising customers. A pickup time being accepted by the application does not establish the shop's operating hours.",
    keywords: [
      "hours",
      "opening",
      "closing",
      "open",
      "close",
      "holiday",
      "Sunday",
      "address",
      "location",
      "directions",
      "contact",
      "phone",
      "telephone",
    ],
  },
  {
    id: "unconfirmed-refunds-allergens",
    title: "Unconfirmed refund and allergen information",
    content:
      "This knowledge base has no confirmed refund policy, refund timing, ingredient lists, allergen declarations, or cross-contact procedures. The application's order-cancellation rules do not establish a refund entitlement or policy. A vegetarian label does not establish that a product is vegan, dairy-free, nut-free, gluten-free, or safe for an allergy. Ask the shop owner to confirm the relevant product ingredients and handling details before making a dietary or allergen claim. Do not invent a policy or guarantee safety.",
    keywords: [
      "refund",
      "policy",
      "allergen",
      "allergy",
      "ingredient",
      "vegan",
      "vegetarian",
      "milk",
      "dairy",
      "nut",
      "gluten",
    ],
  },
];

// Sources: README.md (customer flow); validation/order-schemas.ts; services/order-service.ts;
// repositories/order-repository.ts and report-repository.ts; services/report-service.ts;
// routes/admin-product-routes.ts, admin-staff-account-routes.ts, and admin-agent-routes.ts;
// services/staff-account-service.ts. Physical shop policies remain deliberately unconfirmed.
