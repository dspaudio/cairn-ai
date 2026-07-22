import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRuntimeLocator } from "../scripts/cairn-paths.mjs";
import {
  parseCodexFeatureList,
  removeCairnConfig,
  renderInstalledMirror,
  splitSections,
  targetDigest,
  updateConfig,
  verifyLegacy022Root,
} from "../scripts/cairn-lifecycle.mjs";

const root = resolve(".");
const lifecycleScript = join(root, "scripts", "cairn-lifecycle.mjs");
const published022Commit = "521782bf37dd0ab269a14caf7b19660c33243018";

test("Cairn config editing preserves public settings, comments, arrays, and multiline strings", () => {
  const input = [
    "# exact user bytes",
    "[features]",
    "plugins = false # user choice",
    "plugin_hooks = false",
    "multi_agent = false",
    "",
    "[agents]",
    "max_depth = 7",
    "models = [\"a\", \"b\"]",
    "prompt = \"\"\"",
    "[this.is.not.a.section]",
    "still prompt",
    "\"\"\"",
    "",
  ].join("\n");
  const output = updateConfig(input, []);
  assert.match(output, /plugins = false # user choice/);
  assert.match(output, /plugin_hooks = false/);
  assert.match(output, /multi_agent = false/);
  assert.match(output, /max_depth = 7/);
  assert.match(output, /prompt = \"\"\"\n\[this\.is\.not\.a\.section\]/);
  assert.equal(splitSections(output).some((section) => section.header === "this.is.not.a.section"), false);
  assert.equal(removeCairnConfig(output), input);
});

test("install creates custom source, versioned runtime, ownership, and current Antigravity paths", async () => {
  await withHome(async ({ env, paths }) => {
    const result = run("install", env);
    assert.equal(result.status, 0, result.stderr);
    const ownership = JSON.parse(await readFile(paths.ownership, "utf8"));
    assert.equal(ownership.schemaVersion, 1);
    assert.equal(ownership.version, "0.2.3");
    assert.ok(ownership.targets.length > 20);
    await stat(paths.source);
    await stat(paths.versioned);
    await stat(join(env.ANTIGRAVITY_HOME, "skills", "cairn-plan", "SKILL.md"));
    await stat(join(env.ANTIGRAVITY_CLI_HOME, "skills", "cairn-plan.md"));
    const locator = JSON.parse(await readFile(join(paths.source, ".cairn-runtime.json"), "utf8"));
    assert.equal(locator.pluginRoot, paths.versioned);
  });
});

test("four parallel installs serialize safely and leave a healthy installation", async () => {
  await withHome(async ({ env, paths }) => {
    const results = await Promise.all(Array.from({ length: 4 }, () => runAsync("install", env)));
    for (const result of results) assert.equal(result.status, 0, result.stderr);
    const doctor = run("doctor", env);
    assert.equal(doctor.status, hostToolsAvailable() ? 0 : 1, doctor.stdout + doctor.stderr);
    await assert.rejects(stat(join(paths.marketplace, ".cairn", "lifecycle.lock")));
  });
});

test("install and upgrade do not require host CLIs while doctor fails closed", async () => {
  await withHome(async ({ temp, env, paths }) => {
    const emptyBin = join(temp, "empty-bin");
    await mkdir(emptyBin);
    const restrictedEnv = { ...env, PATH: emptyBin };

    const install = run("install", restrictedEnv);
    assert.equal(install.status, 0, install.stderr);
    const upgrade = run("upgrade", restrictedEnv);
    assert.equal(upgrade.status, 0, upgrade.stderr);
    await stat(paths.ownership);
    await stat(paths.versioned);

    const doctor = run("doctor", restrictedEnv);
    assert.equal(doctor.status, 1, doctor.stdout + doctor.stderr);
    assert.match(doctor.stdout, /^FAIL Codex plugin installed$/m);
    assert.match(doctor.stdout, /^FAIL Codex feature plugins$/m);
    assert.match(doctor.stdout, /^FAIL Antigravity CLI readiness$/m);
  });
});

test("lifecycle lock recovers a dead owner and rejects a live owner or nonce replacement", async () => {
  await withHome(async ({ env, paths }) => {
    const lock = join(paths.marketplace, ".cairn", "lifecycle.lock");
    await mkdir(dirname(lock), { recursive: true });
    await writeFile(lock, `${JSON.stringify({ schemaVersion: 1, pid: 99999999, hostname: hostname(), nonce: "dead-owner", acquiredAt: new Date().toISOString() })}\n`);
    assert.equal(run("install", env).status, 0);

    await writeFile(lock, `${JSON.stringify({ schemaVersion: 1, pid: process.pid, hostname: hostname(), nonce: "live-owner", acquiredAt: new Date().toISOString() })}\n`);
    const blocked = run("upgrade", { ...env, CAIRN_LIFECYCLE_LOCK_TIMEOUT_MS: "100" });
    assert.equal(blocked.status, 1);
    assert.match(blocked.stderr, /Timed out waiting for Cairn lifecycle lock/);
    await rm(lock);

    const raced = run("upgrade", { ...env, CAIRN_TEST_REPLACE_LOCK_AFTER_ACQUIRE: "1" });
    assert.equal(raced.status, 1);
    assert.match(raced.stderr, /ownership changed after acquisition/);
  });
});

for (const phase of ["after-codex", "after-claude", "after-antigravity", "after-config"]) {
  test(`failure injection ${phase} rolls back every committed phase`, async () => {
    await withHome(async ({ env, paths }) => {
      const original = "# keep exactly\n[profiles.default]\nmodel = \"gpt-5\"\n";
      await mkdir(env.CODEX_HOME, { recursive: true });
      await writeFile(env.CODEX_CONFIG_PATH, original);
      const result = run("install", { ...env, CAIRN_TEST_FAIL_PHASE: phase });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Injected lifecycle failure/);
      assert.equal(await readFile(env.CODEX_CONFIG_PATH, "utf8"), original);
      await assert.rejects(stat(paths.source));
      await assert.rejects(stat(paths.ownership));
      await assert.rejects(stat(join(env.CLAUDE_HOME, "commands", "cairn-plan.md")));
      await assert.rejects(stat(join(env.ANTIGRAVITY_HOME, "skills", "cairn-plan")));
    });
  });
}

test("upgrade refuses a modified owned mirror and preserves it", async () => {
  await withHome(async ({ env }) => {
    assert.equal(run("install", env).status, 0);
    const mirror = join(env.CLAUDE_HOME, "commands", "cairn-plan.md");
    await writeFile(mirror, "user modification\n");
    const result = run("upgrade", env);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Managed artifact was modified/);
    assert.equal(await readFile(mirror, "utf8"), "user modification\n");
  });
});

