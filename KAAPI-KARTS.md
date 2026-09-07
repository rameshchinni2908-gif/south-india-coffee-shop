# KAAPI-KARTS.md — "Kaapi Karts" mini-game module

> Companion spec to `AGENTS.md`. Coding agents working on the game **must read
> `AGENTS.md` first**, then this file. Everything in `AGENTS.md` (TypeScript
> strict, layering, server-authoritative rules, security, testing gates, commit
> style, Definition of Done) still applies. This file only adds what is specific
> to the game.
>
> **Kaapi Karts** is a placeholder name (kaapi = South Indian filter coffee).
> The shop owner may rename it; keep the name in one constant
> (`GAME_DISPLAY_NAME`) so a rename is a one-line change.

---

## 1. Goal

A tiny multiplayer kart race that a table of customers plays on their own phones
while waiting for their order, to light-heartedly decide **who pays the bill**
(last place pays). It lives inside the existing JRG South India Coffee Shop web
app as a sub-menu, is mobile-first, medium difficulty, and one race finishes in
**under 2 minutes 30 seconds**.

It is entertainment only. It must never touch real orders, payments, money,
stock, staff accounts, or customer records. The "who pays" result is a
non-binding suggestion shown with a disclaimer.

## 2. Scope

### In scope (V1)

- A **Games** hub route and a **Kaapi Karts** sub-menu entry in site navigation.
- **Create room** → 4-character room code + shareable link + QR code.
- **Join room** from another phone via link or code. **Min 2, max 6 players.**
- Lobby: each player gets a **car number** and a colour, toggles "Ready".
- Host starts the race when 2–6 players are present and ready (or force-starts).
- **Synchronised 3-2-1-GO countdown**, then everyone races the same track.
- Top-down 2D kart racing, **3 laps**, on-screen touch controls, boost pads,
  soft off-track slowdown (no walls, no crashes, no destruction).
- Rivals shown as translucent **ghost karts** (position broadcast best-effort).
- Server owns the authoritative **finish times and final standings**.
- **Results screen**: podium + "Car 07 buys the coffee ☕" reveal animation.
- **Rematch** keeps the same room and players.
- Animated, skippable **how-to-play** screen before the first race.
- Full light/theme alignment with the existing MUI design system.
- Works offline-tolerant: reconnect to an in-progress room after a network blip
  or the phone locking.

### Out of scope (V1) — do not build

- Live kart-to-kart collisions / contact physics (Phase 2, see §12).
- Accounts, logins, friend lists, chat, or any free-text input from players.
- Persistent leaderboards, profiles, XP, unlockables, cosmetics store.
- Real money, wagering, linking the result to an actual order or bill total.
- Native iOS/Android app builds (Capacitor is a later, separate effort).
- Server-side physics simulation or authoritative movement (V1 trusts clients
  for _movement_, validates only _timing and plausibility_ — see §7).
- Matchmaking with strangers. Rooms are private, code-only.
- Sound is optional; if added it must default to muted and be toggleable.

## 3. Non-negotiable isolation rules ("don't disturb current functionality")

1. **All new frontend code lives in** `apps/web/src/features/kaapi-karts/`.
   One shared sub-folder `.../kaapi-karts/engine/` for the canvas/game loop.
2. **All new backend code lives in** `apps/api/src/modules/game/` and follows the
   existing layering: `routes → validation → controller → service →
repository → model`. Do not scatter game files into the existing
   `controllers/`, `services/`, etc. folders.
3. **New routes only.** Frontend: add `/games` and `/games/kaapi-karts/*` to the
   `<Routes>` list in `apps/web/src/App.tsx` — additive, lazy-loaded. Backend:
   mount one router at `/api/game` in `apps/api/src/app.ts`, guarded by the same
   `if (gameService)` optional-wiring pattern already used for `orderService`
   etc.
4. **No changes** to: `Order`, `Product`, `Category`, `User`, `PriceHistory`
   models; auth; checkout; cart; admin; reports; CORS origin list (reuse it);
   existing tests. A diff that modifies any existing model or the order/auth
   flow is wrong.
5. **New MongoDB collections only:** `gamerooms`, `gameresults`. Both carry a
   TTL index so they self-delete (see §6). No cross-references to shop
   collections.
