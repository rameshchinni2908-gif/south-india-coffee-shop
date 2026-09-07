# BEAN-MERGE.md — "Bean Merge" mini-game module

> Companion spec to `AGENTS.md` and a sibling to `KAAPI-KARTS.md` and
> `BEAN-BLASTERS.md`. Everything in `AGENTS.md` still applies; this file only
> adds what is specific to this game.
>
> **Bean Merge** is a placeholder name, held in one constant
> (`GAME_DISPLAY_NAME`) so a rename is a one-line change.

---

## 1. Goal

A single-player swipe-and-merge puzzle for one customer with a few minutes to
kill. Swipe a 4×4 grid; equal tiles merge and climb the coffee ladder, from a
seed to a **davara** — the traditional tumbler-and-saucer a filter coffee is
served in. No timer, no pressure, no opponent, instant restart.

It is entertainment only. It never touches orders, payments, stock, staff
accounts or customer records.

**Why this game.** The other two mini-games need other people: Kaapi Karts and
Bean Blasters both want a table of friends and a shared room code. A customer
waiting alone has nothing to play. This one is for them — learnable in a single
sentence, playable one-handed while holding a coffee, and pausable simply by
putting the phone down.

## 2. Scope

### In scope (V1)

- A **Bean Merge** card on the `/games` hub and a `/games/bean-merge` route.
- 4×4 grid. Swipe or arrow-key in four directions; every tile slides that way.
- Two equal tiles that collide **merge into the next rung** and score its value.
- A new tile (90% seed, 10% cherry) appears after any move that changed the board.
- **Eleven rungs**, seed → davara. Reaching davara wins; play continues after.
- **Game over** when no move can change the board.
- **Best score** kept in `localStorage`. Nothing leaves the device.
- **One-step undo**, so a misswipe does not end a good run.
- Skippable how-to-play, matching the other two games' pattern.
- Full light/theme alignment with the existing MUI design system.
- Keyboard playable and screen-reader legible (§7).

### Out of scope (V1) — do not build

- Any server involvement: no API route, no database, no socket, no account.
- Online leaderboards, daily challenges, timed modes, power-ups, undo beyond
  one step, or an ads/rewards loop.
- Grid sizes other than 4×4.
- Sound.

## 3. Non-negotiable isolation rules

1. **All new code lives in** `apps/web/src/features/bean-merge/`, with pure
   game logic under `.../bean-merge/engine/`.
2. **There is no backend.** This game adds no route to `apps/api`, no model, no
   collection, no socket, and no environment variable. If a change to this
   feature requires touching `apps/api`, the change is wrong.
3. **Never import from `features/kaapi-karts/` or `features/bean-blasters/`,
   and never let them import from here.** Duplicated helpers are deliberate.
4. **New route only:** `/games/bean-merge`, additive and lazy-loaded in
   `apps/web/src/App.tsx`.
5. **No changes** to any existing model, route, test, or to the other two
   games — except the one hub card in rule 6.
6. **The single permitted shared-surface edit** is one `<GameCard>` on
   `apps/web/src/features/kaapi-karts/GamesHubPage.tsx`, in a delimited block,
   exactly as Bean Blasters does it.
7. **No new environment variables.** It shows and routes behind the existing
   `VITE_GAME_ENABLED`. Because there is no server, `GAME_ENABLED` is
   irrelevant to it — this game works with the API switched off entirely.
8. **Bundle budget:** its own lazy chunk, **≤ 60 KB gzipped** (it is far
   smaller than the other two and should stay that way), measured in CI, and it
   must never reach the eager entry chunk.
9. Deleting the game must be: delete the feature folder, the route, the hub card
   block, and the bundle-check entry. Nothing else.

## 4. The ladder

Eleven rungs. The value is what the tile is worth and what merging two of them
scores.

| Value | Name       | Note                   |
| ----- | ---------- | ---------------------- |
| 2     | Seed       | spawns 90% of the time |
| 4     | Cherry     | spawns 10% of the time |
| 8     | Green bean |                        |
| 16    | Roast      |                        |
| 32    | Grind      |                        |
| 64    | Filter     |                        |
| 128   | Decoction  |                        |
| 256   | Milk       |                        |
| 512   | Kaapi      |                        |
| 1024  | Tumbler    |                        |
| 2048  | **Davara** | the win                |