test("upgrade failure restores the previous runtime and manifest", async () => {
  await withHome(async ({ env, paths }) => {
    assert.equal(run("install", env).status, 0);
    const beforeRuntime = await readFile(join(paths.versioned, "package.json"), "utf8");
    const beforeManifest = await readFile(paths.ownership, "utf8");
    const result = run("upgrade", { ...env, CAIRN_TEST_FAIL_PHASE: "after-config" });
    assert.equal(result.status, 1);
    assert.equal(await readFile(join(paths.versioned, "package.json"), "utf8"), beforeRuntime);
    assert.equal(await readFile(paths.ownership, "utf8"), beforeManifest);
  });
});

test("an owned 0.2.2 installation upgrades to 0.2.3 and removes only the previous runtime", async () => {
  await withHome(async ({ env, paths }) => {
    assert.equal(run("install", env).status, 0);
    const oldRuntime = await rewriteOwnedVersion(paths, "0.2.2");
    const result = run("upgrade", env);
    assert.equal(result.status, 0, result.stderr);
    await assert.rejects(stat(oldRuntime));
    await stat(paths.versioned);
    const ownership = JSON.parse(await readFile(paths.ownership, "utf8"));
    assert.equal(ownership.version, "0.2.3");
    assert.equal(ownership.targets.find((record) => record.id === "codex-runtime").path, paths.versioned);
    assert.equal(ownership.targets.some((record) => record.id === "previous-codex-runtime"), false);
  });
});