6. **Feature flag.** Backend env `GAME_ENABLED` (default `false`), frontend env
   `VITE_GAME_ENABLED` (default `false`). When off: the router is not mounted,
   the nav entry is hidden, routes redirect to `/`. Shipping the code dark must
   be safe.
7. **Bundle budget.** The Games nav entry and hub may load eagerly. The race
   engine + its assets must be a **lazy chunk** ≤ 150 KB gzipped, fetched only
   when a player enters a lobby. Measure in CI (see §11).
8. **Socket.IO** attaches to the existing HTTP server returned by
   `app.listen(...)`; it must reuse the existing `cors` origin config and must
   not change the Express middleware stack for `/api/*`.
9. If the game is deleted later, removing the feature folder, the module folder,
   the two env vars, the two routes, and the nav entry must fully remove it with
   no other edits.

## 4. Player identity & car numbers

- **No names, no PII.** A player is: a server-generated `playerId` (opaque,
  stored in that phone's `localStorage` under `kaapi-karts:playerId`), a **car
  number**, and a **car colour**.
- **Car number rules:**
  - Integer **1–99**, displayed zero-padded to 2 digits ("07").
  - **Unique within a room.** Server assigns the lowest free number on join.
  - A player may change to any _currently unused_ number while in the lobby
    (`LOBBY` state only), never during `COUNTDOWN`/`RACING`.
  - When a player leaves the lobby, their number is released.
  - Numbers are validated server-side on every assignment; a client-supplied
    number that is taken or out of range is rejected with `NUMBER_TAKEN` /
    `INVALID_NUMBER`.
- **Colour:** chosen from a fixed palette of 6 (see §9), unique within a room,
  same assignment/release rules as numbers.
- Optional display: one emoji from a fixed allow-list of ~12 (☕ 🐯 🚀 🌶️ 🥥 …).
  No custom text ever.

## 5. Room lifecycle (server-authoritative state machine)

```
LOBBY ──(host starts, 2–6 ready)──▶ COUNTDOWN ──(3s)──▶ RACING
  ▲                                                        │
  │                                              (all finished OR 150s cap)
  │                                                        ▼
  └──────────────(rematch)────────────────────────────  RESULTS
                                                           │
                                    (idle 5 min OR host closes OR empty)
                                                           ▼
                                                         CLOSED  (row TTL-expires)
```

- Only the **host** (room creator; auto-promote the next player if the host
  leaves) can start, force-start, or close.
- **Capacity is enforced on the server** on every join attempt: 7th join gets
  `ROOM_FULL`. A join into a non-`LOBBY` room gets `ROOM_IN_PROGRESS` (offer
  "watch" as spectator — optional, Phase 2 — or "wait for next race").
- `COUNTDOWN` start timestamp (`raceStartsAt`, server clock) is broadcast so all
  phones start the same instant; clients schedule GO locally against it and
  should NTP-style offset-correct using a `serverTime` ping on connect.
- **Mid-race disconnect:** the kart becomes an auto-pilot "ghost" that keeps
  moving at reduced speed so it can still be ranked (normally last). If the
  player reconnects before the cap, they resume control.
- **Everyone leaves:** room closes immediately.
- **Room row** persists only enough to allow reconnect; TTL 60 min from
  `lastActivityAt`. `gameresults` TTL 24 h (only for a short "recent races"
  list; contains no PII).

## 6. Data models

> **Implementation decision (2026-09-07):** rooms are held **in memory**, not in
> MongoDB. The API runs as a single Render instance, and a room only has meaning
> while its players hold live sockets — a restart drops every socket anyway, so a
> persisted room row would only ever be resurrected as an orphan. Keeping rooms in
> a process-local store with a TTL sweeper removes a whole write path, a model, and
> its failure modes, and costs nothing we would actually have used. **Race results
> still persist to MongoDB** so the results screen survives a socket drop.
> If the API is ever scaled past one instance, this is the piece that must move to
> Redis or Mongo first.

### GameRoom — in-memory record (`room-store.ts`, not a collection)

- `code` — 4 chars, uppercase, unambiguous alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no O/0/I/1)
- `status` — `LOBBY | COUNTDOWN | RACING | RESULTS | CLOSED`
- `hostPlayerId`
- `trackId` — which track layout (V1: 1–3 fixed tracks)
- `players[]` — `{ playerId, carNumber, colour, emoji, isReady, isConnected, joinedAt }`
- `raceStartsAt` — Date or null
- `raceEndsAt` — Date or null (cap = raceStartsAt + 150s)
- `lastActivityAt` — Date; a sweeper closes rooms idle past `GAME_ROOM_TTL_MINUTES`

