# AGENTS.md — South India Coffee Shop Application

## 1. Project Goal

Build a responsive, full-stack application for a local South Indian coffee shop. Customers should be able to view the current menu, prices and availability and place pickup orders. Shop staff should be able to manage products, prices, stock and order status from an admin dashboard.

The application must be simple enough for a single local shop, accessible from phones and computers, deployable on free-tier services and easy to run locally with Docker.

## 2. Product Scope

### Customer application

- Browse available coffee, tea, snacks, breakfast items and packaged products.
- View product name, image, description, category, size, price and availability.
- Search products and filter by category, availability and vegetarian status.
- Add products and quantities to a cart.
- Place a pickup order using customer name and mobile number.
- Select an expected pickup time.
- View an order-confirmation page with order number and total.
- Check order status using order number and mobile number.

### Staff/admin application

- Secure staff login.
- Dashboard showing today's orders, sales total and low-stock products.
- Create, edit, activate, deactivate and archive products.
- Update price, stock quantity and availability.
- Manage categories and product variants such as Regular and Large.
- View orders and change status: `PLACED`, `CONFIRMED`, `PREPARING`, `READY`, `COMPLETED` or `CANCELLED`.
- View basic daily and monthly sales summaries.
- Record every price change in price history.

### Version 1 exclusions

- No online payment gateway; use `PAY_AT_SHOP` only.
- No delivery tracking.
- No marketplace or third-party price scraping.
- No multi-branch support.
- No customer account is required.
- No complex accounting, GST filing or POS hardware integration.

## 3. Success Criteria

The first release is successful when:

- Customers can see only active products with current price and availability.
- A customer can complete a pickup order from a mobile browser.
- The server recalculates every order total; client totals are never trusted.
- Staff can update product price or availability without changing code.
- Staff can process an order through its complete status flow.
- Stock is reduced safely when an order is confirmed and cannot become negative.
- The application works on current Chrome, Edge, Firefox and mobile browsers.
- A new developer can run the full project using documented commands or Docker Compose.
- Frontend, backend and database work after deployment through public HTTPS URLs.
- Core API and business rules have automated tests.
- No secrets, passwords or production credentials are committed to Git.
- Linting, type checking, tests and production builds pass in CI.

## 4. Technical Stack

### Frontend

- React, TypeScript and Vite
- React Router for navigation
- TanStack Query for server state and API caching
- React Hook Form with Zod for forms and validation
- Material UI for responsive components and accessibility
- Axios or a small Fetch API client; use only one approach consistently
- Vitest and React Testing Library

### Backend

- Node.js, Express and TypeScript
- MongoDB with Mongoose
- Zod for request validation
- JSON Web Tokens for staff authentication
- bcrypt for password hashing
- Helmet, CORS, rate limiting and Pino HTTP logging
- Vitest or Jest with Supertest for API testing

### Database and hosting

- MongoDB Atlas Free cluster for hosted data
- Vercel Hobby for the React frontend
- Render Free web service for the Node.js API
- GitHub for source control
- GitHub Actions for continuous integration
- Docker and Docker Compose for consistent local development

Free services can sleep, pause or change limits. Treat this deployment as a small-shop MVP or portfolio release and review provider limits before production use.

## 5. Architecture

Use a monorepo with clear boundaries:

```text
south-india-coffee-shop/
├── apps/
│   ├── web/                 # React frontend
│   └── api/                 # Express backend
├── packages/
│   └── shared/              # Shared types and schemas where genuinely useful
├── docker-compose.yml
├── .env.example
├── package.json
├── README.md
└── AGENTS.md
```

Backend layering:

```text
route -> validation -> controller -> service -> repository/model -> database
```

- Routes define endpoints and middleware.
- Controllers translate HTTP input and output only.
- Services contain business rules and transaction logic.
- Models/repositories handle database access.
- Middleware handles authentication, authorization, errors and logging.

Deployment flow:

```text
Browser -> Vercel React app -> HTTPS REST API on Render -> MongoDB Atlas
```

## 6. Core Data Models

### User

- `name`
- `email` — unique, lowercase
- `passwordHash`
- `role` — `ADMIN` or `STAFF`
- `isActive`
- timestamps

### Category

- `name`
- `slug` — unique
- `displayOrder`
- `isActive`
- timestamps

### Product

- `name`
- `slug` — unique
- `description`
- `categoryId`
- `imageUrl`
- `isVegetarian`
- `variants[]` with `name`, `sku`, `price`, `stockQuantity` and `isAvailable`
- `isActive`
- `lowStockThreshold`
- timestamps

Store money as integer paise. Example: `₹45.50` is stored as `4550`.

### PriceHistory

- `productId`
- `variantId` or variant SKU
- `oldPrice`
- `newPrice`
- `changedBy`
- `changedAt`

### Order

