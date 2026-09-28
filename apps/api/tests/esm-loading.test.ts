import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

const apiRoot = fileURLToPath(new URL("..", import.meta.url));
const sourceRoot = join(apiRoot, "src");

// Entry points that start servers or run scripts as soon as they are imported.
const SKIPPED = [/^server\.ts$/, /^scripts[\\/]/, /\.d\.ts$/];

const sourceModules = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceModules(path);
    const relativePath = relative(sourceRoot, path);
    return entry.name.endsWith(".ts") && !SKIPPED.some((pattern) => pattern.test(relativePath))
      ? [path]
      : [];
  });

describe("module loading", () => {
  // Vitest's bundler smooths over CommonJS/ESM interop, so an import such as
  // `import { connection } from "mongoose"` passes unit tests yet crashes the real server.
  // This loads every module with Node's own ESM loader, as `tsx` and `node dist` do.
  it("loads every API module with Node's own ESM loader", () => {
    const modules = sourceModules(sourceRoot).map((path) => pathToFileURL(path).href);
    const script = `
      const failures = [];
      for (const url of ${JSON.stringify(modules)}) {
        try { await import(url); } catch (error) { failures.push(url + " -> " + String(error)); }
      }
      if (failures.length) { console.error(failures.join("\\n")); process.exit(1); }
    `;
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "--eval", script],
      { cwd: apiRoot, encoding: "utf8", timeout: 120_000 },
    );

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(modules.length).toBeGreaterThan(50);
  }, 150_000);
});