### GameResult (`gameresults`)

- `roomCode`
- `trackId`
- `finishedAt`
- `standings[]` — `{ carNumber, colour, finishMs | null, lapsCompleted, rank, disconnected }`
- `payerCarNumber` — the last-place car (the "buys coffee" suggestion)
- `expiresAt` — Date, **TTL index**

No `_id` of any shop document may appear in either collection.

## 7. Server authority & anti-cheat (mirrors `AGENTS.md` §8 "never trust the client")

V1 does not simulate physics on the server. It still must **not blindly trust**
what a phone reports:

- The server owns: room state, capacity, car-number/colour uniqueness,
  `raceStartsAt`, the 150s cap, and the **final standings + payer**.
- Clients report their own `finishMs` (ms since GO) and per-lap split times.
  The server **validates plausibility** before accepting:
  - `finishMs` ≥ a `MIN_PLAUSIBLE_RACE_MS` constant (a perfect run of the track).
  - Each lap split ≥ `MIN_PLAUSIBLE_LAP_MS`.
  - `finishMs` ≤ cap; anything not finished by the cap is ranked by
    `lapsCompleted` then distance-along-track at the cap.
  - Monotonic, increasing lap splits; laps count == 3 to be a "finish".
- Implausible submissions are **clamped to the cap and flagged**
  (`suspect: true`) rather than trusted. There is no punishment system; this is
  a casual game, the goal is just that one phone can't hand itself the win.
- Position broadcasts (ghosts) are **best-effort and untrusted** — used for
  rendering only, never for ranking.
- Rate-limit `POST /api/game/rooms` (room creation) hard: max 10 rooms / IP /
  hour via `express-rate-limit` (separate limiter instance, like the login
  limiter pattern). Socket events are rate-limited per connection.
- Room `code` has ≈ 31^4 ≈ 900k space; on collision, regenerate. Codes are not
  secrets but are not enumerable-cheap.
- No player-supplied HTML/markdown is rendered anywhere.

## 8. API & realtime contract

### REST (`/api/game`, mounted only when `GAME_ENABLED`)

Response envelope is the project standard: `{ success, data, meta, error }`.

- `GET  /api/game/health` — `{ enabled: true }` (used by the wake-ping).
- `POST /api/game/rooms` — body `{ trackId? }` → creates room, returns
  `{ code, playerId, hostPlayerId }`. Rate-limited.
- `POST /api/game/rooms/:code/join` — body `{ playerId? }` (playerId present =
  reconnect) → returns room snapshot + `playerId` + assigned `carNumber`,
  `colour`. Rejects with `ROOM_FULL`, `ROOM_NOT_FOUND`, `ROOM_IN_PROGRESS`.
- `GET  /api/game/rooms/:code` — current snapshot (for the join screen preview).
- `GET  /api/game/results/:code` — last result for that room (results screen
  fallback if the socket dropped).

Everything real-time is over **Socket.IO**, namespace `/game`, room = `code`.

### Socket events

Client → server:

- `room:hello` `{ code, playerId }` — (re)attach connection to a slot.
- `lobby:setReady` `{ isReady }`
- `lobby:setCar` `{ carNumber?, colour?, emoji? }` — LOBBY only, validated.
- `race:start` — host only; server validates 2–6 & all-ready (or `force:true`).
- `race:pos` `{ x, y, angle, lap, t }` — throttled to ≤ 15/s; broadcast to room
  as ghosts; never stored.
- `race:finish` `{ finishMs, lapSplits[] }` — server validates (§7) & records.
- `race:rematch` — host only; resets to LOBBY keeping players.
- `room:leave`

Server → client:

