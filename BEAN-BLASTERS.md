# BEAN-BLASTERS.md — "Bean Blasters" mini-game module

> Companion spec to `AGENTS.md` and a **sibling** to `KAAPI-KARTS.md`. Coding
> agents working on this game **must read `AGENTS.md` first**, then this file.
> Everything in `AGENTS.md` (TypeScript strict, layering, server-authoritative
> rules, security, testing gates, commit style, Definition of Done) still
> applies. This file only adds what is specific to this game.
>
> **Bean Blasters** is a placeholder name. The shop owner may rename it; keep the
> name in one constant (`GAME_DISPLAY_NAME`) so a rename is a one-line change.
>
> **Relationship to Kaapi Karts.** Bean Blasters is the _second_ game in the
> `/games` hub. It deliberately copies Kaapi Karts' architecture — in-memory
> rooms, a server-authoritative state machine, a TTL-expiring results
> collection, a framework-free canvas engine — but shares **no code** with it.
> The two features are independent folders that can be deleted separately
> (§3). Where this game departs from the kart game, §3a says why.

---

## 1. Goal

A tiny multiplayer arena brawl that a table of customers plays on their own
phones while waiting for their order. Two to six baristas fling roasted coffee
beans at each other across a roastery floor for **two minutes**. Most beans
landed wins; the player with the fewest **buys the coffee**.

It is entertainment only. It must never touch real orders, payments, money,
stock, staff accounts, or customer records. The "who pays" result is a
non-binding suggestion shown with a disclaimer.

**Tone.** This is a food fight, not a gunfight. Nobody is shot, wounded, or
killed. A hit is a **splash** — the victim is dusted with coffee grounds, spins
out, and loses a heart. Running out of hearts sends you off for a **refill
break** for six seconds, then you rejoin. The vocabulary in code and UI is
"blast", "splash", "splashed", "refill" — never "kill", "death", "damage" or
"weapon" in player-facing copy.

## 2. Scope

### In scope (V1)

- A **Bean Blasters** card on the existing `/games` hub and its own
  `/games/bean-blasters/*` route subtree.
- **Create room** → 4-character room code + shareable link + QR code.
- **Join room** from another phone via link or code. **Min 1, max 6 players.**
  Solo is allowed for the same reason as the kart game: so the arena can be
  tested on one phone.
- Lobby: each player gets a **badge number** and a colour, toggles "Ready".
  Same lobby grammar as Kaapi Karts so a returning player already knows it.
- Host starts the round when 1–6 players are present and ready (or force-starts).
- **Synchronised 3-2-1-GO countdown**, then everyone fights in the same arena.
- Top-down 2D **twin-thumb** arena combat: left thumb moves, right thumb aims
  and fires. **120-second round.**
- **3 hearts**, a 6-bean clip with a reload, finite-speed beans you must **lead**,
  and **cover** that blocks both movement and shots.
- Four **power-ups** on respawning pads: rapid fire, triple shot, shield, refill.
- **The server resolves every hit** — see §7a. Clients never award themselves a
  splash.
- Rivals shown as translucent **ghost baristas** (position broadcast best-effort).
- Server owns the authoritative **scores and final standings**.
- **Results screen**: podium + "Badge 07 buys the coffee ☕" reveal.
- **Rematch** keeps the same room and players.
- Animated, skippable **how-to-play** screen before the first round.
- Full light/theme alignment with the existing MUI design system.
- Reconnect to an in-progress room after a network blip or the phone locking.

### Out of scope (V1) — do not build

- Any weapon that is not a thrown coffee bean. No projectile variety beyond the
  three power-up firing modes.
- Teams, class selection, loadouts, progression, unlockables, cosmetics store.
- Accounts, logins, friend lists, chat, or any free-text input from players.
- Persistent leaderboards, profiles, XP.
- Real money, wagering, linking the result to an actual order or bill total.
- Native iOS/Android app builds.
- Bots / AI opponents. An empty arena is a valid (dull) round.
- Destructible cover, or cover that moves.
- Matchmaking with strangers. Rooms are private, code-only.
- Sound is optional; if added it must default to muted and be toggleable.

## 3. Non-negotiable isolation rules

Bean Blasters must be deletable in one move, and must not be able to break
either the shop app **or** Kaapi Karts.

1. **All new frontend code lives in** `apps/web/src/features/bean-blasters/`.
   One shared sub-folder `.../bean-blasters/engine/` for the canvas/game loop.
2. **All new backend code lives in** `apps/api/src/modules/arena/` and follows
   the existing layering: `routes → validation → controller → service →
repository → model`.
3. **Never import from `features/kaapi-karts/` or `modules/game/`, and never
   let them import from here.** The two games share the design system, the
   theme, `SiteHeader`, and the environment config — nothing else. Duplicated
   constants (the room-code alphabet, the colour palette) are **deliberate**:
   they let either game be deleted without touching the other.