- `orderNumber` — unique and human-readable
- `customerName`
- `customerMobile`
- `items[]` containing product/variant references plus snapshots of name, SKU and unit price
- `subtotal`
- `taxAmount`
- `totalAmount`
- `paymentMethod` — `PAY_AT_SHOP`
- `paymentStatus` — `PENDING` or `PAID`
- `status`
- `pickupTime`
- `notes`
- timestamps

Order items must preserve price and name snapshots so later product updates do not modify historical orders.

## 7. Main API Endpoints

### Public

- `GET /api/health`
- `GET /api/categories`
- `GET /api/products`
- `GET /api/products/:slug`
- `POST /api/orders`
- `POST /api/orders/track`

### Staff/admin

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET|POST /api/admin/products`
- `GET|PATCH|DELETE /api/admin/products/:id`
- `PATCH /api/admin/products/:id/availability`
- `GET|POST|PATCH /api/admin/categories`
- `GET /api/admin/orders`
- `PATCH /api/admin/orders/:id/status`
- `GET /api/admin/reports/summary`

All list endpoints must support appropriate pagination, search, filtering and sorting. Use a consistent response shape:

```json
{
  "success": true,
  "data": {},
  "meta": {},
  "error": null
}
```

## 8. Business Rules

- Show a product only when its category, product and selected variant are active.
- Validate all prices and quantities on the server.
- Reject unavailable or insufficient-stock items before creating an order.
- Never accept product names or prices from the client as authoritative.
- Calculate subtotal, tax and total on the server.
- Use atomic database updates when reducing stock.
- Define and enforce valid order-status transitions in the service layer.
- Only `ADMIN` can manage staff accounts or archive products.
- `ADMIN` and `STAFF` can update stock and process orders.
- Archive products referenced by orders instead of permanently deleting them.
- Store dates in UTC and display them in `Asia/Kolkata` time.
- Format currency as Indian Rupees using `Intl.NumberFormat('en-IN', { currency: 'INR', style: 'currency' })`.

## 9. Coding Standards

### General

- Use TypeScript strict mode; avoid `any`.
- Prefer small, single-purpose functions and components.
- Use clear names; do not use unexplained abbreviations.
- Keep business logic out of React components and Express controllers.
- Prefer composition and dependency injection over tightly coupled modules.
- Do not duplicate constants, validation schemas or status definitions.
- Add comments only when explaining a non-obvious decision.
- Remove dead code and debug logging before merging.

### React

- Use functional components and hooks.
- Keep server state in TanStack Query, local UI state in component hooks and avoid unnecessary global state.
- Provide loading, empty, success and error states for every API screen.
- Use semantic HTML, keyboard-accessible controls and visible focus states.
- Do not perform API calls directly inside presentational components.
- Memoize only after identifying a real rendering problem.
- Use stable keys; never use array indexes for mutable lists.

### Node.js and API

- Validate environment variables during startup.
- Validate request body, parameters and query strings before controllers run.
- Use async handlers and centralized error middleware.
- Return appropriate HTTP status codes and safe error messages.
- Never expose stack traces, password hashes, database URLs or tokens.
- Log request IDs, method, path, status and response time without logging secrets.
- Apply authentication and role authorization on every admin route.

### Naming and formatting

- Files: `kebab-case.ts` and React components `PascalCase.tsx`.
- Variables/functions: `camelCase`.
- Types/interfaces/classes: `PascalCase`.
- Constants and enum-like objects: `UPPER_SNAKE_CASE` when truly constant.
- Use ESLint and Prettier with shared root configuration.
- Prefer named exports except for framework-required defaults.

### Git

- Branches: `feature/...`, `fix/...`, `chore/...`.
- Use focused commits with messages such as `feat(products): add availability filter`.
- Pull requests must describe the change, testing and screenshots for UI changes.
- Never commit `.env`, credentials, database dumps, generated coverage or build output.

## 10. Security Requirements

- Hash passwords with bcrypt; never store plain-text passwords.
- Use short-lived staff access tokens in secure, HTTP-only, same-site cookies where supported.
- Restrict CORS to the deployed frontend URL and local development URL.
- Apply stricter rate limits to login and public order-tracking endpoints.
- Sanitize and validate all input.
- Use Helmet security headers.
- Prevent NoSQL injection by validating permitted fields and operators.
- Do not render untrusted HTML.
- Store secrets only in local `.env` files and hosting-provider environment settings.
- Add `.env.example` containing names and safe examples only.

## 11. Testing and Quality Gates

Minimum automated coverage must include:

- Authentication success and failure.
- Product filtering and availability.
- Server-side order total calculation.
- Rejection of unavailable products and excessive quantities.
- Valid and invalid order-status transitions.
- Staff authorization.
- Price-history creation after a price update.
- Important React screens, forms and error states.

Before merging, run:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

GitHub Actions must run the same checks on pull requests and pushes to `main`.

## 12. Environment Variables

Backend:

```text
NODE_ENV=
PORT=
MONGODB_URI=
JWT_SECRET=
JWT_EXPIRES_IN=
CLIENT_URL=
SHOP_TIMEZONE=Asia/Kolkata
TAX_PERCENTAGE=0
```

Frontend:

```text
VITE_API_BASE_URL=
VITE_SHOP_NAME=
```

The tax percentage must be configurable and confirmed by the shop owner. Do not assume a legal tax rate.

## 13. Local Development Steps

1. Install Node.js LTS, Git and Docker Desktop.
2. Clone the repository.
3. Copy `.env.example` files to local `.env` files.
4. Install dependencies with `npm ci`.
5. Start with `docker compose up --build`, or run frontend/backend development commands separately.
6. Seed categories, sample products and the first admin account using an idempotent seed command.
7. Open the frontend URL and verify `/api/health`.
8. Run linting, type checking and tests before committing.

Docker Compose should contain:

- `web` service for React development.
- `api` service for Node.js.
- `mongo` service for local MongoDB only.
- Named volume for local database persistence.
- Health checks and `depends_on` conditions where useful.

Hosted deployments must use MongoDB Atlas, not the local Docker database.

## 14. Deployment Steps

### A. Prepare the repository

1. Push the monorepo to a private or public GitHub repository.
2. Ensure production builds work locally.
3. Configure GitHub Actions for lint, type checking, tests and builds.
4. Keep all secrets out of GitHub source files.

### B. Create MongoDB Atlas database

1. Create a free Atlas project and free cluster.
2. Create a dedicated database user with a strong password.
3. Configure the minimum network access required by the backend host.
4. Copy the connection string into Render as `MONGODB_URI`.
5. Create indexes for product slug, SKU, category, order number, mobile number and order creation date.
6. Run the production seed command once to create the first admin and base categories.

### C. Deploy the Node.js API to Render

1. Create a Render Web Service connected to the GitHub repository.
2. Set the root directory to `apps/api` if required by the monorepo configuration.
3. Configure the build command and production start command.
4. Add all backend environment variables in Render.
5. Set `CLIENT_URL` after the Vercel URL is available, then redeploy.
6. Verify the public `/api/health` endpoint.
7. Confirm logs contain no secrets and errors are handled correctly.

### D. Deploy the React frontend to Vercel

1. Import the GitHub repository into Vercel.
2. Set the root directory to `apps/web` if required.
3. Select the Vite build configuration.
4. Set `VITE_API_BASE_URL` to the Render API URL.
5. Deploy and verify customer and admin routes.
6. Configure SPA rewrites so refreshed React routes do not return 404.

### E. Final production verification

1. Allow the Vercel URL in backend CORS configuration.
2. Confirm both services use HTTPS.
3. Test staff login, product creation, price changes and availability updates.
4. Place a test pickup order and complete its status flow.
5. Verify stock reduction, totals, price history and mobile responsiveness.
6. Remove test orders or clearly mark them as test data.
7. Record deployment URLs and recovery instructions in `README.md`.

## 15. Implementation Order

1. Initialize monorepo, TypeScript, linting, formatting and CI.
2. Create backend configuration, database connection, health route and error handling.
3. Implement user authentication and seed the first admin.
4. Implement categories, products, variants, pricing and stock APIs.
5. Build the customer menu, filters and product cards.
6. Implement cart and server-validated pickup checkout.
7. Build admin product and availability management.
8. Build order management and valid status transitions.
9. Add price history, dashboard summaries and low-stock indicators.
10. Add Docker, automated tests, accessibility checks and deployment configuration.
11. Deploy database, API and frontend, then execute production verification.

## 16. Instructions for Codex and Other Coding Agents

- Read this file and the nearest nested `AGENTS.md` before editing.
- Inspect existing code and tests before proposing architecture changes.
- Make the smallest coherent change that completes the requested behavior.
- Do not add dependencies when the existing stack can reasonably solve the task.
- Preserve backward compatibility unless the request explicitly permits a breaking change.
- Add or update tests for every business-rule change and bug fix.
- Run relevant lint, type-check, test and build commands after changes.
- Never create fake integrations, hard-code secrets or bypass authentication.
- Never trust prices, totals, roles or stock values received from the browser.
- Do not change deployment providers or the technical stack without documenting the reason.
- If legal, tax, payment or operational requirements are unclear, add configuration and ask for confirmation instead of guessing.
- Report changed files, verification performed and any remaining limitations.
- Do not claim success when checks fail; state the exact failure and likely cause.

## 17. Definition of Done

A feature is complete only when:

- Acceptance behavior works on desktop and mobile layouts.
- Input validation and authorization are implemented on the server.
- Loading, empty and error states are handled in the UI.
- Automated tests cover important success and failure paths.
- Linting, type checking, tests and builds pass.
- Environment variables and setup changes are documented.
- No sensitive data or debug code is committed.
- The deployed flow is verified when deployment is part of the task.