- `room:state` — full authoritative snapshot on every meaningful change.
- `serverTime` `{ now }` — reply to a `ping` for clock-offset correction.
- `race:countdown` `{ raceStartsAt }`
- `race:go`
- `race:ghost` `{ carNumber, x, y, angle, lap }` — other players' positions.
- `race:playerFinished` `{ carNumber, rank, finishMs }`
- `race:results` `{ standings[], payerCarNumber }`
- `error` `{ code, message }` — codes: `ROOM_FULL`, `ROOM_NOT_FOUND`,
  `ROOM_IN_PROGRESS`, `NUMBER_TAKEN`, `INVALID_NUMBER`, `NOT_HOST`,
  `NOT_ENOUGH_PLAYERS`, `PLAYERS_NOT_READY`.

Socket CORS = the existing `CLIENT_URL` origin. Auth = none; the `playerId` is
the only credential and only scopes a player to their own slot in one room.

## 9. Design system alignment (use what already exists)

Pull from `apps/web/src/theme.ts` — do not invent a second palette.

- **Primary** `#6f3219` (coffee), **primary.dark** `#442012`,
  **primary.light** `#a85d36`, **secondary** `#b85f16` (burnt orange).
- **Surfaces:** `background.default #fbf6ee`, `background.paper #fffdf8`.
- **Text:** `#2d1b13` / `#715b50`. **Success** `#28734f`.
- **Radius:** 16 (cards/sheets). **Buttons:** fully rounded (pill, radius 999),
  `min-height: 44`, `text-transform: none`, weight 700 — already the MUI
  default in this app; use `<Button>`, don't restyle.
- **Type:** display/headings = Georgia serif (`h1`–`h3`); body/UI = Inter.
  Keep the race HUD in Inter, tabular-nums for timers.
- **Touch targets:** ≥ 44×44 everywhere (matches `MuiIconButton` override).
- **Icons:** MUI **Outlined** set only (the app uses `*OutlinedIcon`
  consistently, e.g. `SportsScoreOutlinedIcon`, `FlagOutlinedIcon`).
- **Header:** reuse `SiteHeader`; add the Games entry there and in the mobile
  menu, styled exactly like the existing "Track order" entry
  (`display: { xs: 'none', md: 'inline-flex' }` button + `xs` icon button).
- **Safe areas:** honour `env(safe-area-inset-*)` as `SiteHeader` already does.
- **Six car colours** (distinct, brand-adjacent, all pass contrast on cream):
  `#6f3219`, `#b85f16`, `#28734f`, `#1f6f8b`, `#8a5a1c`, `#7d3350`.
  Each also has a name for screen readers ("maroon", "amber", …).
- **"International / polished" bar:** generous whitespace, one accent colour per
  screen, restrained motion, real empty/loading/error states (see §10), crisp
  typographic hierarchy, no clip-art. Aim for the feel of a well-made native
  game menu, not a web form.

### Animation

- **Implementation decision (2026-09-07): `framer-motion` was NOT added.** MUI
  already ships `Fade`/`Grow`/`Slide`/`Zoom`/`Collapse`, which cover every
  transition this feature needs at zero extra bytes; `AGENTS.md` §16 says not to
  add a dependency the existing stack can reasonably solve. UI motion therefore
  uses MUI transitions plus CSS `@keyframes` via the `sx` prop. The race itself is
  drawn on canvas and never used framer-motion in any case.
- Respect **`prefers-reduced-motion`**: replace slides/scale with instant
  cross-fades; keep the countdown legible but non-animated; never remove
  essential feedback.
- Target 60 fps on a mid-range Android (e.g. throttled 4× CPU in devtools).
  Budget: the game loop does no allocations per frame, uses `requestAnimationFrame`,
  and a fixed-timestep update (e.g. 60 Hz) with render interpolation.

## 10. Screen-by-screen (web + mobile behaviour)

Every screen needs explicit **loading / empty / error** states (project rule).

1. **Games hub** — `/games`
   - Card grid; V1 has one card: Kaapi Karts. Card shows a one-line pitch and a
     "Play" button. If `VITE_GAME_ENABLED` is false the route redirects to `/`.
   - On mount, fire the **wake-ping** (`GET /api/game/health`) so Render spins up
     before the player taps Play. Show a subtle "waking the track…" state if it
     is slow (> 1.5 s).