test("cross-version cleanup failure restores the complete 0.2.2 installation", async () => {
  await withHome(async ({ env, paths }) => {
    assert.equal(run("install", env).status, 0);
    const oldRuntime = await rewriteOwnedVersion(paths, "0.2.2");
    const beforeOwnership = await readFile(paths.ownership, "utf8");
    const result = run("upgrade", { ...env, CAIRN_TEST_FAIL_PHASE: "after-cleanup" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Injected lifecycle failure: after-cleanup/);
    await stat(oldRuntime);
    await assert.rejects(stat(paths.versioned));
    assert.equal(await readFile(paths.ownership, "utf8"), beforeOwnership);
    assert.equal(run("upgrade", env).status, 0);
  });
});

test("invalid ownership manifest fails closed", async () => {
  await withHome(async ({ env, paths }) => {
    assert.equal(run("install", env).status, 0);
    await writeFile(paths.ownership, "{not json\n");
    const result = run("upgrade", env);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Ownership manifest is invalid/);
    await stat(paths.source);
  });
});

test("empty ownership targets fail closed before upgrade changes any artifact", async () => {
  await withHome(async ({ env, paths }) => {
    assert.equal(run("install", env).status, 0);
    const protectedFile = join(paths.source, "package.json");
    const before = await readFile(protectedFile, "utf8");
    await writeFile(paths.ownership, `${JSON.stringify({ schemaVersion: 1, plugin: "cairn", targets: [] })}\n`);
    const result = run("upgrade", env);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Ownership manifest schema/);
    assert.equal(await readFile(protectedFile, "utf8"), before);
  });
});

test("a missing required ownership record blocks upgrade without mutations", async () => {
  await withHome(async ({ env, paths }) => {
    assert.equal(run("install", env).status, 0);
    const ownership = JSON.parse(await readFile(paths.ownership, "utf8"));
    ownership.targets = ownership.targets.filter((record) => record.id !== "claude-command-plan");
    await writeFile(paths.ownership, `${JSON.stringify(ownership, null, 2)}\n`);
    const mirror = join(env.CLAUDE_HOME, "commands", "cairn-plan.md");
    const before = await readFile(mirror, "utf8");
    const result = run("upgrade", env);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /complete managed target set/);
    assert.equal(await readFile(mirror, "utf8"), before);
  });
});

test("an unknown ownership record field blocks uninstall without mutations", async () => {
  await withHome(async ({ env, paths }) => {
    assert.equal(run("install", env).status, 0);
    const ownership = JSON.parse(await readFile(paths.ownership, "utf8"));
    ownership.targets[0].unknownField = true;
    await writeFile(paths.ownership, `${JSON.stringify(ownership, null, 2)}\n`);
    const protectedFile = ownership.targets[0].path;
    const before = await targetDigest(protectedFile, ownership.targets[0].type);
    const result = run("uninstall", env);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /invalid or duplicate target/);
    assert.equal(await targetDigest(protectedFile, ownership.targets[0].type), before);
  });
});

test("ownership manifest cannot redirect a managed target outside its allowlist", async () => {
  await withHome(async ({ env, paths }) => {
    assert.equal(run("install", env).status, 0);
    const ownership = JSON.parse(await readFile(paths.ownership, "utf8"));
    ownership.targets[0].path = join(paths.source, "..", "user-data");
    await writeFile(paths.ownership, `${JSON.stringify(ownership, null, 2)}\n`);
    const result = run("upgrade", env);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /outside the Cairn allowlist/);
    await stat(paths.source);
  });
});

