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
