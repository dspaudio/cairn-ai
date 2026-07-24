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

test("planning and work contracts require staged complexity reassessment", async () => {
  const surfaces = [
    "skills/cairn-plan/SKILL.md",
    "skills/cairn-work/SKILL.md",
    "commands/cairn-plan.md",
    "commands/cairn-work.md",
    ".agents/workflows/cairn-plan.md",
    ".agents/workflows/cairn-work.md",
    "docs/model-guidance/README.md",
    "docs/model-guidance/codex.md",
    "docs/model-guidance/claude.md",
    "templates/work-plan.md",
  ];

  for (const path of surfaces) {
    const content = await read(path);
    assert.match(content, /request checkpoint/i, `${path}: request checkpoint`);
    assert.match(content, /planning checkpoint/i, `${path}: planning checkpoint`);
    assert.match(content, /code checkpoint/i, `${path}: code checkpoint`);
    assert.match(content, /Light Path[\s\S]*Heavy Path|Heavy Path[\s\S]*Light Path/i, `${path}: path escalation`);
    assert.match(content, /plan artifact[\s\S]*repository goal task roadmap[\s\S]*(?:native )?UI plan/i, `${path}: synchronized route roadmap`);
    assert.match(content, /stop(?: further)? edit|before (?:the )?first edit|before mutating/i, `${path}: fail-closed edit gate`);
    assert.match(content, /stale/i, `${path}: stale evidence`);
  }

  const worker = await read("agents/worker.md");
  assert.match(worker, /new Heavy Path signal/i);
  assert.match(worker, /stop(?: further)? edits/i);
  assert.match(worker, /orchestrator/i);

  const planIndex = await read("templates/PLAN.md");
  assert.match(planIndex, /request, planning, and code checkpoints/i);
});

test("reasoning effort routing inherits models and follows path task roles", async () => {
  const common = await read("docs/model-guidance/README.md");
  assert.match(common, /model.*(?:always )?inherit/i);
  assert.match(common, /Light Path[\s\S]*planning.*implementation.*verification.*`?medium`?/i);
  assert.match(common, /Heavy Path[\s\S]*planning.*review.*implementation.*`?high`?/i);
  assert.match(common, /final verification.*review.*`?xhigh`?/i);
  assert.match(common, /unsupported host.*effective.*inherited/is);
  assert.match(common, /new(?:ly)? (?:dispatched|delegated) task.*reasoning[-_ ]effort option/is);
  assert.match(common, /do not (?:change|alter|override).*model.*global config/is);

  for (const path of ["docs/model-guidance/codex.md", "docs/model-guidance/claude.md", "agents/worker.md"]) {
    const content = await read(path);
    assert.match(content, /requested.*reasoning effort/i, `${path}: requested effort`);
    assert.match(content, /effective.*reasoning effort/i, `${path}: effective effort`);
    assert.match(content, /model.*inherit/i, `${path}: inherited model`);
    assert.match(content, /new(?:ly)? (?:dispatched|delegated) task|new worker/i, `${path}: new-task boundary`);
    assert.match(content, /unsupported.*inherited/is, `${path}: unsupported fallback`);
  }

  for (const path of ["templates/work-plan.md", "skills/cairn-plan/SKILL.md", "skills/cairn-work/SKILL.md"]) {
    const content = await read(path);
    assert.match(content, /Requested reasoning effort/i, `${path}: requested profile`);
    assert.match(content, /Effective reasoning effort/i, `${path}: effective profile`);
    assert.match(content, /completed.*profiles?.*preserv/is, `${path}: completed profile preservation`);
    assert.match(content, /incomplete.*profiles?.*(?:recalculate|replace)/is, `${path}: incomplete profile recalculation`);
    assert.match(content, /plan artifact[\s\S]*repository goal task roadmap[\s\S]*(?:native )?UI plan[\s\S]*reasoning effort profile/i, `${path}: four-surface synchronization`);
  }
});

test("package and CI contracts include every runtime artifact and supported node/os matrix", async () => {
  const packageJson = JSON.parse(await read("package.json"));
  const pluginJson = JSON.parse(await read(".codex-plugin/plugin.json"));
  assert.equal(packageJson.version, "0.2.6");
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
    assert.match(content, /modified.*(?:preserv|conflict|보존|충돌)|(?:preserv|conflict|보존|충돌).*modified/i, `${path}: modified target preservation`);
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