test("uninstall preserves modified artifacts and returns conflict", async () => {
  await withHome(async ({ env, paths }) => {
    assert.equal(run("install", env).status, 0);
    const mirror = join(env.ANTIGRAVITY_CLI_HOME, "skills", "cairn-plan.md");
    await writeFile(mirror, "user content\n");
    const result = run("uninstall", env);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Refusing to uninstall modified managed artifacts/);
    assert.equal(await readFile(mirror, "utf8"), "user content\n");
    await stat(paths.source);
  });
});

test("an exact legacy 0.2.2 tree is adopted once and upgraded transactionally", async () => {
  await withHome(async ({ env, paths }) => {
    await createLegacy022(paths.source);
    await verifyLegacy022Root(paths.source);
    const result = run("upgrade", env);
    assert.equal(result.status, 0, result.stderr);
    const ownership = JSON.parse(await readFile(paths.ownership, "utf8"));
    assert.equal(ownership.version, "0.2.3");
    assert.ok(ownership.targets.some((target) => target.id === "codex-source"));
    await stat(paths.versioned);
  });
});

test("a modified legacy runtime file blocks adoption and remains untouched", async () => {
  await withHome(async ({ env, paths }) => {
    await createLegacy022(paths.source);
    const changed = join(paths.source, "scripts", "cairn.mjs");
    await writeFile(changed, "modified legacy runtime\n");
    const result = run("upgrade", env);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /release file was modified/);
    assert.equal(await readFile(changed, "utf8"), "modified legacy runtime\n");
    await assert.rejects(stat(paths.ownership));
  });
});

test("an extra file makes a legacy root invalid and preserves the whole tree", async () => {
  await withHome(async ({ env, paths }) => {
    await createLegacy022(paths.source);
    await writeFile(join(paths.source, "unknown.txt"), "do not delete\n");
    const result = run("upgrade", env);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /file set does not match/);
    assert.equal(await readFile(join(paths.source, "unknown.txt"), "utf8"), "do not delete\n");
  });
});

test("a modified legacy Claude mirror blocks adoption and is preserved", async () => {
  await withHome(async ({ env, paths }) => {
    await createLegacy022(paths.source);
    const locator = join(env.CLAUDE_HOME, "cairn", "runtime.json");
    const mirror = join(env.CLAUDE_HOME, "commands", "cairn-plan.md");
    const source = await readFile(join(paths.source, ".claude", "commands", "cairn-plan.md"), "utf8");
    await mkdir(dirname(mirror), { recursive: true });
    await writeFile(mirror, `${renderInstalledMirror(source, { runtimeRoot: paths.source, locatorPath: locator })}\nuser mutation\n`);
    const result = run("upgrade", env);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Legacy mirror was modified/);
    assert.match(await readFile(mirror, "utf8"), /user mutation/);
  });
});

test("a complete legacy ~/.agents and nested CLI skill tree migrates to current paths", async () => {
  await withHome(async ({ env, paths }) => {
    await createLegacy022(paths.source);
    await createLegacyAntigravity(env, paths.source);
    const result = run("upgrade", env);
    assert.equal(result.status, 0, result.stderr);
    await assert.rejects(stat(join(env.HOME, ".agents", "skills", "cairn-plan")));
    await assert.rejects(stat(join(env.ANTIGRAVITY_CLI_HOME, "skills", "cairn-plan")));
    await stat(join(env.ANTIGRAVITY_HOME, "skills", "cairn-plan", "SKILL.md"));
    await stat(join(env.ANTIGRAVITY_CLI_HOME, "skills", "cairn-plan.md"));
  });
});

