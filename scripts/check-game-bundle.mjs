#!/usr/bin/env node
/**
 * Enforces the Kaapi Karts bundle budget from KAAPI-KARTS.md section 3.7.
 *
 * Two things can regress silently:
 *   1. the lazy game chunks growing past the budget, and
 *   2. the game leaking into the main entry chunk, which would make every
 *      customer download a kart game to look at the menu.
 *
 * Run against a web build produced with VITE_GAME_ENABLED=true.
 */

import { gzipSync } from "node:zlib";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ASSETS_DIR = join(process.cwd(), "apps", "web", "dist", "assets");
const BUDGET_BYTES = 150 * 1024;

/** Chunk basenames that belong to the mini-game, matched before the hash. */
const GAME_CHUNK_PREFIXES = [
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
];

/** Proves the track definition never reaches the eager entry chunk. */
const GAME_ONLY_MARKER = "kaapi-circuit";

const gzipSize = (path) => gzipSync(readFileSync(path), { level: 9 }).length;
const formatKb = (bytes) => `${(bytes / 1024).toFixed(2)} kB`;

let files;

try {
  files = readdirSync(ASSETS_DIR);
} catch {
  console.error(`No build found at ${ASSETS_DIR}. Run the web build first.`);
  process.exit(1);
}

const gameChunks = files
  .filter((file) => file.endsWith(".js"))
  .filter((file) => GAME_CHUNK_PREFIXES.some((prefix) => file.startsWith(`${prefix}-`)))
  .map((file) => ({ file, bytes: gzipSize(join(ASSETS_DIR, file)) }))
  .sort((a, b) => b.bytes - a.bytes);

if (gameChunks.length === 0) {
  console.error(
    "Found no Kaapi Karts chunks. Either the build ran without VITE_GAME_ENABLED=true,\n" +
      "or the game stopped being code-split — both need a look.",
  );
  process.exit(1);
}

const total = gameChunks.reduce((sum, chunk) => sum + chunk.bytes, 0);

for (const chunk of gameChunks) {
  console.log(`  ${chunk.file.padEnd(44)} ${formatKb(chunk.bytes).padStart(10)} gzip`);
}

console.log(`\nKaapi Karts lazy chunks: ${formatKb(total)} gzip of ${formatKb(BUDGET_BYTES)}`);

let failed = false;

if (total > BUDGET_BYTES) {
  console.error(`\nBudget exceeded by ${formatKb(total - BUDGET_BYTES)}.`);
  failed = true;
}

const entryChunks = files.filter((file) => file.startsWith("index-") && file.endsWith(".js"));

for (const entry of entryChunks) {
  if (readFileSync(join(ASSETS_DIR, entry), "utf8").includes(GAME_ONLY_MARKER)) {
    console.error(
      `\n${entry} contains "${GAME_ONLY_MARKER}": the game is no longer lazy and now ships\n` +
        "to every visitor. Keep the /games routes behind a lazy import.",
    );
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}

console.log("Bundle budget OK, and the game stayed out of the entry chunk.");
