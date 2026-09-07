# JRG South Indian Coffee Shop

Monorepo for the JRG South Indian Coffee Shop application.

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

## Kaapi Karts (waiting-room mini-game)

An optional kart race that a table of customers plays on their own phones while
their order is prepared, to decide who buys the round. 1–6 players per room,
three laps, capped at 2 minutes 30 seconds — a clean race takes about 95
seconds. Karts can ram each other for a speed advantage, barriers keep everyone
on the circuit, and last place buys the coffee. It is entertainment only: it
never reads or writes orders, payments, stock, or customer records, and the "who
pays" result is an explicit suggestion, not an instruction.

The full specification lives in [`KAAPI-KARTS.md`](KAAPI-KARTS.md), including
the current tuning values and a map of where the code lives.

Solo racing is allowed (`MIN_PLAYERS` is 1) so the track can be tested on one
phone; set that constant back to 2 to make the game strictly social.

### Enabling it

The feature ships **disabled**. Turn it on by setting both flags and redeploying.
These same flags also control [Bean Blasters](#bean-blasters-waiting-room-mini-game)
— the two games share one switch on purpose, so adding a game never adds
configuration:

```text
# apps/api (Render)
GAME_ENABLED=true
GAME_ROOM_TTL_MINUTES=60
GAME_RESULT_TTL_HOURS=24
GAME_MAX_ROOMS_PER_IP_PER_HOUR=10

# apps/web (Vercel)
VITE_GAME_ENABLED=true
# Optional. Defaults to VITE_API_BASE_URL; must point at the Render origin.
VITE_GAME_SOCKET_URL=
```

With `GAME_ENABLED=false` the `/api/game` router is never mounted and no socket
server starts. With `VITE_GAME_ENABLED=false` the Games entry is hidden from the
header and the game routes redirect to the menu.

Enable the API first, then the web app. If the web goes live while the API is
still disabled, the lobby simply never connects.

**Saving the `VITE_*` variables in Vercel is not enough on its own.** Vite
compiles them into the JavaScript at build time, so the running site keeps
whatever values its last build used. After changing either variable, trigger a
fresh build — Deployments, then Redeploy on the newest deployment — and set them
for the Production environment specifically, not only Preview. The `GAME_*`
variables on Render are read at process start, so saving them there is enough;
Render restarts on its own.

Verify each side independently:

```bash
# Expect {"success":true,"data":{"enabled":true},...}; a 404 means GAME_ENABLED is off.
curl https://south-india-coffee-shop-api.onrender.com/api/game/health
```

The web side is live once a controller icon appears in the site header. If the
games hub shows "Live racing is misconfigured", `VITE_GAME_SOCKET_URL` was not
present in the build that is currently serving.

### Endpoints

- `GET /api/game/health` — readiness probe, also used to wake a sleeping Render instance
- `POST /api/game/rooms` — create a room (rate limited per IP)
- `POST /api/game/rooms/:code/join` — join or reconnect
- `GET /api/game/rooms/:code` — room snapshot
- `GET /api/game/results/:code` — the room's last race result

Live play runs over Socket.IO on the `/game` namespace.

### Operational notes

- **Rooms are in memory.** The API is a single Render instance and a room only
  matters while its players hold live sockets, so rooms are process-local with a
  TTL sweeper and are lost on restart or redeploy. This is expected. Only race
  results persist, in the `gameresults` collection with a TTL index on
  `expiresAt` (add that index and one on `roomCode` in Atlas).
- **Render Free sleeps** after about 15 minutes idle, so the first player may
  wait ~50 seconds for a cold start. The Games screen fires the health probe on
  mount to begin waking the instance early.
- **Sockets bypass the Vercel proxy.** The `/api/:path*` rewrite that keeps the
  admin cookie first-party cannot carry a WebSocket upgrade, so the game client
  connects straight to the Render origin. `CLIENT_URL` on the API must therefore
  be the Vercel origin, or the socket handshake fails CORS.
- Scaling the API beyond one instance requires moving the room store to Redis
  first.

## Bean Blasters (waiting-room mini-game)

The second game in the same hub. A top-down arena brawl where 2–6 baristas fling
roasted coffee beans at each other for **two minutes**: three hearts each, a
six-bean clip you have to reload, beans slow enough that you must lead a moving
target, crates that give real cover, and four power-up pads. Most splashes
landed wins; fewest buys the coffee. Running out of hearts sends you off for a
six-second refill break rather than out of the round, so nobody sits and
watches. Like the kart game it is entertainment only and never touches orders,
payments, stock or customer records.

The full specification lives in [`BEAN-BLASTERS.md`](BEAN-BLASTERS.md), including
the tuning table and a map of where the code lives. Section 3a records where it
deliberately departs from Kaapi Karts and why.

**Every hit is decided by the server.** Clients report only their own movement
and a request to throw; the API simulates every bean at 30 Hz and broadcasts one
verdict both phones obey. There is deliberately no "I hit someone" event a
client could send.

### Enabling it

No new environment variables. It uses exactly the flags listed under Kaapi Karts
above — `GAME_ENABLED` on Render and `VITE_GAME_ENABLED` on Vercel turn both
games on together, and `GAME_ROOM_TTL_MINUTES`, `GAME_RESULT_TTL_HOURS`,
`GAME_MAX_ROOMS_PER_IP_PER_HOUR` and `VITE_GAME_SOCKET_URL` apply to both.

The trade-off is that the two games cannot be released independently. If they
ever need separate switches, add `GAME_BLASTERS_ENABLED` /
`VITE_GAME_BLASTERS_ENABLED` defaulting to the shared flag's value so existing
deployments keep working untouched.

```bash
# Expect {"success":true,"data":{"enabled":true},...}; a 404 means GAME_ENABLED is off.
curl https://south-india-coffee-shop-api.onrender.com/api/arena/health
```

### Endpoints

- `GET /api/arena/health` — readiness probe, also used to wake a sleeping instance
- `POST /api/arena/rooms` — create a room (rate limited per IP, on its own counter)
- `POST /api/arena/rooms/:code/join` — join or reconnect
- `GET /api/arena/rooms/:code` — room snapshot
- `GET /api/arena/results/:code` — the room's last round result

### Operational notes

- **It runs its own Socket.IO server on its own path** (`/arena.io/`, namespace
  `/arena`). Kaapi Karts already occupies the default `/socket.io/` path, and two
  Socket.IO servers can share one HTTP server only when their paths differ. This
  is what keeps the two games' realtime layers independent — neither knows the
  other exists, and deleting either cannot break the other.
- **Rooms are in memory**, same design and same reasoning as the kart game. Only
  round results persist, in the `arenaresults` collection with a TTL index on
  `expiresAt` — **add that index and one on `roomCode` in Atlas**, or results
  never expire.
- Sockets bypass the Vercel proxy for the same reason as the kart game.
- The two features share no code. Duplicated constants between them (the
  room-code alphabet, the colour palette) are deliberate, so either game can be
  deleted by removing its own folders.

## Secret Sip (social deduction at your table)

Play at <https://jrgsouthindiacoffeeshop.vercel.app/games/secret-sip>.
Three to eight friends use their own phones to join a five-character private
table code. Each player gets a numbered cup; no name or account is needed.
Regulars receive the same secret word, while one bluffer sees only its category.
Give short clues aloud, discuss who sounds suspicious, then vote privately.
A caught bluffer gets one final guess to steal the win. A tie or a wrong
accusation lets the bluffer escape. Escaping earns the bluffer three points;
catching them without a correct final guess earns each regular two points.
Scores carry across rematches at the same table, with fresh words and a different
bluffer each round. No prizes, orders, or payments are involved.

The server controls roles, turns, deadlines, votes, answers, and scores. The
48-word deck stays on the API; it is never bundled into the browser. Private
snapshots contain only the requesting player's role and permitted word. Random
256-bit session tokens authorize sockets and never appear in room links, public
player lists, or other players' snapshots. A token is kept in session storage
for refresh/reconnect, with an in-memory fallback when storage is unavailable.
Use the original browser tab to recover a seat. If storage is blocked, reloading
loses the seat; the host can release disconnected lobby seats. Private cards
hide after five seconds and whenever the page loses focus.

Rounds have a 12-second role reveal, 12 seconds per spoken clue, 35 seconds of
discussion, 25 seconds to vote, and a 15-second final guess when needed. Timers
advance missing players automatically. The host can end discussion early, and
the current speaker can finish their clue early. Votes are final and hidden
until results. Guess matching ignores punctuation, case, and spaces and accepts
the server deck's common aliases; it does not use fuzzy spelling or translation.
Clues are spoken in person, in whichever language the table prefers; the interface
and word cards are English. There is no microphone permission or recording.

Deployment uses the **existing** `GAME_ENABLED`, `VITE_GAME_ENABLED`,
`VITE_GAME_SOCKET_URL`, `CLIENT_URL`, `GAME_ROOM_TTL_MINUTES`, and
`GAME_MAX_ROOMS_PER_IP_PER_HOUR` values. No dependency, paid service, Atlas
collection, or new environment variable is required. REST creation/join uses
`POST /api/sip/rooms` and `POST /api/sip/rooms/:code/join`, both with `{}` bodies.
Readiness is `GET /api/sip/health`. Live traffic uses the dedicated
`/sip-socket.io` path on the existing Render API, bypassing the Vercel REST proxy
just like the other multiplayer games. The namespace is the default `/`.

Rooms and scores are ephemeral, capped at 500 rooms, and expire after the
configured room TTL measured from creation. They disappear on a Render restart
or redeploy. The start screen wakes the API and reports cold-start failures with
a retry action. Disconnected players keep their roles within the room lifetime;
hosting moves to a connected player. Rematches preserve disconnected seats so
a refreshing phone can recover; the host can explicitly release an absent seat.
The feature is lazy loaded; CI checks its own JavaScript and CSS against a
60 kB gzip budget (shared React, MUI, and Socket.IO chunks are separate).
Disable the existing game flags to hide all games, or roll back both hosting
deployments to recover the previous release.

Implementation: `apps/api/src/modules/secret-sip/` and
`apps/web/src/features/secret-sip/`. Keep both `sip-contract.ts` files identical;
an automated test enforces this. Service, HTTP, three-client Socket.IO, and UI
tests cover private projections, access control, turn order, vote locking, ties,
timeouts, score calculation, rematches, reconnects, and accessible forms.

## Bean Merge (solo waiting-room mini-game)

The third game in the hub, and the only one you can play alone. A 4×4
swipe-and-merge puzzle: equal tiles combine and climb a coffee ladder — seed,
cherry, green bean, roast, grind, filter, decoction, milk, kaapi, tumbler, and
finally a **davara**. No timer, no opponent, instant restart, one-step undo.

The other two games need a table of friends and a shared room code; a customer
waiting alone had nothing to play. This is for them.

The full specification lives in [`BEAN-MERGE.md`](BEAN-MERGE.md).

### It has no backend

This game adds **no API route, no model, no collection, no socket, and no
environment variable**. It is pure frontend, so it works even with the API
switched off entirely — `GAME_ENABLED` is irrelevant to it. Only
`VITE_GAME_ENABLED` controls whether the hub card and route appear.

The only thing it stores is a best score in the browser's `localStorage`. Nothing
leaves the device, and there is no account, no PII and nothing to clean up.

### Notes

- It is DOM rather than canvas on purpose: that makes it fully keyboard-playable
  (arrow keys or WASD), and every cell is readable by a screen reader as its row,
  column and tile name. The a11y suite audits the whole board.
- Its lazy chunk is held to a tighter **60 KB** budget than the other two, since
  it has no canvas engine or realtime client to carry.
- It shares no code with the other games. As with them, deleting it means
  deleting its folder, its route, its hub card block and its bundle-check entry.

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

### Slow connections and the mobile welcome

The welcome illustration is inline SVG with a short CSS steam animation; it
needs no image request or animation library and respects reduced motion. A
small coffee placeholder is also included in the HTML so the initial JavaScript
download does not leave an empty page. Failed route downloads offer a reload.

On a direct menu visit, category and product requests start before the lazy menu
screen finishes loading. They share query keys and URL filters with the screen,
so requests already in flight are reused. Other routes do not prefetch the menu.
The existing 30-second query freshness and server-side order validation remain
in place. Offline queries resume on reconnect, and a long initial menu request
shows an explanation after eight seconds without restarting the request.

Category photos use lazy loading, asynchronous decoding, and 480/768-pixel JPEG
variants in `apps/web/src/assets/categories`. Vite gives them content-hashed
URLs. Across the five photos, the new variants total about 107 KB / 209 KB,
compared with 486 KB for the originals (78% / 57% smaller). The browser chooses
the size for its viewport and pixel density. Custom product image URLs are
preserved; upload appropriately sized photos for those as well. Original public
files remain available for older pages. No service worker or persistent menu
cache is used, and ordering still requires connectivity.

These improvements reduce download cost and overlap requests; they do not
eliminate Render's free-instance cold start. The host may still take time to
wake after inactivity. Regression coverage includes request deduplication,
offline recovery, slow-response feedback, image fallback, and failed route
downloads (`menu-performance.test.tsx`, `menu-page.test.tsx`, and
`route-loading.test.tsx`).

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