Merging past davara keeps doubling and is simply labelled by value, so a strong
run is never cut short.

## 5. Rules the engine must obey

These are the properties the engine test pins down; they are what make the game
feel right rather than merely work.

- A move slides every tile as far as it can go in that direction, then merges.
- **Each tile merges at most once per move.** `[2,2,2,2]` swiped left becomes
  `[4,4]`, never `[8]`.
- Merges resolve **from the leading edge**. `[2,2,4]` swiped left is `[4,4]`,
  not `[2,8]`.
- A move that changes nothing is **rejected**: no score, no spawn, no undo entry.
- A new tile only appears after a move that changed the board, and only on an
  empty cell.
- Score increases by the **value of the tile created**, not the tiles consumed.
- Game over is "no direction changes the board", which is stricter than "the
  grid is full" — a full grid with an adjacent equal pair is still playable.
- The engine is **pure**: it takes a grid and returns a new grid, with
  randomness injected so tests are deterministic.

## 6. Screens

1. **Hub card** on `/games`, alongside the other two, marked as a solo game.
2. **Board** — `/games/bean-merge`
   - Score and best score, tabular-nums, above the grid.
   - 4×4 grid, tiles labelled with their name (value shown small beneath).
   - **New game** and **Undo** buttons; undo is disabled when there is nothing
     to undo.
   - Swipe anywhere on the grid; arrow keys and WASD on desktop.
   - A win banner the first time davara is reached, dismissible so play
     continues.
   - Game-over overlay with the final score and a **Play again** button.
3. **How to play** — one short dialog, `localStorage`-gated, reopenable from a
   "?" button.

Every screen needs its loading / empty / error states only insofar as they
apply; this game has no network, so the only real states are playing, won and
game over.

## 7. Accessibility

This is the most accessible of the three games and should stay that way — it is
DOM, not canvas, precisely so it can be.

- The grid is a labelled region; each occupied cell is readable as its row,
  column and tile name.
- Fully playable by keyboard: arrows and WASD.
- A visually-hidden live region announces the score after each move, and
  announces the win and game-over states.
- Respect `prefers-reduced-motion`: tiles appear and merge without slide or
  pop animation.
- Touch targets ≥ 44 px; the grid never requires a precise gesture, only a
  direction.

## 8. Testing

`apps/web/tests/bean-merge-engine.test.ts` — pure engine, deterministic RNG:

- every rule in §5, each as its own assertion;
- all four directions, including that a right-swipe is the mirror of a left;
- a full-but-playable grid is not game over, and a full-with-no-pairs grid is;
- undo restores the exact previous grid and score, and only one step is kept;
- the spawn distribution is 90/10 across a large sample with a seeded RNG.

`apps/web/tests/bean-merge-ui.test.tsx` — Vitest + RTL:

- arrow keys move tiles and update the score;
- the how-to dialog shows on first visit and is hidden after;
- best score persists to `localStorage` and renders on reload;
- undo is disabled at the start and enabled after a move;
- game over renders when no move is possible;
- reduced-motion path renders.

CI: the bundle check counts this game separately against its 60 KB budget.

## 9. Dependencies

**None.** No canvas, no game engine, no animation library — MUI transitions and
CSS transforms cover everything.

## 10. Where the code lives

```text
apps/web/src/features/bean-merge/
  merge-contract.ts       constants, the ladder, storage keys
  merge-paths.ts          the one route path
  merge-preferences.ts    best score + how-to flag in localStorage
  use-merge-reduced-motion.ts
  engine/
    grid.ts               pure move/merge/spawn/game-over logic
    index.ts
  MergeTile.tsx           one tile
  MergeBoard.tsx          the 4x4 grid and gesture handling
  BeanMergePage.tsx       score, controls, dialogs, state
  MergeHowToDialog.tsx
  bean-merge-routes.tsx
  index.ts
```
