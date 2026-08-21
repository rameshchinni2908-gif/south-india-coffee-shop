# South India Coffee Shop

Monorepo for the South India Coffee Shop application.

## API development

Copy `apps/api/.env.example` to `apps/api/.env`, ensure MongoDB is available at
`MONGODB_URI`, then run:

```powershell
npm install
npm run dev:api
```

The health endpoint is available at `http://localhost:4000/api/health`.

If the local DNS provider rejects MongoDB Atlas SRV lookups, set
`MONGODB_DNS_SERVERS=1.1.1.1,8.8.8.8` in `apps/api/.env`.

## Web development

Copy `apps/web/.env.example` to `apps/web/.env`, keep the API running, then run:

```powershell
npm run dev:web
```

Open `http://localhost:5173` to browse the customer menu. Search, category,
availability, vegetarian, sorting, and pagination state is stored in the URL.
Available variants can be added to the device-local cart. The `/cart` page
collects customer and pickup details, while the API reloads current products,
validates stock, snapshots names and prices, and calculates the final total.
Customers can check a pickup at `/track-order` with the order number and the
mobile number used at checkout.

## Pickup orders

- `POST /api/orders`
- `POST /api/orders/track`

Orders use `PAY_AT_SHOP`, begin with status `PLACED`, and store money as integer
paise. Set `TAX_PERCENTAGE` in `apps/api/.env`; keep it at `0` until the shop
owner confirms the required value. Stock is validated during checkout and
reduced in a MongoDB transaction when staff confirm an order. Cancelling a
confirmed order restores its stock in the same transaction.

Order confirmation requires MongoDB transaction support. Use MongoDB Atlas or
a local replica set; a standalone local `mongod` can accept checkout orders but
cannot atomically confirm them.

## Seed the first admin

Set `SEED_ADMIN_NAME`, `SEED_ADMIN_EMAIL`, and `SEED_ADMIN_PASSWORD` in
`apps/api/.env`. Use a unique password with 12 to 72 characters, then run:

```powershell
npm run seed:admin
```

The command is idempotent: rerunning it with the same email does not create a
duplicate account.

## Authentication endpoints

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

The staff interface is available at `http://localhost:5173/admin/login`. After
sign-in, `/admin/products` supports category creation, product and variant
creation/editing, activation, price changes, stock and availability updates,
and ADMIN-only product archival. Staff authentication uses the secure HTTP-only
cookie issued by the API; credentials and access tokens are not stored in the
browser.

The authenticated order queue is available at `/admin/orders`. It supports
search, status filtering, pagination, and the enforced workflow:

```text
PLACED -> CONFIRMED -> PREPARING -> READY -> COMPLETED
   |          |
   +----------+----------------------------> CANCELLED
```

`PREPARING`, `READY`, `COMPLETED`, and `CANCELLED` cannot skip or reverse
status. Completing a pay-at-shop order records its payment as paid.

The staff dashboard is available at `/admin/dashboard`. It shows today's order
status counts, completed sales for today and the current month, low-stock
variants, and recent price changes. Daily and monthly boundaries use
`SHOP_TIMEZONE`; sales totals include only orders that reached `COMPLETED`
during the selected period.

## Catalog endpoints

Public:

- `GET /api/categories`
- `GET /api/products`
- `GET /api/products/:slug`

Product lists support `page`, `limit`, `search`, `category`, `available`,
`vegetarian`, `sortBy`, and `sortOrder` query parameters.

Authenticated staff/admin:

- `GET|POST /api/admin/categories`
- `PATCH /api/admin/categories/:id`
- `GET|POST /api/admin/products`
- `GET|PATCH|DELETE /api/admin/products/:id`
- `PATCH /api/admin/products/:id/availability`
- `GET /api/admin/orders`
- `PATCH /api/admin/orders/:id/status`
- `GET /api/admin/reports/summary`

Prices are integer paise. Product deletion is a soft archive and is restricted
to `ADMIN`; `STAFF` and `ADMIN` can manage stock and availability. Variant price
updates record price history in the same MongoDB transaction.

## Quality checks

```powershell
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
```
