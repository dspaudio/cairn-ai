import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { agentNames, commandNames, skillNames } from "../scripts/cairn-lifecycle.mjs";

const root = resolve(".");
const read = (path) => readFile(resolve(root, path), "utf8");

const expectedCommandNames = [
  "cairn-doctor",
  "cairn-install",
  "cairn-memory",
  "cairn-plan",
  "cairn-review",
  "cairn-toolcheck",
  "cairn-uninstall",
  "cairn-upgrade",
  "cairn-work",
];
const expectedAgentNames = ["explorer", "worker"];
const expectedSkillNames = ["cairn-memory", "cairn-plan", "cairn-review", "cairn-work"];

test("package excludes the retired shell state runtime", async () => {
  await assert.rejects(stat(resolve(root, "scripts/cairn-state.sh")), { code: "ENOENT" });
  const packageJson = JSON.parse(await read("package.json"));
  assert.ok(!packageJson.files.includes("scripts/"));
  assert.ok(packageJson.files.includes("scripts/*.mjs"));

  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const packed = spawnSync(npm, ["pack", "--dry-run", "--ignore-scripts", "--json"], {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  assert.equal(packed.status, 0, packed.stderr);
  const report = JSON.parse(packed.stdout);
  const entry = Array.isArray(report) ? report[0] : report;
  const paths = entry.files.map((file) => file.path);
  assert.ok(paths.includes("scripts/cairn-state.mjs"));
  assert.ok(!paths.includes("scripts/cairn-state.sh"));
});

test("host mirror inventory semantically covers nine commands", async () => {
  assert.deepEqual(commandNames().map((name) => `cairn-${name}`).sort(), expectedCommandNames.sort());
  for (const name of commandNames()) {
    await stat(resolve(root, "commands", `cairn-${name}.md`));
    await stat(resolve(root, ".agents", "workflows", `cairn-${name}.md`));
    await stat(resolve(root, ".claude", "commands", `cairn-${name}.md`));
  }
});

test("host mirror inventory semantically covers two agents and four skills", async () => {
  assert.deepEqual(agentNames().sort(), expectedAgentNames.sort());
  for (const name of agentNames()) {
    await stat(resolve(root, "agents", `${name}.md`));
    await stat(resolve(root, ".claude", "agents", `${name}.md`));
  }

  assert.deepEqual(skillNames().slice().sort(), expectedSkillNames.sort());
  for (const name of skillNames()) {
    await stat(resolve(root, "skills", name, "SKILL.md"));
    await stat(resolve(root, ".agents", "workflows", `${name}.md`));
  }
});

test("CI is least-privilege, bounded, SHA-pinned, and packs without rerunning prepack", async () => {
  const ci = await read(".github/workflows/ci.yml");
  assert.match(ci, /^permissions:\n\s+contents:\s*read$/m);
  assert.match(ci, /^\s+timeout-minutes:\s*\d+$/m);
  assert.match(ci, /actions\/checkout@[0-9a-f]{40}\s+# v4/);
  assert.match(ci, /actions\/setup-node@[0-9a-f]{40}\s+# v4/);
  assert.doesNotMatch(ci, /^\s+- uses: actions\/(?:checkout|setup-node)@v\d/gm);
  assert.match(ci, /npm pack --dry-run --ignore-scripts/);
  assert.equal((ci.match(/^\s+- run: npm run check$/gm) ?? []).length, 1);
});