2. **Start / Join** — `/games/kaapi-karts`
   - Two actions: **Create room** and **Join with code**.
   - Join accepts a 4-char code (auto-uppercase, ignore spaces) OR arrives
     pre-filled from a deep link `/games/kaapi-karts/r/:code`.
   - Error states: room not found, room full, race already in progress.

3. **How to play** (first visit, then skippable) — animated 3-card carousel:
   1. "**Hold left / right to steer.** You auto-accelerate."
   2. "**Hit the glowing pads for a boost.** Grass slows you down."
   3. "**3 laps. Last place buys the coffee ☕.**"
   - "Got it" dismisses; store `kaapi-karts:seenHowTo = true` in `localStorage`.
   - A small "?" button reopens it from the lobby.
   - Reduced-motion: cards cross-fade instead of sliding; no parallax.

4. **Lobby** — waiting room
   - Shows every player as a **numbered car tile** (big number, colour, ready
     tick, "host" badge, "you" marker, connection dot).
   - Controls for you: change number (grid of free numbers), change colour,
     Ready toggle.
   - Host sees **Start race** (enabled at 2–6 ready) and **Force start**.
   - Share row: room code in large tabular type, **Copy link**, **Show QR**
     (generate client-side; QR lib must be tiny or hand-rolled — or use a
     `<canvas>` QR in the lazy chunk).
   - Empty state: "Waiting for players — share the code." Error: socket
     disconnected → "Reconnecting…" with auto-retry and a manual retry button.

5. **Countdown** — full-screen, 3 · 2 · 1 · **GO**, synced to `raceStartsAt`.
   Brief track preview (start/finish line, first corner) behind it.
   Request **screen wake lock** here; lock orientation if the track is designed
   landscape (see §13 — V1 default is **portrait**, no lock needed).

6. **Race** — the canvas
   - HUD: your car number + colour (corner), **lap x/3**, **race timer**
     (counts up, tabular-nums), mini position list (P1–P6 by progress),
     a "boost ready" pip.
   - Controls (default): full-height **left** and **right** touch zones (hold to
     steer), a **brake** button bottom-centre, auto-accelerate. Big, thumb-
     reachable, translucent so they don't hide the track.
   - Rivals render as **translucent ghost karts** with their number.
   - Off-track = visible slic/slow + tint, no stop, no damage.
   - If the socket drops mid-race: keep rendering locally, show a small
     "offline — still racing" chip, submit `race:finish` via REST fallback
     (`GET/POST` results) when reconnected or at the cap.
   - Pause is **not** allowed (multiplayer); backgrounding the tab = your kart
     auto-pilots (§5).

7. **Results**
   - Podium (P1–P3) with car numbers rising in, then the full standings list.
   - **Payer reveal:** "**Car 07 buys the coffee ☕**" with a settle animation
     and a one-line disclaimer: _"Just for fun — settle the bill however you
     like."_
   - Actions: **Rematch** (host; keeps room), **Leave**. Non-hosts see
     "Waiting for host to start a rematch…".
   - Optional "🎲 Spin instead" mode toggle for a future random-payer variant
     (Phase 2 — stub the button disabled or hide it in V1).

8. **Error / disconnected room** — if the room TTL-expired or was closed:
   friendly "This race room has closed" with a button back to `/games/kaapi-karts`.

## 11. Testing & quality gates (in addition to `AGENTS.md` §11)

Backend (`apps/api/tests/game-*.test.ts`, Vitest + Supertest):

- Room create returns a valid unique code; rate limiter blocks the 11th/hour.
- Join enforces **min 2 / max 6**; 7th join → `ROOM_FULL`.
- Car-number assignment: lowest-free, uniqueness, release on leave, reject taken
  / out-of-range.
- State machine: illegal transitions rejected (e.g. `race:start` with 1 player,
  or from `RACING`).
- `race:start` requires host + all-ready (or `force`).
- Finish-time validation: implausibly fast `finishMs` / lap split is clamped &
  flagged, not trusted.
- Standings + `payerCarNumber` computation: fastest → P1, non-finishers ranked
  by laps then progress, last place is the payer; ties broken deterministically.
- 150 s cap ends the race and ranks the field.
- Host leaves → next player promoted.
- TTL fields set; expired room → `ROOM_NOT_FOUND`.
- A socket integration test with 2–3 clients running a full LOBBY→RESULTS race.