test("a modified legacy ~/.agents mirror blocks migration and remains untouched", async () => {
  await withHome(async ({ env, paths }) => {
    await createLegacy022(paths.source);
    await createLegacyAntigravity(env, paths.source);
    const mirror = join(env.HOME, ".agents", "skills", "cairn-plan", "SKILL.md");
    await writeFile(mirror, `${await readFile(mirror, "utf8")}\nuser legacy edit\n`);
    const result = run("upgrade", env);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Legacy mirror was modified/);
    assert.match(await readFile(mirror, "utf8"), /user legacy edit/);
    await assert.rejects(stat(paths.ownership));
  });
});

for (const phase of ["uninstall-after-config", "uninstall-after-external", "uninstall-after-codex", "uninstall-after-ownership"]) {
  test(`${phase} rolls back and a retry preserves unmanaged marketplace children`, async () => {
    await withHome(async ({ env, paths }) => {
      assert.equal(run("install", env).status, 0);
      const unmanaged = join(paths.marketplace, "user-owned", "keep.txt");
      await mkdir(dirname(unmanaged), { recursive: true });
      await writeFile(unmanaged, "keep\n");
      const failed = run("uninstall", { ...env, CAIRN_TEST_FAIL_PHASE: phase });
      assert.equal(failed.status, 1);
      await stat(paths.ownership);
      assert.equal(run("doctor", env).status, hostToolsAvailable() ? 0 : 1);
      const retry = run("uninstall", env);
      assert.equal(retry.status, 0, retry.stderr);
      assert.equal(await readFile(unmanaged, "utf8"), "keep\n");
      await assert.rejects(stat(paths.ownership));
    });
  });
}

test("uninstall recovers an interrupted remove entry before continuing", async () => {
  await withHome(async ({ env, paths }) => {
    assert.equal(run("install", env).status, 0);
    const ownership = JSON.parse(await readFile(paths.ownership, "utf8"));
    const record = ownership.targets.find((target) => target.id === "claude-command-plan");
    const transactionId = "cccccccc-dddd-4eee-8fff-aaaaaaaaaaaa";
    const backup = join(paths.marketplace, ".cairn", "transactions", transactionId, "backup", "0");
    await mkdir(dirname(backup), { recursive: true });
    await rename(record.path, backup);
    await writeJournal(paths, {
      schemaVersion: 1,
      id: transactionId,
      state: "active",
      entries: [{ ...journalEntry(record, backup), expectedNewDigest: "missing", operation: "remove", status: "applied" }],
    });
    const result = run("uninstall", env);
    assert.equal(result.status, 0, result.stderr);
    await assert.rejects(stat(paths.ownership));
  });
});

test("journal schema rejects non-boolean existed and duplicate id/path entries", async () => {
  await withHome(async ({ env, paths }) => {
    assert.equal(run("install", env).status, 0);
    const ownership = JSON.parse(await readFile(paths.ownership, "utf8"));
    const record = ownership.targets.find((target) => target.id === "claude-command-plan");
    const transactionId = "dddddddd-eeee-4fff-8aaa-bbbbbbbbbbbb";
    const backup = join(paths.marketplace, ".cairn", "transactions", transactionId, "backup", "0");
    const entry = { ...journalEntry(record, backup), existed: "yes", expectedNewDigest: record.installedDigest, operation: "replace", status: "prepared" };
    await writeJournal(paths, { schemaVersion: 1, id: transactionId, state: "active", entries: [entry] });
    let result = run("upgrade", env);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /unsafe entry/);

    entry.existed = true;
    await writeJournal(paths, { schemaVersion: 1, id: transactionId, state: "active", entries: [entry, { ...entry }] });
    result = run("upgrade", env);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /duplicate targets/);
    await stat(paths.ownership);
  });
});

