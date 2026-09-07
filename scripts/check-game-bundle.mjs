#!/usr/bin/env node
/**
 * Enforces the mini-game bundle budgets: KAAPI-KARTS.md section 3.7 and
 * BEAN-BLASTERS.md section 3.9.
 *
 * Two things can regress silently for either game:
 *   1. the lazy game chunks growing past the budget, and
 *   2. a game leaking into the main entry chunk, which would make every
 *      customer download it just to look at the menu.
 *
 * Each game is measured SEPARATELY against its own budget, so one game cannot
 * spend the other's headroom.
 *
 * Run against a web build produced with VITE_GAME_ENABLED=true.
 */

import { gzipSync } from "node:zlib";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ASSETS_DIR = join(process.cwd(), "apps", "web", "dist", "assets");
const KB = 1024;

/**
 * One entry per game. `prefixes` are chunk basenames matched before the hash;
 * `marker` is a string that only ever appears in that game's own code, and
 * proves it never reached the eager entry chunk. Each game has its OWN budget,
 * so one cannot spend another's headroom.
 *
 * Chunk basenames must be unique ACROSS games — Vite names a chunk after its
 * entry module, so two features with a `LobbyPage.tsx` would be
 * indistinguishable here. The guard below fails the build if that ever happens.
 */
const GAMES = [
  {
    name: "Secret Sip",
    budget: 60 * KB,
    marker: "Good coffee. Questionable alibis.",
    prefixes: ["SecretSipPage", "sip-contract", "sip-api", "use-sip-room"],
  },
  {
    name: "Kaapi Karts",
    budget: 150 * KB,
    marker: "kaapi-circuit",
    prefixes: [
      "kaapi-karts-routes",
      "GamesHubPage",
      "KaapiKartsStartPage",
      "LobbyPage",
      "RacePage",
      "ResultsPage",
      "RaceHud",
      "RaceControls",
      "CountdownOverlay",
      "HowToPlayDialog",
      "RoomCodeShare",
      "CarTile",
      "GameStates",
      "use-game-socket",
      "game-contract",
      "game-api",
      "game-paths",
      "game-preferences",
      "player-identity",
      "race-engine",
      "qrcode",
      // Vite currently folds game-contract in here; keep it counted wherever it lands.
      "use-reduced-motion",
    ],
  },
  {
    name: "Bean Blasters",
    budget: 150 * KB,
    marker: "roastery-floor",
    prefixes: [
      "bean-blasters-routes",
      "BeanBlastersStartPage",
      "BeanBlastersLobbyPage",
      "BeanBlastersResultsPage",
      "BattlePage",
      "BattleHud",
      "BattleControls",
      "BattleCountdownOverlay",
      "BeanBlastersHowToPlayDialog",
      "BeanBlastersRoomCodeShare",
      "BadgeTile",
      "ArenaStates",
      "use-arena-socket",
      "arena-contract",
      "arena-api",
      "arena-paths",
      "arena-preferences",
      "arena-player-identity",
      "battle-engine",
      "bean-pool",
      "arena-geometry",
      "barista-physics",
      "arena-renderer",
      "barista-renderer",
      "use-arena-reduced-motion",
    ],
  },
  {
    name: "Bean Merge",
    // No canvas, no sockets, no server: it is a fraction of the other two and
    // a tighter budget is what keeps it that way.
    budget: 60 * KB,
    marker: "Davara",
    prefixes: [
      "bean-merge-routes",
      "BeanMergePage",
      "MergeBoard",
      "MergeTile",
      "MergeHowToDialog",
      "merge-contract",
      "merge-paths",
      "merge-preferences",
      "use-merge-reduced-motion",
      "grid",
    ],
  },
];

const gzipSize = (path) => gzipSync(readFileSync(path), { level: 9 }).length;
const formatKb = (bytes) => `${(bytes / 1024).toFixed(2)} kB`;

let failed = false;

// A basename claimed by two games would be silently miscounted, so refuse to run.
for (let i = 0; i < GAMES.length; i += 1) {
  for (let j = i + 1; j < GAMES.length; j += 1) {
    const overlap = GAMES[i].prefixes.filter((prefix) => GAMES[j].prefixes.includes(prefix));

    if (overlap.length > 0) {
      console.error(
        `"${GAMES[i].name}" and "${GAMES[j].name}" both claim chunk name(s): ${overlap.join(", ")}.\n` +
          "Rename one game's module so every chunk basename is unique, or this check\n" +
          "silently bills one game for the other's bytes.",
      );
      process.exit(1);
    }
  }
}

let files;

try {
  files = readdirSync(ASSETS_DIR);
} catch {
  console.error(`No build found at ${ASSETS_DIR}. Run the web build first.`);
  process.exit(1);
}

const jsFiles = files.filter((file) => file.endsWith(".js"));
const entryChunks = jsFiles.filter((file) => file.startsWith("index-"));

for (const game of GAMES) {
  const chunks = files
    .filter((file) => file.endsWith(".js") || file.endsWith(".css"))
    .filter((file) => game.prefixes.some((prefix) => file.startsWith(`${prefix}-`)))
    .map((file) => ({ file, bytes: gzipSize(join(ASSETS_DIR, file)) }))
    .sort((a, b) => b.bytes - a.bytes);

  console.log(`\n${game.name}`);

  if (chunks.length === 0) {
    console.error(
      `  Found no ${game.name} chunks. Either the build ran without VITE_GAME_ENABLED=true,\n` +
        "  or the game stopped being code-split — both need a look.",
    );
    failed = true;
    continue;
  }

  for (const chunk of chunks) {
    console.log(`  ${chunk.file.padEnd(44)} ${formatKb(chunk.bytes).padStart(10)} gzip`);
  }

  const total = chunks.reduce((sum, chunk) => sum + chunk.bytes, 0);

  console.log(`  lazy chunks: ${formatKb(total)} gzip of ${formatKb(game.budget)}`);

  if (total > game.budget) {
    console.error(`  Budget exceeded by ${formatKb(total - game.budget)}.`);
    failed = true;
  }

  for (const entry of entryChunks) {
    if (readFileSync(join(ASSETS_DIR, entry), "utf8").includes(game.marker)) {
      console.error(
        `  ${entry} contains "${game.marker}": ${game.name} is no longer lazy and now\n` +
          "  ships to every visitor. Keep the game routes behind a lazy import.",
      );
      failed = true;
    }
  }
}

if (failed) {
  process.exit(1);
}

console.log("\nEvery game is within its budget and none reached the entry chunk.");