Frontend (`apps/web/src/features/kaapi-karts/**/*.test.tsx`, Vitest + RTL):

- How-to-play shows on first visit, hidden after `seenHowTo`, reopenable.
- Lobby renders numbered tiles; ready toggle & number picker disabled outside
  `LOBBY`.
- Join errors (full / not found / in progress) render the right message.
- Reduced-motion path renders without slide animations.
- HUD shows lap x/3 and a running timer.
- Nav entry hidden when `VITE_GAME_ENABLED` is false.

a11y (`npm run test:a11y` must still pass):

- Lobby, join, how-to, results are fully keyboard operable and axe-clean.
- The race canvas has a meaningful `aria-label` and a visually-hidden live
  region announcing lap changes and final placing (the race is not expected to
  be fully playable by keyboard/SR in V1, but must be **navigable and
  understandable** — document this limitation).

CI additions:

- The lazy game chunk gzipped size is asserted ≤ 150 KB (fail the build if it
  regresses).
- `GAME_ENABLED=false` is the default in CI; add one job leg with it `true`.

## 12. Phase 2 (documented, not built in V1)

- Live kart-to-kart collisions with a lightweight authoritative-ish tick
  (server runs the sim at 20 Hz, clients predict + reconcile). Needs a real
  netcode pass and probably a paid Render instance.
- Spectator mode for late joiners.
- 2–3 more tracks + a track vote in the lobby.
- "🎲 Spin instead" random-payer and "closest to a target time" modes.
- Sound design (engine, boost, crowd) — muted by default, per-device toggle.
- PWA install prompt + offline how-to-play.
- Capacitor wrapper for store distribution (separate `apps/mobile/`), reusing
  the same web feature module in a WebView.

## 13. Mobile-specific requirements

- **Orientation:** V1 track is designed for **portrait**; do not force
  landscape. If a landscape track is added, use the Screen Orientation API and
  show a "rotate your phone" interstitial as a fallback.
- **Screen wake lock:** request `navigator.wakeLock` on countdown, release on
  results / unmount. Fail silently if unsupported.
- **Haptics:** `navigator.vibrate` short pulse on boost pickup and on GO; gate
  behind a settings toggle, off by default on iOS (unsupported / ignored).
- **Input:** on-screen touch zones are the default and only guaranteed scheme.
  Device-tilt steering (`DeviceOrientation`) is Phase 2 and needs the iOS
  permission prompt — do not rely on it.
- **Performance:** cap devicePixelRatio rendering at 2; drop to 1.5 if frame
  time > 22 ms for 1 s. Pause the RAF loop when the tab is hidden.
- **Network:** assume 4G with 100–300 ms RTT and occasional 2–5 s stalls.
  Position broadcasts are fire-and-forget; never block a frame on the socket.
- **Battery / data:** one race ≈ a few hundred KB of socket traffic max. No
  video, no large textures — draw karts and track as vector/canvas primitives
  or a single small sprite sheet (< 40 KB).
- **Safe areas & the notch:** HUD and controls must stay inside
  `env(safe-area-inset-*)`.
- **Back button / navigation:** leaving the route mid-race triggers `room:leave`
  (kart goes auto-pilot); confirm with a dialog during `RACING`.
- **Install:** ship a valid web-app manifest and icons so "Add to Home Screen"
  gives a clean full-screen launch into `/games`.

## 14. Environment variables (additive)

Backend (`apps/api`, add to `.env.example` with safe placeholders):

```text
GAME_ENABLED=false
GAME_ROOM_TTL_MINUTES=60
GAME_RESULT_TTL_HOURS=24
GAME_MAX_ROOMS_PER_IP_PER_HOUR=10
```

Frontend (`apps/web`):

```text
VITE_GAME_ENABLED=false
# Socket base URL; defaults to VITE_API_BASE_URL when unset
VITE_GAME_SOCKET_URL=
```

All must be validated at startup via the existing environment-loading pattern
(`apps/api/src/config/environment.ts`) — no `process.env` reads scattered in
game code.

## 15. New dependencies (keep minimal, justify each)

Actually installed in V1:

