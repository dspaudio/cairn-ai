import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(".");
const readJson = async (path) => JSON.parse(await readFile(resolve(root, path), "utf8"));

test("package and plugin metadata expose the same machine-consumed version", async () => {
  const packageJson = await readJson("package.json");
  const pluginJson = await readJson(".codex-plugin/plugin.json");

  assert.equal(packageJson.version, "0.2.7");
  assert.equal(pluginJson.version, packageJson.version);
  assert.deepEqual(packageJson.bin, {
    cairn: "scripts/cairn.mjs",
    "cairn-ai": "scripts/cairn.mjs",
  });
  assert.ok(packageJson.files.includes("scripts/*.mjs"));
  assert.ok(!packageJson.files.includes("scripts/"));
  assert.equal(packageJson.scripts.prepack, "npm run check");
});
