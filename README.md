# South India Coffee Shop

Monorepo for the South India Coffee Shop application.

## Prerequisites

- Git
- Node.js 24, matching `.nvmrc` and the hosting configuration
- npm, using the version recorded by `packageManager` in `package.json`
- Docker Desktop with Linux containers, WSL 2, and firmware virtualization for
  the Docker workflow

## First-time setup

```powershell
git clone https://github.com/rameshchinni2908-gif/south-india-coffee-shop.git
Set-Location south-india-coffee-shop
npm ci
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env
```

Replace only the placeholder values in the local `.env` files. They are ignored
by Git; never place real credentials in an example file or commit them.

## API development

Ensure MongoDB is available at the configured `MONGODB_URI`, then run:

```powershell
npm run dev:api
```

The health endpoint is available at `http://localhost:4000/api/health`.

If the local DNS provider rejects MongoDB Atlas SRV lookups, set
`MONGODB_DNS_SERVERS=1.1.1.1,8.8.8.8` in `apps/api/.env`.

## Docker development

Docker Compose runs the web app, API, and a persistent single-node MongoDB
replica set. The replica set is required for atomic stock and price-history
transactions.

1. Use the local environment files created during first-time setup.
2. Replace `JWT_SECRET` and set the three `SEED_ADMIN_*` values in
   `apps/api/.env`.
3. Keep `apps/web/.env` pointed at `http://localhost:4000`.
4. Start the stack:

```powershell
npm run docker:up
```

Open `http://localhost:5173`; the API health endpoint is
`http://localhost:4000/api/health`. On the first run, create the initial catalog
and admin account:

```powershell
docker compose exec api npm run seed
```

View logs with `npm run docker:logs` and stop the stack with
`npm run docker:down`. The named MongoDB volume is preserved when the stack is
stopped.

When running only MongoDB in Docker and the API directly on Windows, use:

```text
MONGODB_URI=mongodb://localhost:27017/south-india-coffee-shop?replicaSet=rs0&directConnection=true
```

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
paise. The shop owner confirmed `TAX_PERCENTAGE=0` for the current release on
1 September 2026. Local examples and the Render Blueprint therefore use `0`;
change it only after the owner confirms a new value. Stock is validated during
checkout and reduced in a MongoDB transaction when staff confirm an order.
Cancelling a confirmed order restores its stock in the same transaction.

Order confirmation requires MongoDB transaction support. Use MongoDB Atlas or
a local replica set; a standalone local `mongod` can accept checkout orders but
cannot atomically confirm them.

## Seed the initial catalog and first admin

Set `SEED_ADMIN_NAME`, `SEED_ADMIN_EMAIL`, and `SEED_ADMIN_PASSWORD` in
`apps/api/.env`. Use a unique password with 12 to 72 characters, then run:

```powershell
npm run seed
```

The command creates Coffee, Tea, Breakfast, Snacks, and Packaged Products
categories, five sample products, and the first admin. Sample money values are
stored as integer paise. Sample products are inactive by default; the shop owner
must review their details, prices, and stock in the admin screen before
activating them. The command is idempotent: rerunning it does not duplicate
records or overwrite staff changes to existing categories, products, prices,
or stock.

Use `npm run seed:catalog` or `npm run seed:admin` when only one part is needed.

## Authentication endpoints

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

The staff interface is available at `http://localhost:5173/admin/login`. After
sign-in, `/admin/products` supports category creation, product and variant
creation/editing, activation, price changes, stock and availability updates,
and ADMIN-only product archival. Staff authentication uses the secure HTTP-only
cookie issued by the API; the token is not exposed to application JavaScript or
stored in `localStorage` or `sessionStorage`.

Administrators can manage accounts at `/admin/staff`. They can create `STAFF`
or `ADMIN` users, edit names and email addresses, reset passwords, and activate
or deactivate access. Password hashes are never returned by the API. An
administrator cannot deactivate or demote their own account.

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
- `GET|POST /api/admin/staff-accounts` — `ADMIN` only
- `PATCH /api/admin/staff-accounts/:id` — `ADMIN` only

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

`npm test` includes automated accessibility scans for the customer menu, staff
sign-in, and admin dashboard. Run only those checks with `npm run test:a11y`.
Screen-reader behavior and mobile zoom still require a manual assistive-
technology review before production.

### Browser verification

The deployed application was manually checked in Chrome on 1 September 2026 at
desktop size and a 390 x 844 mobile viewport. The check covered Render cold-start
recovery, menu search and category filters, cart state, checkout and order-
tracking validation, SPA route refreshes, protected admin routing, and read-only
dashboard, order, product, and staff screens. No application-origin console
errors or horizontal mobile overflow were observed, and no production records
were created or modified. Keyboard testing also confirmed a visible skip link;
its target is programmatically focusable and covered by an automated regression
test.