test("Codex A/B gate proves the versioned custom cache is required", async (context) => {
  if (spawnSync("codex", ["--version"], { encoding: "utf8" }).error) return context.skip("Codex CLI unavailable");
  await withHome(async ({ env, paths, temp }) => {
    assert.equal(run("install", env).status, 0);
    const hidden = join(temp, "hidden-version");
    await rename(paths.versioned, hidden);
    const withoutVersion = pluginList(env);
    assert.equal(withoutVersion.installed.some((entry) => entry.pluginId === "cairn@cairn"), false);
    await rename(hidden, paths.versioned);
    const withVersion = pluginList(env);
    const installed = withVersion.installed.find((entry) => entry.pluginId === "cairn@cairn");
    assert.equal(installed?.installed, true);
    assert.equal(installed?.enabled, true);
    assert.equal(installed?.version, "0.2.3");
  });
});

test("the next lifecycle run recovers a crash journal from durable backup", async () => {
  await withHome(async ({ env, paths }) => {
    assert.equal(run("install", env).status, 0);
    const ownership = JSON.parse(await readFile(paths.ownership, "utf8"));
    const record = ownership.targets.find((target) => target.id === "claude-command-plan");
    const transactionId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    const backup = join(paths.marketplace, ".cairn", "transactions", transactionId, "backup", "0");
    await mkdir(dirname(backup), { recursive: true });
    await rename(record.path, backup);
    await writeFile(record.path, "partial crashed install\n");
    const journal = {
      schemaVersion: 1,
      id: transactionId,
      state: "active",
      entries: [{
        id: record.id,
        phase: record.phase,
        path: record.path,
        type: record.type,
        backup,
        existed: true,
        previousDigest: record.installedDigest,
        expectedNewDigest: await targetDigest(record.path, record.type),
        operation: "replace",
        status: "applied",
      }],
    };
    const journalPath = join(paths.marketplace, ".cairn", "transaction.json");
    await writeFile(journalPath, `${JSON.stringify(journal, null, 2)}\n`);

    const result = run("upgrade", env);
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(await readFile(record.path, "utf8"), /partial crashed install/);
    await assert.rejects(stat(journalPath));
    await assert.rejects(stat(join(paths.marketplace, ".cairn", "transactions", transactionId)));
  });
});