- Backend: **`socket.io`** (realtime rooms + reconnect). No others.
- Frontend: **`socket.io-client`**, and **`qrcode-generator`** (tiny,
  dependency-free, lazy-imported only by the share sheet).
- **Not** installed: `framer-motion` — see §9 Animation for why.
- **Do not** add a game engine (Phaser, Pixi, Three, Matter, Babylon) in V1.
  Revisit Pixi only if the hand-rolled canvas renderer cannot hold 60 fps on a
  mid Android — and document the measurement that forced it.

## 16. Deployment additions

- **Render (API):** WebSockets work on the existing Web Service with no config
  change. Note in `README.md` that the free instance sleeps (cold start) and is
  single-instance, so game rooms are ephemeral and lost on redeploy — this is
  acceptable and expected. Do not add a second service.
- **Vercel (web):** the socket connects cross-origin to the Render URL; ensure
  `VITE_GAME_SOCKET_URL` (or `VITE_API_BASE_URL`) points there. SPA rewrites
  already cover the new routes.
- **MongoDB Atlas:** create the **TTL index** on `gameresults.expiresAt`
  (`expireAfterSeconds: 0`) plus an index on `gameresults.roomCode`. Rooms are
  in-memory (§6) so they need no index and no cleanup job.
- **Sockets bypass the Vercel proxy.** The web app normally reaches the API via a
  Vercel rewrite so the admin cookie stays first-party, but a rewrite cannot carry
  a WebSocket upgrade. The game client therefore connects straight to the
  configured `VITE_API_BASE_URL` (or `VITE_GAME_SOCKET_URL` when set). That origin
  must be the Render URL in production, and `CLIENT_URL` on the API must be the
  Vercel origin or the socket handshake will fail CORS.
- **CORS:** unchanged — Socket.IO reuses `CLIENT_URL`. Verify the deployed
  Vercel origin is the configured `CLIENT_URL`.
- Ship with `GAME_ENABLED=false` / `VITE_GAME_ENABLED=false`, verify the rest of
  the app is untouched, then flip the flags to release.

## 17. Build order for the game

1. Backend module skeleton: model + repository + service + Zod schemas + REST
   router, wired behind `GAME_ENABLED`. Unit tests for room/number/state logic
   (no sockets yet).
2. Socket.IO layer: namespace, `room:hello`, lobby events, `room:state`
   broadcasts. Integration test with 2 fake clients.
3. Race orchestration: countdown, `raceStartsAt`, `race:finish` validation,
   standings + payer, 150 s cap, rematch. Tests.
4. Frontend scaffolding: routes, nav entry (flagged), Games hub, wake-ping,
   Start/Join screens with all states.
5. Lobby UI: numbered car tiles, number/colour pickers, ready, host controls,
   share + QR, socket wiring.
6. How-to-play animated screen + `localStorage` gate + reduced-motion path.
7. Canvas engine: fixed-timestep loop, one track, kart kinematics (steer +
   auto-accel + drift feel), off-track slowdown, boost pads, lap detection.
   Tune to "medium" and a ~90–150 s finish.
8. Multiplayer race view: countdown sync, ghost rendering, HUD, touch controls,
   wake lock, disconnect handling + REST fallback.
9. Results screen: podium, payer reveal animation, rematch/leave.
10. a11y pass, bundle-size check, mobile perf pass on a throttled device, docs
    in `README.md`, and the CI flag leg.

## 18. Definition of Done (game)

Everything in `AGENTS.md` §17, plus:

- A full 3-player race can be played start-to-finish on three phones on the
  same room code, on mobile Chrome and mobile Safari.
- Min 2 / max 6 enforced server-side; car numbers always unique and validated
  on the server.
- Last place is correctly identified as the payer, including when players don't
  finish or disconnect.
- No existing route, model, test, or the order/auth/cart/admin flow is modified.
- With the feature flags off, the app builds, deploys, and behaves exactly as
  before, with no Games entry visible.
- The lazy game chunk is within the size budget and the race holds ~60 fps on a
  mid-range Android.
- Rooms and results self-expire via TTL; nothing game-related is stored
  permanently and no PII is collected.
- `README.md` documents the feature, the flags, the Render cold-start caveat,
  and the new Atlas indexes.