Edge, Firefox, real mobile Safari/Chrome, screen readers, and browser zoom must
still be checked on their native platforms before calling cross-browser QA
complete.

### Production regression and test data

The final production regression was run on 1 September 2026. HTTPS health and
Atlas connectivity, public catalog responses, authentication failures, CORS,
customer menu rendering, SPA route refreshes, admin reporting, product stock,
order tracking, and application-origin browser logs passed. The active catalog
remained at two products and its stock values were unchanged by the audit.

Earlier production verification records are intentionally retained as clearly
labelled `TEST DATA` because orders and price history are historical records.
Their two test products are archived, both price changes remain recorded, and
all four test orders are terminal: two completed and two cancelled. The one
stale placed test order was cancelled during the final cleanup. No real customer
order, active product, category, staff account, or price was changed.

### Docker verification status

GitHub Actions validates the Compose configuration and runs the complete stack
on a Linux Docker runner. The job builds and starts MongoDB, the API, and the web
app; waits for their health checks; verifies both HTTP endpoints; restarts the
stack without deleting its named volumes; and confirms a MongoDB marker survives
the restart.

The equivalent local runtime check remains pending on the current verification
computer because firmware virtualization and WSL 2 are not enabled. After
enabling them, run `npm run docker:up` and repeat the health and persistence
checks locally. Do not use `docker compose down --volumes` unless intentionally
deleting the local database.

GitHub Actions runs Docker configuration and runtime verification, formatting,
linting, type checking, all tests, and production builds for pull requests and
pushes to `main`.

## Deployment configuration

### Live production

- Frontend: <https://jrgsouthindiacoffeeshop.vercel.app>
- Admin sign-in: <https://jrgsouthindiacoffeeshop.vercel.app/admin/login>
- API: <https://south-india-coffee-shop-api.onrender.com>
- Health check: <https://south-india-coffee-shop-api.onrender.com/api/health>

The production API uses MongoDB Atlas. Render permits only its documented
Oregon outbound ranges in the Atlas network access list; local developer IPs
should be temporary and removed after maintenance. The initial admin and base
categories have been seeded. The `SEED_ADMIN_*` values are not retained in
Render after seeding.

### Render API

The root `render.yaml` Blueprint creates the Node.js API service, waits for
`/api/health`, generates `JWT_SECRET`, and runs the idempotent catalog and admin
seed after the first successful deployment.

1. Create a MongoDB Atlas database and restrict access as far as Render permits.
2. Create a Render Blueprint from this repository's `render.yaml`.
3. Supply `MONGODB_URI`, a temporary `CLIENT_URL`, and the three
   `SEED_ADMIN_*` values when prompted. Do not enter them in source files.
4. Verify the Render `/api/health` URL after deployment.

### Vercel web app

1. Import the same repository into Vercel.
2. Set the project root directory to `apps/web`; `vercel.json` contains the
   Vite and SPA rewrite configuration.
3. Set `VITE_API_BASE_URL` to the public HTTPS Render URL as the development
   fallback and set `VITE_SHOP_NAME`. Secure production builds call the Vercel
   origin, whose `/api/*` rewrite proxies to Render so staff authentication uses
   a first-party HTTP-only cookie on Safari and other privacy-focused browsers.
4. Deploy, then update Render's `CLIENT_URL` to the final Vercel URL and
   redeploy the API so cookie-based staff access and CORS use the production
   frontend origin.

Hosted deployments must use MongoDB Atlas. Never copy a local `.env` file into
Render or Vercel.

### Deployment recovery

Keep an approved secure backup of the provider configuration and secret values;
the repository deliberately cannot recreate production credentials or Atlas
data by itself.

1. Restore or recreate the Atlas cluster and database user, then configure the
   minimum Render network access required.
2. Recreate the Render service from `render.yaml` and restore its environment
   variables from an approved password manager or other secure backup. Never
   recover secrets from Git history.
3. If the catalog or admin user is absent, temporarily set the three
   `SEED_ADMIN_*` variables, run `npm run seed` once, verify the catalog and
   sign-in, and remove those variables from Render.
4. Reimport `apps/web` into Vercel, restore `VITE_API_BASE_URL` and
   `VITE_SHOP_NAME`, and deploy with the external `/api/*` rewrite intact.
5. Set Render's `CLIENT_URL` to the restored Vercel origin, redeploy the API,
   and verify health, CORS, staff sign-in, catalog access, and a test pickup
   order before reopening the shop.

For a code-only incident, prefer reverting the faulty Git commit and letting CI
redeploy it, or use the hosting provider's previous-deployment rollback. Do not
delete or restore Atlas data for a code rollback. If a credential might be
exposed, rotate the Atlas user password and `JWT_SECRET`, update Render, redeploy,
and require staff to sign in again.

Render's free service can sleep after inactivity, so the first API request may
take longer. Atlas backups and point-in-time recovery depend on the selected
Atlas plan; verify the current provider capabilities before relying on them.