test("config crash recovery preserves unrelated edits made after the crash", async () => {
  await withHome(async ({ env, paths }) => {
    assert.equal(run("install", env).status, 0);
    const ownership = JSON.parse(await readFile(paths.ownership, "utf8"));
    const record = ownership.targets.find((target) => target.id === "codex-config");
    const transactionId = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
    const backup = join(paths.marketplace, ".cairn", "transactions", transactionId, "backup", "0");
    await mkdir(dirname(backup), { recursive: true });
    await rename(record.path, backup);
    const installedConfig = await readFile(backup, "utf8");
    await writeFile(record.path, `# edit after crash\n[profiles.user]\nmodel = \"custom\"\n${installedConfig}`);
    const journalPath = join(paths.marketplace, ".cairn", "transaction.json");
    await writeFile(journalPath, `${JSON.stringify({
      schemaVersion: 1,
      id: transactionId,
      state: "active",
      entries: [{
        id: record.id,
        phase: record.phase,
        path: record.path,
        type: record.type,
        backup,
        existed: true,
        previousDigest: record.installedDigest,
        expectedNewDigest: await targetDigest(record.path, record.type),
        operation: "replace",
        status: "applied",
      }],
    }, null, 2)}\n`);

    const result = run("upgrade", env);
    assert.equal(result.status, 0, result.stderr);
    const recovered = await readFile(env.CODEX_CONFIG_PATH, "utf8");
    assert.match(recovered, /# edit after crash/);
    assert.match(recovered, /\[profiles\.user\]\nmodel = "custom"/);
  });
});

test("doctor parser requires semantic Codex feature output", () => {
  const features = parseCodexFeatureList("plugins stable true\nhooks stable true\nmulti_agent stable true\n");
  assert.deepEqual({ plugins: features.plugins, hooks: features.hooks, multi_agent: features.multi_agent }, { plugins: true, hooks: true, multi_agent: true });
  assert.equal(parseCodexFeatureList("not a feature table"), null);
});

test("doctor reports an effective Codex feature disabled by user config", async (context) => {
  if (!hostToolsAvailable()) context.skip("Codex and Antigravity CLIs are required for this doctor integration test");
  await withHome(async ({ env }) => {
    assert.equal(run("install", env).status, 0);
    const config = await readFile(env.CODEX_CONFIG_PATH, "utf8");
    await writeFile(env.CODEX_CONFIG_PATH, `[features]\nplugins = false\n${config}`);
    const doctor = run("doctor", env);
    assert.equal(doctor.status, 1);
    assert.match(doctor.stdout, /^FAIL Codex feature plugins$/m);
    assert.doesNotMatch(doctor.stdout, /plugin_hooks/);
  });
});

async function withHome(fn) {
  const temp = await mkdtemp(join(tmpdir(), "cairn-transaction-"));
  const env = {
    ...process.env,
    HOME: join(temp, "home"),
    CODEX_HOME: join(temp, "codex"),
    CLAUDE_HOME: join(temp, "claude"),
    ANTIGRAVITY_HOME: join(temp, "gemini", "config"),
    ANTIGRAVITY_CLI_HOME: join(temp, "gemini", "antigravity-cli"),
    CODEX_CONFIG_PATH: join(temp, "codex", "config.toml"),
  };
  const marketplace = join(env.CODEX_HOME, "plugins", "cache", "cairn");
  const paths = {
    marketplace,
    source: join(marketplace, "plugins", "cairn"),
    versioned: join(marketplace, "cairn", "0.2.3"),
    ownership: join(marketplace, ".cairn", "lifecycle.json"),
  };
  try { await fn({ temp, env, paths }); } finally { await rm(temp, { recursive: true, force: true }); }
}

function run(command, env) {
  return spawnSync(process.execPath, [lifecycleScript, command], { cwd: root, env, encoding: "utf8" });
}

function runAsync(command, env) {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [lifecycleScript, command], { cwd: root, env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => resolvePromise({ status, stdout, stderr }));
  });
}

function hostToolsAvailable() {
  return commandAvailable("codex") && commandAvailable("agy");
}

function commandAvailable(command) {
  const result = spawnSync(command, ["--version"], { encoding: "utf8" });
  return result.error === undefined && result.status === 0;
}