4. **New routes only.** Frontend: `/games/bean-blasters/*`, additive and
   lazy-loaded, mounted alongside the existing `/games/*` splat in
   `apps/web/src/App.tsx`. Backend: one router at `/api/arena` in
   `apps/api/src/app.ts`, behind the same `if (arenaRouter)` optional-wiring
   pattern.
5. **No changes** to: `Order`, `Product`, `Category`, `User`, `PriceHistory`
   models; auth; checkout; cart; admin; reports; CORS origin list (reuse it);
   existing tests; **any file under `modules/game/` or `features/kaapi-karts/`
   except the one hub card described in rule 7.**
6. **One new MongoDB collection only:** `arenaresults`, carrying a TTL index so
   it self-deletes. Rooms are held in memory (§6).
7. **The single permitted shared-surface edit** is one game card added to
   `apps/web/src/features/kaapi-karts/GamesHubPage.tsx`, delimited by
   `// --- Bean Blasters card ---` comments. That hub already says "More games
   may appear here later" and is the intended extension point. Removing Bean
   Blasters means removing that block. Nothing else in the kart feature is
   touched. `SiteHeader` is **not** changed — the existing "Games" entry
   already points at the hub that now lists both games.
8. **No new environment variables.** The game reuses the flags Kaapi Karts
   already ships with (§14). This is a deliberate product decision: the two
   games turn on and off together.
9. **Bundle budget.** The battle engine and screens must be a **lazy chunk
   ≤ 150 KB gzipped**, fetched only when a player enters a lobby, and measured
   in CI **separately** from the Kaapi Karts budget (§11). Neither game may
   leak into the eager entry chunk.
10. **Socket.IO** attaches to the existing HTTP server on its **own
    `path`** (§8). It must reuse the existing `cors` origin config and must not
    change the Express middleware stack for `/api/*` or disturb the kart game's
    socket server.
11. If the game is deleted later, removing the feature folder, the module
    folder, the two routes, the hub card block, the two `app.ts`/`server.ts`
    wiring blocks, and the bundle-check entry must fully remove it with no
    other edits.

## 3a. Where this game deliberately differs from Kaapi Karts

Copying the kart game's decisions blindly would produce a worse shooter. These
departures are intentional; do not "fix" them back.

| Decision        | Kaapi Karts                                                                    | Bean Blasters                                                   | Why                                                                                                                                                                            |
| --------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Camera rotation | Rotates with the kart                                                          | **Fixed orientation**, follows the player                       | Aiming is absolute. A rotating view would make the aim stick disagree with the screen every frame. The kart game rotates because _steering_ is relative; here _aiming_ is not. |
| Camera clamping | Never clamped (a rotated viewport does not map onto an axis-aligned rectangle) | **Clamped to arena bounds**                                     | With no rotation the clamp is well-defined, and it stops the walls sliding around distractingly.                                                                               |
| World shape     | Closed spline loop, infinite laps                                              | **Walled rectangle with cover**                                 | Positioning and line-of-sight are the skill, not racing lines.                                                                                                                 |
| Movement        | Steer + auto-accelerate, heavy grip/drift                                      | **Omnidirectional, snappy, low inertia**                        | Twin-stick brawls read as unresponsive with kart inertia.                                                                                                                      |
| Facing          | Heading = direction of travel                                                  | **Facing is the aim, independent of movement**                  | Strafing while shooting is the core skill.                                                                                                                                     |
| Server's job    | Validates _reported_ finish times; resolves _contact_                          | **Owns hit resolution outright** and steps every bean           | A shooter's whole scoreboard is hits. Reported hits would be trivially forgeable. See §7a.                                                                                     |
| Ranking         | Fastest time                                                                   | **Most splashes landed**, fewest taken as tiebreak              |                                                                                                                                                                                |
| Round end       | All finished, or a 150 s cap                                                   | **Always exactly 120 s**                                        | A fixed round keeps the wait predictable and everyone plays to the whistle.                                                                                                    |
| Elimination     | n/a                                                                            | **None.** Out of hearts = 6 s refill break, then back in with 2 | Nobody sits out watching their friends play.                                                                                                                                   |

## 4. Player identity & badge numbers

- **Field size is 1 to 6.** `MIN_PLAYERS` is 1 so the arena can be tested on a
  single phone. Set it to 2 to make the game strictly social; the service test
  covers both rules.
