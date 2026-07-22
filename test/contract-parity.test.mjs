import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(".");
const read = (path) => readFile(resolve(root, path), "utf8");

const localeReadmes = [
  "README.md",
  "README.ko.md",
  "README.ja.md",
  "README.zh.md",
  "README.es.md",
  "README.fr.md",
  "README.de.md",
  "README.pt.md",
];

test("all locale READMEs expose the canonical unavailable-installer result", async () => {
  for (const path of localeReadmes) {
    assert.match(await read(path), /`installer-unavailable`/, path);
  }
});

test("work contracts document bounded verification and semantic evidence boundaries", async () => {
  const surfaces = [
    "commands/cairn-work.md",
    "skills/cairn-work/SKILL.md",
    ".agents/workflows/cairn-work.md",
    ".claude/commands/cairn-work.md",
    "docs/model-guidance/README.md",
    "docs/model-guidance/codex.md",
    "templates/work-plan.md",
  ];

  for (const path of surfaces) {
    const content = await read(path);
    assert.match(content, /600(?:,?000)?\s*ms|10 minutes/i, `${path}: default timeout`);
    assert.match(content, /3,?600,?000\s*ms|1 hour/i, `${path}: maximum timeout`);
    assert.match(content, /identity.*fingerprint|fingerprint.*identity/i, `${path}: pre/post binding`);
    assert.match(content, /semantic boundary/i, `${path}: evidence boundary`);
  }
});

test("package and CI contracts include every runtime artifact and supported node/os matrix", async () => {
  const packageJson = JSON.parse(await read("package.json"));
  const pluginJson = JSON.parse(await read(".codex-plugin/plugin.json"));
  assert.equal(packageJson.version, "0.2.3");
  assert.equal(pluginJson.version, packageJson.version);
  assert.match(packageJson.scripts.check, /cairn-safe-fs\.mjs/);
  assert.match(packageJson.scripts.check, /release-integrity-0\.2\.2\.json/);
  assert.equal(packageJson.scripts.prepack, "npm run check");

  const ci = (await read(".github/workflows/ci.yml")).replace(/\r\n?/g, "\n");
  assert.match(ci, /node-version:\s*\[18,\s*(?:current|22|26)\]/);
  assert.match(ci, /ubuntu-latest/);
  assert.match(ci, /windows-latest/);
  assert.match(ci, /macos-latest/);
  assert.match(ci, /uses: actions\/checkout@v4[\s\S]*?with:\s*\n\s+fetch-depth:\s*0/);
  assert.doesNotMatch(ci, /runs-on:[^\n]*\n\s+env:/);
  const runSteps = [...ci.matchAll(/^\s+- run: .+$/gm)];
  const stepCaches = [...ci.matchAll(/^\s+- run: .+\n\s+env:\n\s+npm_config_cache: \$\{\{ runner\.temp \}\}\/npm-cache$/gm)];
  assert.ok(runSteps.length > 0);
  assert.equal(stepCaches.length, runSteps.length);
  assert.match(ci, /npm pack --dry-run/);
});

test("install documentation describes the custom transactional lifecycle", async () => {
  for (const path of localeReadmes) {
    const content = await read(path);
    assert.match(content, /custom marketplace/i, `${path}: custom marketplace`);
    assert.match(content, /versioned (?:Codex )?runtime/i, `${path}: versioned runtime`);
    assert.match(content, /ownership manifest/i, `${path}: ownership manifest`);
    assert.match(content, /stag(?:e|ed|ing)/i, `${path}: staged validation`);
    assert.match(content, /roll(?:s|ed|ing)? ?back/i, `${path}: rollback`);
    assert.match(content, /modified.*(?:preserv|conflict)|(?:preserv|conflict).*modified/i, `${path}: modified target preservation`);
    assert.match(content, /~\/\.gemini\/config\/skills\/cairn-\*\/SKILL\.md/, `${path}: current Antigravity IDE path`);
    assert.match(content, /~\/\.gemini\/antigravity-cli\/skills\/cairn-\*\.md/, `${path}: current Antigravity CLI path`);
    assert.doesNotMatch(content, /\*\.cairn-backup-\*/, `${path}: obsolete backup-only contract`);
  }

  for (const path of ["commands/cairn-install.md", "commands/cairn-upgrade.md", "commands/cairn-uninstall.md", "commands/cairn-doctor.md"]) {
    const content = await read(path);
    assert.match(content, /custom marketplace/i, `${path}: custom marketplace`);
    assert.match(content, /ownership manifest/i, `${path}: ownership manifest`);
    assert.match(content, /roll(?:s|ed|ing)? ?back/i, `${path}: rollback`);
  }
});