function pluginList(env) {
  const result = spawnSync("codex", ["plugin", "list", "--json"], { cwd: root, env, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function journalEntry(record, backup) {
  return {
    id: record.id,
    phase: record.phase,
    path: record.path,
    type: record.type,
    backup,
    existed: true,
    previousDigest: record.installedDigest,
  };
}

async function writeJournal(paths, journal) {
  await writeFile(join(paths.marketplace, ".cairn", "transaction.json"), `${JSON.stringify(journal, null, 2)}\n`);
}

async function rewriteOwnedVersion(paths, version) {
  const ownership = JSON.parse(await readFile(paths.ownership, "utf8"));
  const oldRuntime = join(paths.marketplace, "cairn", version);
  await rename(paths.versioned, oldRuntime);
  const currentRoot = paths.versioned;
  for (const record of ownership.targets) {
    if (record.id === "codex-runtime") record.path = oldRuntime;
    await replaceTextInManagedTarget(record.path, currentRoot, oldRuntime);
  }
  for (const manifestPath of [
    join(paths.source, ".codex-plugin", "plugin.json"),
    join(paths.source, "package.json"),
    join(oldRuntime, ".codex-plugin", "plugin.json"),
    join(oldRuntime, "package.json"),
  ]) {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.version = version;
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  ownership.version = version;
  for (const record of ownership.targets) record.installedDigest = await targetDigest(record.path, record.type);
  await writeFile(paths.ownership, `${JSON.stringify(ownership, null, 2)}\n`);
  return oldRuntime;
}

async function replaceTextInManagedTarget(path, from, to) {
  const info = await stat(path);
  if (info.isDirectory()) {
    for (const entry of await readdir(path, { withFileTypes: true })) await replaceTextInManagedTarget(join(path, entry.name), from, to);
    return;
  }
  const content = await readFile(path, "utf8");
  if (content.includes(from)) await writeFile(path, content.replaceAll(from, to));
}

async function createLegacy022(destination) {
  const integrity = JSON.parse(await readFile(join(root, "scripts", "release-integrity-0.2.2.json"), "utf8"));
  const publishedCommit = spawnSync("git", ["cat-file", "-e", `${published022Commit}^{commit}`], { cwd: root, encoding: "utf8" });
  assert.equal(
    publishedCommit.status,
    0,
    `Published 0.2.2 commit ${published022Commit} is unavailable; fetch full git history before running legacy lifecycle tests. ${publishedCommit.stderr}`,
  );
  for (const path of Object.keys(integrity.files)) {
    const result = spawnSync("git", ["show", `${published022Commit}:${path}`], { cwd: root });
    assert.equal(result.status, 0, `Could not read ${path} from published 0.2.2 commit ${published022Commit}: ${result.stderr?.toString()}`);
    const target = join(destination, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, result.stdout);
  }
  const manifestPath = join(destination, ".codex-plugin", "plugin.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.hooks = "./hooks/hooks.json";
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const locator = `${JSON.stringify(createRuntimeLocator(destination), null, 2)}\n`;
  await writeFile(join(destination, ".cairn-runtime.json"), locator);
  for (const skill of ["cairn-memory", "cairn-plan", "cairn-work", "cairn-review"]) {
    const target = join(destination, "skills", skill, "references", "cairn-runtime.json");
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, locator);
  }
}

async function createLegacyAntigravity(env, runtimeRoot) {
  const ideRoot = join(env.HOME, ".agents");
  const roots = [ideRoot, env.ANTIGRAVITY_CLI_HOME];
  for (const targetRoot of roots) {
    const runtimeLocator = join(targetRoot, "cairn", "runtime.json");
    await mkdir(dirname(runtimeLocator), { recursive: true });
    await writeFile(runtimeLocator, `${JSON.stringify(createRuntimeLocator(runtimeRoot), null, 2)}\n`);
    for (const skill of ["cairn-memory", "cairn-plan", "cairn-work", "cairn-review"]) {
      const destination = join(targetRoot, "skills", skill);
      const locator = join(destination, "references", "cairn-runtime.json");
      await cp(join(runtimeRoot, "skills", skill), destination, { recursive: true });
      const source = await readFile(join(runtimeRoot, "skills", skill, "SKILL.md"), "utf8");
      const notice = `\n\n## Installed Cairn runtime\n\nRead the structured runtime locator at \`${JSON.stringify(locator)}\`. Resolve Cairn scripts and static resources from its absolute paths, never from the target project.\n`;
      await writeFile(join(destination, "SKILL.md"), `${renderInstalledMirror(source, { runtimeRoot, locatorPath: locator }).trimEnd()}${notice}`);
      await mkdir(dirname(locator), { recursive: true });
      await writeFile(locator, `${JSON.stringify(createRuntimeLocator(runtimeRoot), null, 2)}\n`);
    }
  }
  for (const name of ["install", "upgrade", "doctor", "uninstall", "memory", "plan", "work", "review", "toolcheck"]) {
    const destination = join(ideRoot, "workflows", `cairn-${name}.md`);
    const source = await readFile(join(runtimeRoot, ".agents", "workflows", `cairn-${name}.md`), "utf8");
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, renderInstalledMirror(source, { runtimeRoot, locatorPath: join(ideRoot, "cairn", "runtime.json") }).trimEnd());
  }
}