- **No names, no PII.** A player is: a server-generated `playerId` (opaque,
  stored in that phone's `localStorage` under `bean-blasters:playerId`), a
  **badge number**, and a **colour**.
- **Badge number rules** (identical grammar to the kart game's car numbers):
  - Integer **1–99**, displayed zero-padded to 2 digits ("07").
  - **Unique within a room.** Server assigns the lowest free number on join.
  - Changeable to any currently-unused number in `LOBBY` only.
  - Released when a player leaves.
  - Validated server-side; rejected with `NUMBER_TAKEN` / `INVALID_NUMBER`.
- **Colour:** from a fixed palette of 6 (§9), unique within a room.
- Optional display emoji from a fixed allow-list of 12. No custom text ever.

## 5. Room lifecycle (server-authoritative state machine)

```
LOBBY ──(host starts, 1–6 ready)──▶ COUNTDOWN ──(3s)──▶ BATTLE
  ▲                                                        │
  │                                                  (120s elapsed)
  │                                                        ▼
  └──────────────(rematch)────────────────────────────  RESULTS
                                                           │
                                    (idle TTL OR host closes OR empty)
                                                           ▼
                                                        CLOSED  (swept from memory)
```

- Only the **host** (room creator; auto-promote the next player if the host
  leaves) can start, force-start, or close.
- **Capacity enforced server-side** on every join: 7th join gets `ROOM_FULL`.
  A join into a non-`LOBBY` room gets `ROOM_IN_PROGRESS`.
- `COUNTDOWN` start timestamp (`roundStartsAt`, server clock) is broadcast so
  all phones start the same instant; clients offset-correct with a `time:ping`
  acknowledgement.
- **Mid-round disconnect:** the slot is kept and marked `isConnected: false`.
  The barista **stops moving and stops firing** — there is no auto-pilot. It
  remains a valid target (it is standing there, after all), which is a small
  penalty for leaving and keeps hit resolution simple. Reconnect before the
  whistle and you resume control.
- **The round always runs the full 120 seconds** — it does not end early when
  one player is left, because there is no elimination.
- **Everyone leaves:** room closes immediately.
- **Rooms live in memory** with a sweeper that closes anything idle past
  `GAME_ROOM_TTL_MINUTES`. `arenaresults` rows carry a TTL from
  `GAME_RESULT_TTL_HOURS` (default 24 h) and contain no PII.

## 6. Data models

> **Implementation decision:** rooms are held **in memory**, not in MongoDB,
> for exactly the reasons recorded in `KAAPI-KARTS.md` §6 — a single Render
> instance, a room only has meaning while its players hold live sockets, and a
> restart drops every socket anyway. **Round results still persist** so the
> results screen survives a socket drop. If the API is ever scaled past one
> instance, this store and the kart game's must both move to Redis.

### ArenaRoom — in-memory record (`arena-room-store.ts`, not a collection)

- `code` — 4 chars, uppercase, alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`
- `status` — `LOBBY | COUNTDOWN | BATTLE | RESULTS | CLOSED`
- `hostPlayerId`
- `arenaId` — which arena layout (V1: 1 fixed arena)
- `players[]` — `{ playerId, badgeNumber, colour, emoji, isReady, isConnected,
joinedAt, hearts, downedUntil, invulnerableUntil, ammo, reloadingUntil,
powerUp, powerUpUntil, shieldHits, hits, taken, downs, suspect, pose }`
- `beans[]` — live projectiles, server-side only (§7a)
- `pads[]` — power-up pad state `{ kind, availableAt }`
- `roundStartsAt` / `roundEndsAt` — Date or null
- `lastActivityAt` — Date; swept past `GAME_ROOM_TTL_MINUTES`

### ArenaResult (`arenaresults`)

- `roomCode`
- `arenaId`
- `finishedAt`
- `standings[]` — `{ badgeNumber, colour, emoji, rank, hits, taken, downs,
disconnected, suspect }`
- `payerBadgeNumber` — the lowest-ranked badge (the "buys coffee" suggestion)
- `expiresAt` — Date, **TTL index**

No `_id` of any shop document may appear. No PII.

## 7. Server authority & anti-cheat

The server owns: room state, capacity, badge/colour uniqueness,
`roundStartsAt`, the 120 s whistle, **every hit**, **every score**, power-up
ownership, and the final standings + payer.

Clients own only their own **movement**, and even that is bounded:

- `arena:pos` is accepted at most `POSITION_BROADCAST_HZ` times a second;
  excess frames are dropped silently, never punished.
- A position that implies a speed above `BARISTA.maxSpeed * SPEED_TOLERANCE`
  since the last accepted packet is **clamped toward the reported point** and
  the player is flagged `suspect: true`. There is no punishment system — a
  casual game just needs one phone to be unable to hand itself the win.
- Positions inside a wall or an obstacle are pushed back out server-side.
- `arena:fire` is validated before a bean exists (§7a).
- Scores are **only ever incremented by the server**, never reported by a
  client. There is no client→server "I hit someone" event, by design.
- Rate-limit `POST /api/arena/rooms` at `GAME_MAX_ROOMS_PER_IP_PER_HOUR`
  (default 10) via a **separate `express-rate-limit` instance** — it must not
  share a counter with the kart game's limiter.
- Room `code` has ≈ 31⁴ ≈ 900k space; on collision, regenerate.
- No player-supplied HTML/markdown is rendered anywhere.

## 7a. Hit resolution (fully server-side)

**This is the heart of the game and it cannot live on the phones.** The
reasoning is the same one recorded in `KAAPI-KARTS.md` §7a, only sharper: each
phone simulates its own barista and draws rivals from interpolated ghosts that
are up to a broadcast interval stale. If each phone judged its own shots, two
players would routinely disagree about whether a bean connected, and — worse —
the entire scoreboard would be a number each client simply asserts. A shooter
whose score is client-reported is a shooter with no score.

So the server runs a **combat tick** at `COMBAT_TICK_HZ` (30 Hz) over authoritative
state. Logic lives in `apps/api/src/modules/arena/combat.ts` as **pure,
unit-tested functions**; the service owns only the timers around them.

**Firing.** On `arena:fire` `{ x, y, angle }` the server checks, in order:

1. Room is in `BATTLE` and the player is not `downed`.
2. Time since that player's last accepted shot ≥ `MIN_FIRE_INTERVAL_MS`
   (deliberately below the client's own cadence, to tolerate network jitter
   while still rejecting a rapid-fire hack).
3. The player has ammo and is not mid-reload. Ammo is server-side truth.
4. The reported origin is within `MAX_ORIGIN_DRIFT` of the server's last known
   position for that player.

A rejected shot is dropped silently — no error event, because a laggy honest
phone would otherwise spam the player with warnings. Accepted shots decrement
server ammo, spawn one bean (or three, spread by `TRIPLE.spreadRad`, under the
triple power-up) and broadcast `arena:shot` so every client can draw it.

**Stepping.** Each combat tick advances every bean by `speed * dt` and, for each,
tests in this order:

1. Lifetime expired → despawn.
2. Segment intersects an obstacle or the arena wall → despawn (this is what
   makes cover real).
3. Segment intersects a rival's circle (`BARISTA.radius`), skipping the
   shooter, downed players, and players still inside their post-hit invulnerability
   → **hit**.

Beans are swept as **segments**, not points, so a fast bean cannot tunnel
through a thin player or a thin crate between ticks.

**On a hit** the server, and only the server:

- decrements a shield charge if the victim has one, and otherwise a heart;
- grants the victim `INVULNERABLE_MS` of immunity so one triple-shot cannot
  strip three hearts in a frame;
- applies knockback along the bean's direction;
- increments the shooter's `hits` and the victim's `taken`;
- sends the victim to a refill break for `DOWNED_MS` if hearts reach zero,
  then respawns them at the spawn point furthest from any live rival with
  `RESPAWN_HEARTS`;
- broadcasts one `arena:hit` verdict that **both clients obey without
  question**.

Clients never decide a hit, never decrement their own hearts, and never adjust
a score. They render what the verdict tells them.

## 8. API & realtime contract

### REST (`/api/arena`, mounted only when `GAME_ENABLED`)

Response envelope is the project standard: `{ success, data, meta, error }`.

- `GET  /api/arena/health` — `{ enabled: true }` (used by the hub wake-ping).
- `POST /api/arena/rooms` — body `{ arenaId? }` → `{ code, playerId, hostPlayerId }`.
  Rate-limited.
- `POST /api/arena/rooms/:code/join` — body `{ playerId? }` (present = reconnect)
  → room snapshot + `playerId` + assigned `badgeNumber`, `colour`. Rejects with
  `ROOM_FULL`, `ROOM_NOT_FOUND`, `ROOM_IN_PROGRESS`.
- `GET  /api/arena/rooms/:code` — current snapshot (join-screen preview).
- `GET  /api/arena/results/:code` — last result (results-screen fallback).

### Socket.IO

**Bean Blasters runs its own Socket.IO server on its own `path`**
(`ARENA_SOCKET_PATH = "/arena.io/"`), namespace `ARENA_SOCKET_NAMESPACE =
"/arena"`, room = `code`.

This is the isolation mechanism, and it is worth stating plainly: Kaapi Karts
already calls `new Server(httpServer, …)` at Socket.IO's default path
`/socket.io/`. Two Socket.IO servers can share one HTTP server **only if their
`path` options differ** — engine.io routes the upgrade by path. Giving this
game its own path means neither game's socket server has to know the other
exists, and deleting either one cannot break the other. Adding a namespace to
the kart game's server instead would have coupled them and violated §3.5.

Client → server:

- `room:hello` `{ code, playerId }` — (re)attach connection to a slot.
- `room:leave`
- `lobby:setReady` `{ isReady }`
- `lobby:setBadge` `{ badgeNumber?, colour?, emoji? }` — LOBBY only, validated.
- `round:start` `{ force }` — host only; server validates count & readiness.
- `arena:pos` `{ x, y, aim }` — throttled to ≤ 15/s; broadcast as ghosts.
- `arena:fire` `{ x, y, angle }` — validated per §7a; never trusted for hits.
- `arena:reload` — request a reload; server owns the timer.
- `round:rematch` — host only; resets to LOBBY keeping players.
- `time:ping` — acknowledgement carrying the server's `now`.

Server → client:

- `room:state` — full authoritative snapshot on every meaningful change.
- `round:countdown` `{ roundStartsAt, serverTime }`
- `round:go` `{ roundEndsAt, serverTime }`
- `arena:ghost` `{ badgeNumber, x, y, aim, hearts, downed }`
- `arena:shot` `{ badgeNumber, x, y, angle, beanIds }`
- `arena:hit` `{ shooterBadge, victimBadge, x, y, victimHearts, shielded, downed }`
- `arena:respawn` `{ badgeNumber, x, y, hearts }`
- `arena:ammo` `{ ammo, reloadingUntil }` — to the firing socket only.
- `arena:pad` `{ padIndex, kind, availableAt, takenBy }`
- `arena:power` `{ badgeNumber, kind, until }`
- `arena:score` `{ scores: [{ badgeNumber, hits, taken, downs }] }` — throttled.
- `round:results` `{ standings, payerBadgeNumber }`
- `game:error` `{ code, message }`

The authoritative event and payload shapes are the `ServerToClientEvents` /
`ClientToServerEvents` maps in `arena-contract.ts`. **That file is the
contract; this list is a summary and the code wins if they disagree.**

Socket CORS = the existing `CLIENT_URL` origin. Auth = none; the `playerId` is
the only credential and only scopes a player to their own slot in one room.

## 9. Design system alignment

Pull from `apps/web/src/theme.ts` — do not invent a second palette. The rules
are identical to `KAAPI-KARTS.md` §9 and are summarised here only where this
game adds something.

- **Primary** `#6f3219`, **primary.dark** `#442012`, **primary.light** `#a85d36`,
  **secondary** `#b85f16`. **Surfaces** `#fbf6ee` / `#fffdf8`.
  **Text** `#2d1b13` / `#715b50`. **Success** `#28734f`.
- Radius 16 for cards; pill buttons, `min-height: 44`, weight 700 — use
  `<Button>`, don't restyle. Touch targets ≥ 44×44.
- **Icons:** MUI **Outlined** set only. This game's hub card uses
  `SportsMmaOutlinedIcon`; the header entry is unchanged.
- **Type:** Georgia serif for `h1`–`h3`, Inter for body and the battle HUD,
  tabular-nums for the round clock and score.
- **Six badge colours**, same values as the kart palette so the two games look
  like siblings, redeclared locally per §3.3:
  `#6f3219`, `#b85f16`, `#28734f`, `#1f6f8b`, `#8a5a1c`, `#7d3350`.
- **Arena palette** (canvas only): floor `#efe3d2`, boards `#d8c4a8`, wall
  `#6f3219`, cover `#8a5a1c`, bean `#3f2415`, splash `#b85f16`.
- **Safe areas:** honour `env(safe-area-inset-*)`.
- Animation uses **MUI transitions + CSS keyframes** via `sx`. `framer-motion`
  is **not** added, for the reason in `KAAPI-KARTS.md` §9.
- Respect **`prefers-reduced-motion`**: cross-fade instead of slide, no screen
  shake, no splash particles, keep the countdown legible but static. Never
  remove essential feedback — the hit banner still appears.

## 10. Screen-by-screen

Every screen needs explicit **loading / empty / error** states (project rule).

1. **Games hub** — `/games` (existing page, one card added)
   - The Bean Blasters card sits beside Kaapi Karts: pitch, player-count chip,
     "2 minutes" chip, Play button.

2. **Start / Join** — `/games/bean-blasters`
   - **Create room** and **Join with code**. Join accepts a 4-char code
     (auto-uppercase, ignores spaces, normalises to the unambiguous alphabet)
     or arrives pre-filled from `/games/bean-blasters/r/:code`.
   - Fires the **wake-ping** (`GET /api/arena/health`) on mount.
   - Error states: room not found, room full, round already in progress.

3. **How to play** (first visit, then skippable) — 3-card carousel:
   1. "**Left thumb moves. Right thumb aims and throws.**"
   2. "**Beans travel — lead your target. Crates stop them.**"
   3. "**2 minutes. Most splashes wins. Fewest buys the coffee ☕.**"
   - "Got it" stores `bean-blasters:seenHowTo`. A "?" button reopens it.

4. **Lobby**
   - Every player as a **numbered badge tile** (big number, colour, ready tick,
     host badge, "you" marker, connection dot).
   - Your controls: change number (grid of free numbers), change colour, Ready.
   - Host sees **Start round** (enabled per §5) and **Force start**.
   - Share row: room code in large tabular type, **Copy link**, **Show QR**
     (client-side, lazily imported).
   - Empty state: "Waiting for players — share the code."
     Error: "Reconnecting…" with auto-retry and a manual retry button.

5. **Countdown** — full-screen 3 · 2 · 1 · **GO**, synced to `roundStartsAt`,
   with the arena visible behind it. Request **screen wake lock** here.

6. **Battle** — the canvas
   - HUD: hearts (top-left), round clock counting **down** from 2:00
     (tabular-nums), your splash count, a live mini scoreboard of badges by
     score, an **ammo strip** of 6 pips with a reload sweep, and the active
     power-up chip with its remaining time.
   - Controls: **left half** = floating virtual joystick (appears where the
     thumb lands); **right half** = drag to aim with a visible aim line, release
     or hold to throw; a **reload** button bottom-right. Translucent so they
     never hide the arena. Desktop: WASD/arrows + mouse aim + click, `R` to
     reload.
   - Camera follows the player, **does not rotate**, clamped to arena bounds.
   - Rivals render as translucent **ghost baristas** with their badge number,
     heart pips, and a dimmed state while downed.
   - A hit shows a centre banner — green "Splashed badge NN!" when you dealt it,
     red "Badge NN got you!" when you took it — plus distinct haptics, a brief
     screen-edge tint, and a splash decal that fades.
   - Being downed shows a **refill overlay** with a countdown, the arena still
     visible and readable behind it.
   - Socket drop mid-round: keep rendering, show an "offline" chip, stop
     accepting your input into the score, resync on reconnect from `room:state`.
   - No pause (multiplayer). A hidden tab pauses the render loop; the barista
     stands still and stays a target (§5).
   - Leaving the route mid-round triggers `room:leave`, confirmed by a dialog.

7. **Results**
   - Podium (P1–P3) with badge numbers rising in, then full standings with
     splashes landed / taken.
   - **Payer reveal:** "**Badge 07 buys the coffee ☕**" with a settle animation
     and the disclaimer: _"Just for fun — settle the bill however you like."_
   - Actions: **Rematch** (host), **Leave**. Non-hosts see "Waiting for host…".

8. **Error / closed room** — friendly "This room has closed" with a button back
   to `/games/bean-blasters`.

## 11. Testing & quality gates

Backend (`apps/api/tests/arena-*.test.ts`, Vitest + Supertest):

- Room create returns a valid unique code; the rate limiter blocks the 11th/hour
  **and does not share a counter with the kart limiter**.
- Join enforces min 1 / max 6; 7th join → `ROOM_FULL`. Asserts both the
  solo-allowed and solo-refused rules so changing `MIN_PLAYERS` needs no rewrite.
- Badge assignment: lowest-free, uniqueness, release on leave, reject taken /
  out-of-range.
- State machine: illegal transitions rejected; `round:start` requires host and
  readiness (or `force`).
- **Combat (`arena-combat.test.ts`, against the pure functions):**
  - a bean fired down a clear line hits, and the verdict is identical whichever
    order packets arrive in;
  - a crate between shooter and target stops the bean, and so does a wall;
  - a fast bean **cannot tunnel** a thin target between ticks (the segment sweep);
  - the shooter cannot hit themselves;
  - an invulnerable victim, a downed victim, and a disconnected-but-standing
    victim are handled per §7a;
  - a shield absorbs before hearts, and expires;
  - triple shot spawns three beans and one volley cannot strip more than one
    heart, because of the invulnerability window;
  - hearts reaching zero downs the victim and schedules a respawn at the point
    furthest from live rivals;
  - fire cadence below `MIN_FIRE_INTERVAL_MS` is rejected, as is a shot with no
    ammo, mid-reload, or from an origin beyond `MAX_ORIGIN_DRIFT`;
  - a teleporting position packet is clamped and flags `suspect`.
- Standings + `payerBadgeNumber`: most hits → P1, ties broken by fewer taken
  then deterministically by badge; last place is the payer; disconnected players
  are ranked on what they scored.
- The 120 s whistle ends the round and ranks the field.
- Host leaves → next player promoted. Expired room → `ROOM_NOT_FOUND`.
- TTL fields set on the persisted result.
- A socket integration test with 2–3 clients running a full LOBBY→RESULTS round.

Frontend (`apps/web/tests/bean-blasters-engine.test.ts`, pure engine modules):

- Movement: reaches but never exceeds `maxSpeed`; stops within the expected
  distance; cannot pass through a wall or a crate from any approach angle.
- Aiming is independent of movement (strafing preserves facing).
- The local projectile pool **allocates nothing after construction** and
  recycles correctly when exhausted.
- The client's predicted bean flight matches the server's pure stepper for the
  same inputs — the property that keeps the two from drifting apart.
- Camera clamps to arena bounds and never shows outside the wall.

Frontend UI (`apps/web/tests/bean-blasters-ui.test.tsx`, Vitest + RTL):

- How-to-play shows on first visit, hidden after `seenHowTo`, reopenable.
- Lobby renders badge tiles; ready toggle & number picker disabled outside
  `LOBBY`.
- Join errors (full / not found / in progress) render the right message.
- Reduced-motion path renders without slide animations.
- HUD shows hearts, the counting-down clock, and the ammo strip.
- The hub card is hidden when `VITE_GAME_ENABLED` is false.

a11y (`npm run test:a11y` must still pass):

- Lobby, join, how-to and results are fully keyboard operable and axe-clean.
- The battle canvas has a meaningful `aria-label` and a visually-hidden live
  region announcing hearts, splashes and the final placing. The battle itself is
  not expected to be fully playable by keyboard/SR in V1 — **document this
  limitation**, as the kart game does.

CI additions:

- The Bean Blasters lazy chunk gzipped size is asserted ≤ 150 KB, tracked
  **separately** from the Kaapi Karts budget in `scripts/check-game-bundle.mjs`.
- Neither game may appear in the eager entry chunk.
- The existing `GAME_ENABLED=true` job leg covers this game too (§14).

## 12. Phase 2 (documented, not built in V1)

- More arenas + an arena vote in the lobby.
- Team mode (3v3) and a capture-the-cup objective mode.
- Spectator mode for late joiners.
- Sound design — muted by default, per-device toggle.
- Replay of the final ten seconds on the results screen.
- Device-tilt aiming (needs the iOS permission prompt).

## 13. Mobile-specific requirements

Identical in spirit to `KAAPI-KARTS.md` §13.

- **Orientation:** portrait; do not force landscape.
- **Screen wake lock** on countdown, released on results / unmount. Fail
  silently if unsupported.
- **Haptics:** `navigator.vibrate` on landing a splash, taking one, and on GO;
  behind a settings toggle.
- **Input:** on-screen touch is the default and only guaranteed scheme. Both
  thumb zones must work simultaneously — **the canvas must handle multi-touch
  properly** (track `Touch.identifier`, never assume one active touch). This is
  the single most likely mobile bug in this feature; the UI test asserts two
  simultaneous pointers.
- **Performance:** cap devicePixelRatio at 2, drop to 1.5 then 1 if frame time
  exceeds 22 ms for a second. Pause the RAF loop when the tab is hidden. The
  per-frame hot path allocates nothing — beans come from a pre-allocated pool.
- **Network:** assume 4G with 100–300 ms RTT and occasional stalls. Position and
  fire events are fire-and-forget; never block a frame on the socket.
- **Battery / data:** one round ≈ a few hundred KB. No video, no large textures
  — everything is canvas vector primitives.
- **Safe areas:** HUD and controls stay inside `env(safe-area-inset-*)`.

## 14. Environment variables

**None are added.** Bean Blasters deliberately reuses every flag Kaapi Karts
already ships with, so Vercel and Render need **no configuration change** to
run both games:

| Variable                         | Owner | How this game uses it                                     |
| -------------------------------- | ----- | --------------------------------------------------------- |
| `GAME_ENABLED`                   | API   | Mounts `/api/arena` and attaches the arena socket server. |
| `GAME_ROOM_TTL_MINUTES`          | API   | Idle-sweep TTL for arena rooms.                           |
| `GAME_RESULT_TTL_HOURS`          | API   | TTL on `arenaresults.expiresAt`.                          |
| `GAME_MAX_ROOMS_PER_IP_PER_HOUR` | API   | Its own limiter instance, same limit.                     |
| `VITE_GAME_ENABLED`              | Web   | Shows the hub card and mounts the routes.                 |
| `VITE_GAME_SOCKET_URL`           | Web   | Socket origin; falls back to `VITE_API_BASE_URL`.         |

**The accepted trade-off:** the two games share one on/off switch and cannot be
released independently. That was a deliberate instruction — it keeps the
deployment surface at exactly two flags no matter how many games the hub grows.
If they ever need separate switches, add `GAME_BLASTERS_ENABLED` /
`VITE_GAME_BLASTERS_ENABLED` defaulting to the shared flag's value, so existing
deployments keep working untouched.

## 15. New dependencies

**None.** `socket.io`, `socket.io-client` and `qrcode-generator` are already
installed for the kart game and are reused. Do **not** add a game engine
(Phaser, Pixi, Three, Matter, Babylon) — the arena is simpler to draw than the
race track. Revisit only if the hand-rolled renderer cannot hold 60 fps on a
mid Android, and document the measurement that forced it.

## 16. Deployment

- **Render (API):** no config change. The arena socket server shares the
  existing HTTP server on a different path (§8). The free instance sleeps, so
  rooms are ephemeral and lost on redeploy — acceptable and expected.
- **Vercel (web):** no config change. The socket connects straight to the Render
  origin because a rewrite cannot carry a WebSocket upgrade — the same reason
  and the same resolved URL as the kart game.
- **MongoDB Atlas:** create the **TTL index** on `arenaresults.expiresAt`
  (`expireAfterSeconds: 0`) plus one on `arenaresults.roomCode`. Mongoose
  creates these automatically unless `autoIndex` is disabled in production —
  verify they exist, because without the TTL index results never expire.
- Ship with the flags off, verify the rest of the app and Kaapi Karts are
  untouched, then flip the existing flags to release both games.

## 17. Build order

1. **Contract first** (`arena-contract.ts`, both copies). Nothing else can be
   written until this is frozen.
2. Backend module skeleton: model + repository + room store + service + Zod
   schemas + REST router, wired behind `GAME_ENABLED`. Unit tests for
   room/badge/state logic (no sockets yet).
3. **Pure combat module** (`combat.ts`) + its tests. Build this before the
   socket layer — it is the part most likely to be wrong and the easiest to
   test in isolation.
4. Socket layer: own path + namespace, `room:hello`, lobby events, `room:state`
   broadcasts. Integration test with 2 fake clients.
5. Round orchestration: countdown, combat tick, whistle, scores, standings +
   payer, rematch. Tests.
6. Frontend scaffolding: routes, hub card, wake-ping, Start/Join with all states.
7. Lobby UI: badge tiles, pickers, ready, host controls, share + QR.
8. How-to-play + `localStorage` gate + reduced-motion path.
9. Canvas engine: fixed-timestep loop, arena, barista movement, bean pool,
   obstacles, power-ups, camera. Tune to "medium".
10. Battle view: countdown sync, ghosts, HUD, multi-touch controls, wake lock,
    disconnect handling.
11. Results screen: podium, payer reveal, rematch/leave.
12. a11y pass, bundle-size check, mobile perf pass, `README.md`, CI.

## 18. Definition of Done

Everything in `AGENTS.md` §17, plus:

- A full 3-player round can be played start to finish on three phones on one
  room code, on mobile Chrome and mobile Safari, with **two thumbs working at
  once**.
- Min 1 / max 6 enforced server-side; badge numbers always unique and validated
  on the server.
- **No hit, score or heart change ever originates from a client.**
- Lowest score is correctly identified as the payer, including when players
  disconnect.
- No existing route, model, or test is modified, and **nothing under
  `modules/game/` or `features/kaapi-karts/` is touched except the one hub card
  block**.
- With the flags off, the app builds, deploys, and behaves exactly as before.
- Both games' lazy chunks are within budget and neither is in the entry chunk.
- The round holds ~60 fps on a mid-range Android.
- Results self-expire via TTL; no PII is collected.
- `README.md` documents the game, the shared flags, and the new Atlas indexes.

## 19. Where the code lives

```text
apps/api/src/modules/arena/
  arena-contract.ts        THE contract — constants, arena, wire types, socket maps
  combat.ts                pure hit resolution, bean stepping, fire validation (§7a)
  arena-standings.ts       pure ranking and payer selection
  arena-room-store.ts      in-memory rooms + code generation + TTL sweeper
  arena-service.ts         lifecycle, badges, state machine, round orchestration
  arena-socket.ts          own-path Socket.IO server and the broadcast listener
  arena-routes.ts          REST router + its own room-creation rate limiter
  arena-controller.ts      request handlers
  arena-schemas.ts         Zod validation for REST bodies and socket payloads
  arena-result-model.ts    the one Mongoose model (arenaresults, TTL index)
  arena-result-repository.ts
  arena-types.ts           server-only record types
  index.ts                 createArenaModule() — what server.ts wires

apps/web/src/features/bean-blasters/
  arena-contract.ts        byte-for-byte mirror of the API copy
  engine/                  framework-free canvas engine (no React, no sockets)
    arena-geometry.ts      walls, obstacles, spawn points, line-of-sight
    barista-physics.ts     pure fixed-step movement + collision response
    bean-pool.ts           pre-allocated projectile pool, zero per-frame allocation
    arena-renderer.ts      floor, boards, crates, pads
    barista-renderer.ts    barista body, badge number, hearts, downed state
    battle-engine.ts       RAF loop, fixed camera, ghosts, adaptive quality
  use-arena-socket.ts      typed Socket.IO client, clock offset, reconnect
  BattlePage.tsx           engine ↔ socket integration
  (remaining .tsx)         start/join, how-to-play, lobby, HUD, controls, results
```

**The two `arena-contract.ts` copies must stay identical.** Change one, copy it
over the other. They are the only reason the client and server agree on the
arena, the timings and the wire format.

## 20. Current tuning values

Handy summary. The contract is authoritative; this table is a reading aid.

| Setting                  | Value            | Note                                           |
| ------------------------ | ---------------- | ---------------------------------------------- |
| Players                  | 1–6              | `MIN_PLAYERS` is 1; see §4                     |
| Round length             | 120 s            | fixed; no early end                            |
| Hearts                   | 3                | respawn with 2 after a refill break            |
| Refill break             | 6 s              | no elimination                                 |
| Post-hit invulnerability | 1.2 s            | stops a triple-shot stripping three hearts     |
| Barista top speed        | 220 u/s          | omnidirectional, snappy                        |
| Bean speed               | 520 u/s          | ~0.8 s flight at typical range — you must lead |
| Bean range               | 1.1 s ≈ 570 u    |                                                |
| Clip / reload            | 6 beans / 1.15 s | 220 ms between throws                          |
| Server fire floor        | 180 ms           | below the client cadence, tolerates jitter     |
| Arena                    | 1600 × 1200 u    | walled, with cover                             |
| Combat tick              | 30 Hz            | server-side, segment-swept                     |
| Position broadcast       | 15 Hz            | best-effort, untrusted                         |
| Power-up respawn         | 12 s             | four pads                                      |

If you change the arena's obstacles, re-run the engine test: it asserts that
every spawn point is reachable and that no pad is embedded in cover.
