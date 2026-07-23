#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { constants as fsConstants, realpathSync } from "node:fs";
import {
  copyFile, cp, lstat, mkdir, mkdtemp, open, readFile, readdir, rename, rm, rmdir, writeFile,
} from "node:fs/promises";
import { homedir, hostname, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, posix, relative, resolve, sep, win32 } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  RUNTIME_LOCATOR_SCHEMA_VERSION,
  createRuntimeLocator,
  resolvePluginRoot,
  runtimeRequiredPaths,
} from "./cairn-paths.mjs";

const pluginRoot = resolvePluginRoot(import.meta.url);
const homeRoot = process.env.HOME ?? process.env.USERPROFILE ?? homedir() ?? ".";
const codexHome = resolve(process.env.CODEX_HOME ?? join(homeRoot, ".codex"));
const claudeHome = resolve(process.env.CLAUDE_HOME ?? join(homeRoot, ".claude"));
// ANTIGRAVITY_HOME denotes the IDE's current ~/.gemini/config root.
const antigravityHome = resolve(process.env.ANTIGRAVITY_HOME ?? join(homeRoot, ".gemini", "config"));
const legacyAntigravityHome = resolve(process.env.CAIRN_LEGACY_ANTIGRAVITY_HOME ?? join(homeRoot, ".agents"));
const antigravityCliHome = resolve(process.env.ANTIGRAVITY_CLI_HOME ?? join(homeRoot, ".gemini", "antigravity-cli"));
const configPath = resolve(process.env.CODEX_CONFIG_PATH ?? join(codexHome, "config.toml"));
const marketplaceName = "cairn";
const pluginName = "cairn";
const marketplaceRoot = join(codexHome, "plugins", "cache", marketplaceName);
const installedPluginRoot = join(marketplaceRoot, "plugins", pluginName);
const marketplaceJsonPath = join(marketplaceRoot, ".agents", "plugins", "marketplace.json");
const ownershipPath = join(marketplaceRoot, ".cairn", "lifecycle.json");
const transactionPath = join(marketplaceRoot, ".cairn", "transaction.json");
const transactionRoot = join(marketplaceRoot, ".cairn", "transactions");
const lifecycleLockPath = join(marketplaceRoot, ".cairn", "lifecycle.lock");
const claudeRuntimeLocatorPath = join(claudeHome, "cairn", "runtime.json");
const sourceManifest = JSON.parse(await readFile(join(pluginRoot, ".codex-plugin", "plugin.json"), "utf8"));
const releaseVersion = sourceManifest.version;
// Codex custom marketplace discovery expects <marketplace>/<plugin>/<version>.
const versionedPluginRoot = join(marketplaceRoot, pluginName, releaseVersion);
const installedRuntimeLocatorPath = join(versionedPluginRoot, ".cairn-runtime.json");
const phases = ["codex", "claude", "antigravity", "config", "cleanup"];
export const DEFAULT_LIFECYCLE_LOCK_TIMEOUT_MS = 60_000;

if (isCliEntry()) {
  try {
    const command = process.argv[2] ?? "help";
    if (command === "install" || command === "upgrade") await withLifecycleLock(() => install(command));
    else if (command === "doctor") await doctor();
    else if (command === "uninstall") await withLifecycleLock(uninstall, { afterRelease: pruneUninstallRoots });
    else help();
  } catch (error) {
    console.error(`Cairn lifecycle error: ${error.message}`);
    process.exitCode = 1;
  }
}

async function install(mode) {
  if (samePath(pluginRoot, installedPluginRoot) || samePath(pluginRoot, versionedPluginRoot)) {
    throw new Error("Run install or upgrade from the Cairn package/global source, not from the installed cache.");
  }
  await recoverInterruptedTransaction();
  const transaction = await createTransaction();
  try {
    const targets = await stageInstall(transaction.stageRoot);
    targets.push(...await legacyMigrationTargets());
    let ownership = await readOwnership();
    if (ownership) {
      validateOwnershipShape(ownership);
      await assertOwnershipDigests(ownership);
      if (ownership.version !== releaseVersion) {
        targets.push({
          id: "previous-codex-runtime",
          phase: "cleanup",
          path: versionedRuntimeRoot(ownership.version),
          type: "tree",
          operation: "remove",
        });
      }
    }
    else if (await anyManagedArtifactExists(targets)) ownership = await adoptLegacy(targets, transaction);
    await assertTargetsReplaceable(targets, ownership);
    for (const phase of phases) {
      for (const target of targets.filter((candidate) => candidate.phase === phase)) {
        if (target.operation === "remove") await removeManagedTarget(target, transaction);
        else await replaceTarget(target, transaction);
      }
      injectFailure(`after-${phase}`);
    }
    const records = [];
    for (const target of targets.filter((candidate) => candidate.operation !== "remove")) records.push(await targetRecord(target));
    const nextOwnership = {
      schemaVersion: 1,
      plugin: pluginName,
      version: releaseVersion,
      transactionId: transaction.id,
      installedAt: new Date().toISOString(),
      targets: records,
    };
    const ownershipStage = join(transaction.stageRoot, "lifecycle.json");
    await mkdir(dirname(ownershipStage), { recursive: true });
    await writeFile(ownershipStage, `${JSON.stringify(nextOwnership, null, 2)}\n`);
    await replaceTarget({ id: "ownership", phase: "manifest", path: ownershipPath, staged: ownershipStage, type: "file" }, transaction);
    await finishTransaction(transaction);
    console.log(t(mode === "upgrade" ? "upgradeComplete" : "installComplete"));
    console.log(`Codex plugin source: ${installedPluginRoot}`);
    console.log(`Codex versioned runtime: ${versionedPluginRoot}`);
    console.log(`Ownership manifest: ${ownershipPath}`);
  } catch (error) {
    if (transaction.state !== "committed") await rollback(transaction);
    throw error;
  }
}

async function uninstall() {
  await recoverInterruptedTransaction();
  const ownership = await readOwnership({ required: true });
  validateOwnershipShape(ownership, { required: true });
  const conflicts = [];
  for (const record of ownership.targets) {
    const current = await targetDigest(record.path, record.type);
    if (record.type !== "config" && current !== record.installedDigest) conflicts.push(record.path);
  }
  if (conflicts.length > 0) throw new Error(`Refusing to uninstall modified managed artifacts: ${conflicts.join(", ")}`);
  const transaction = await createTransaction();
  try {
    const configRecord = ownership.targets.find((record) => record.type === "config");
    if (configRecord && await exists(configRecord.path)) {
      const snapshot = await readSharedConfigSnapshot(configRecord.path);
      const staged = join(transaction.stageRoot, "uninstall-config.toml");
      await mkdir(dirname(staged), { recursive: true });
      await writeFile(staged, removeCairnConfig(snapshot.text));
      await replaceTarget({ ...configRecord, staged, configSourceDigest: snapshot.digest }, transaction);
    }
    injectFailure("uninstall-after-config");
    for (const phase of ["antigravity", "claude"]) {
      for (const record of ownership.targets.filter((candidate) => candidate.phase === phase).reverse()) await removeManagedTarget(record, transaction);
    }
    injectFailure("uninstall-after-external");
    for (const record of ownership.targets.filter((candidate) => candidate.phase === "codex").reverse()) await removeManagedTarget(record, transaction);
    injectFailure("uninstall-after-codex");
    await removeManagedTarget({ id: "ownership", phase: "manifest", path: ownershipPath, type: "file" }, transaction);
    injectFailure("uninstall-after-ownership");
    await finishTransaction(transaction);
    injectFailure("uninstall-after-commit");
  } catch (error) {
    if (transaction.state !== "committed") await rollback(transaction);
    throw error;
  }
  await pruneUninstallScaffolds();
  console.log(t("uninstallComplete"));
}

async function doctor() {
  const checks = [];
  const ownership = await readOwnership();
  checks.push(["source", await exists(join(pluginRoot, ".codex-plugin", "plugin.json"))]);
  checks.push(["ownership manifest", Boolean(ownership)]);
  checks.push(["ownership digests", await ownershipDigestsValid(ownership)]);
  checks.push(["custom marketplace source", await exists(join(installedPluginRoot, ".codex-plugin", "plugin.json"))]);
  checks.push(["versioned runtime", await exists(join(versionedPluginRoot, ".codex-plugin", "plugin.json"))]);
  checks.push(["marketplace", await exists(marketplaceJsonPath)]);
  checks.push(["installed hooks manifest field", (await readJson(join(versionedPluginRoot, ".codex-plugin", "plugin.json")))?.hooks === "./hooks/hooks.json"]);
  checks.push(["hooks file", await exists(join(versionedPluginRoot, "hooks", "hooks.json"))]);
  checks.push(["installed runtime locator", await validRuntimeLocator(installedRuntimeLocatorPath)]);
  checks.push(["installed skill locators", (await Promise.all(skillNames().map((name) => validRuntimeLocator(installedSkillLocatorPath(name))))).every(Boolean)]);
  checks.push(["installed CLI script", await exists(join(versionedPluginRoot, "scripts", "cairn.mjs"))]);
  checks.push(["installed plan template", await exists(join(versionedPluginRoot, "templates", "work-plan.md"))]);
  checks.push(["installed model guidance", await exists(join(versionedPluginRoot, "docs", "model-guidance", "codex.md"))]);
  const config = (await readSharedConfigSnapshot(configPath)).text;
  checks.push(["config marketplace", splitSections(config).some((section) => section.header === "marketplaces.cairn")]);
  checks.push(["config plugin enabled", hasSetting(config, 'plugins."cairn@cairn"', "enabled", "true")]);
  checks.push(["Claude runtime locator", await validRuntimeLocator(claudeRuntimeLocatorPath)]);
  checks.push(["Antigravity IDE skills", await exists(join(antigravityHome, "skills", "cairn-plan", "SKILL.md"))]);
  checks.push(["Antigravity CLI flat skills", await exists(join(antigravityCliHome, "skills", "cairn-plan.md"))]);

  const codexStatus = hostJson(["plugin", "list", "--json"], { CODEX_HOME: codexHome });
  const codexEntry = findPluginStatus(codexStatus, "cairn@cairn");
  checks.push(["Codex plugin installed", Boolean(codexEntry?.installed)]);
  checks.push(["Codex plugin enabled", Boolean(codexEntry?.enabled)]);
  checks.push(["Codex plugin version", codexEntry?.version === releaseVersion]);

  const featureResult = spawnSync("codex", ["features", "list"], { encoding: "utf8", env: { ...process.env, CODEX_HOME: codexHome } });
  const featureStates = featureResult.status === 0 && !featureResult.error ? parseCodexFeatureList(featureResult.stdout) : null;
  checks.push(["Codex feature plugins", featureStates?.plugins === true]);
  checks.push(["Codex feature hooks", featureStates?.hooks === true]);
  checks.push(["Codex feature multi_agent", featureStates?.multi_agent === true]);

  const agy = spawnSync("agy", ["--version"], { encoding: "utf8", env: process.env });
  checks.push(["Antigravity CLI readiness", !agy.error && agy.status === 0 && /^\d+\.\d+\.\d+/.test(agy.stdout.trim())]);
  checks.push(["Antigravity CLI skill validation", await validateAntigravitySkills()]);
  for (const [name, ok] of checks) console.log(`${ok ? "OK" : "FAIL"} ${name}`);
  if (checks.some(([, ok]) => !ok)) process.exitCode = 1;
}

async function ownershipDigestsValid(ownership) {
  try {
    validateOwnershipShape(ownership, { required: true });
    for (const record of ownership.targets) if (await targetDigest(record.path, record.type) !== record.installedDigest) return false;
    return true;
  } catch {
    return false;
  }
}

async function stageInstall(stageRoot) {
  const targets = [];
  const add = (id, phase, destination, staged, type = "tree", details = {}) => targets.push({ id, phase, path: destination, staged, type, ...details });
  const sourceStage = join(stageRoot, "codex-source");
  const runtimeStage = join(stageRoot, "codex-runtime");
  await copyPluginCandidate(sourceStage, versionedPluginRoot);
  await copyPluginCandidate(runtimeStage, versionedPluginRoot);
  add("codex-source", "codex", installedPluginRoot, sourceStage);
  add("codex-runtime", "codex", versionedPluginRoot, runtimeStage);

  const marketplaceStage = join(stageRoot, "marketplace.json");
  await writeFile(marketplaceStage, `${JSON.stringify({
    name: marketplaceName,
    interface: { displayName: "Cairn" },
    plugins: [{ name: pluginName, source: { source: "local", path: "./plugins/cairn" }, policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" }, category: "Productivity" }],
  }, null, 2)}\n`);
  add("marketplace", "codex", marketplaceJsonPath, marketplaceStage, "file");

  const claudeLocator = join(stageRoot, "claude-runtime.json");
  await writeLocator(claudeLocator, versionedPluginRoot);
  add("claude-runtime", "claude", claudeRuntimeLocatorPath, claudeLocator, "file");
  for (const name of commandNames()) {
    const staged = join(stageRoot, "claude-commands", `cairn-${name}.md`);
    await renderMirrorFile(join(runtimeStage, ".claude", "commands", `cairn-${name}.md`), staged, claudeRuntimeLocatorPath);
    add(`claude-command-${name}`, "claude", join(claudeHome, "commands", `cairn-${name}.md`), staged, "file");
  }
  for (const name of ["explorer", "worker"]) {
    const staged = join(stageRoot, "claude-agents", `cairn-${name}.md`);
    await renderMirrorFile(join(runtimeStage, ".claude", "agents", `${name}.md`), staged, claudeRuntimeLocatorPath);
    add(`claude-agent-${name}`, "claude", join(claudeHome, "agents", `cairn-${name}.md`), staged, "file");
  }

  await stageAntigravity(targets, stageRoot, runtimeStage, antigravityHome, "ide", false);
  await stageAntigravity(targets, stageRoot, runtimeStage, antigravityCliHome, "cli", true);

  const configStage = join(stageRoot, "config.toml");
  const hookStates = await trustedHookStates(runtimeStage);
  const configSnapshot = await readSharedConfigSnapshot(configPath);
  await writeFile(configStage, updateConfig(configSnapshot.text, hookStates));
  add("codex-config", "config", configPath, configStage, "config", { configSourceDigest: configSnapshot.digest });
  for (const target of targets) await assertRegularTree(target.staged);
  return targets;
}

async function stageAntigravity(targets, stageRoot, runtimeStage, destinationRoot, label, flatSkills) {
  const locatorPath = antigravityRuntimeLocatorPath(destinationRoot);
  const locatorStage = join(stageRoot, `${label}-runtime.json`);
  await writeLocator(locatorStage, versionedPluginRoot);
  targets.push({ id: `${label}-runtime`, phase: "antigravity", path: locatorPath, staged: locatorStage, type: "file" });
  for (const name of skillNames()) {
    if (flatSkills) {
      const staged = join(stageRoot, `${label}-skills`, `${name}.md`);
      await renderMirrorFile(join(runtimeStage, "skills", name, "SKILL.md"), staged, locatorPath, { includeLocatorNotice: true });
      targets.push({ id: `${label}-skill-${name}`, phase: "antigravity", path: join(destinationRoot, "skills", `${name}.md`), staged, type: "file" });
    } else {
      const staged = join(stageRoot, `${label}-skills`, name);
      await cp(join(runtimeStage, "skills", name), staged, { recursive: true });
      await renderMirrorFile(join(runtimeStage, "skills", name, "SKILL.md"), join(staged, "SKILL.md"), antigravitySkillLocatorPath(destinationRoot, name), { includeLocatorNotice: true });
      await writeLocator(join(staged, "references", "cairn-runtime.json"), versionedPluginRoot);
      targets.push({ id: `${label}-skill-${name}`, phase: "antigravity", path: join(destinationRoot, "skills", name), staged, type: "tree" });
    }
  }
  for (const name of commandNames()) {
    const staged = join(stageRoot, `${label}-workflows`, `cairn-${name}.md`);
    await renderMirrorFile(join(runtimeStage, ".agents", "workflows", `cairn-${name}.md`), staged, locatorPath);
    targets.push({ id: `${label}-workflow-${name}`, phase: "antigravity", path: join(destinationRoot, "workflows", `cairn-${name}.md`), staged, type: "file" });
  }
}

async function legacyMigrationTargets() {
  const candidates = [{ id: "legacy-ide-runtime", phase: "antigravity", path: antigravityRuntimeLocatorPath(legacyAntigravityHome), type: "file", operation: "remove" }];
  for (const name of skillNames()) {
    candidates.push({ id: `legacy-ide-skill-${name}`, phase: "antigravity", path: join(legacyAntigravityHome, "skills", name), type: "tree", operation: "remove" });
    candidates.push({ id: `legacy-cli-skill-${name}`, phase: "antigravity", path: join(antigravityCliHome, "skills", name), type: "tree", operation: "remove" });
  }
  for (const name of commandNames()) candidates.push({ id: `legacy-ide-workflow-${name}`, phase: "antigravity", path: join(legacyAntigravityHome, "workflows", `cairn-${name}.md`), type: "file", operation: "remove" });
  const present = [];
  for (const candidate of candidates) if (await exists(candidate.path)) present.push(candidate);
  return present;
}

async function copyPluginCandidate(destination, runtimeRoot) {
  await copyPluginTree(pluginRoot, destination);
  const manifestPath = join(destination, ".codex-plugin", "plugin.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.hooks = "./hooks/hooks.json";
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await writeLocator(join(destination, ".cairn-runtime.json"), runtimeRoot);
  for (const name of skillNames()) await writeLocator(join(destination, "skills", name, "references", "cairn-runtime.json"), runtimeRoot);
}

async function copyPluginTree(source, destination) {
  if (!shouldCopyPluginPath(source)) return;
  const info = await lstat(source);
  if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile())) {
    throw new Error(`Plugin source must contain only regular files and directories: ${source}`);
  }
  if (info.isFile()) {
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(source, destination);
    return;
  }
  await mkdir(destination, { recursive: true });
  const entries = await readdir(source);
  entries.sort();
  for (const entry of entries) await copyPluginTree(join(source, entry), join(destination, entry));
}

async function createTransaction() {
  const root = await mkdtemp(join(tmpdir(), "cairn-lifecycle-"));
  const transaction = {
    schemaVersion: 1,
    id: randomUUID(),
    state: "active",
    root,
    stageRoot: join(root, "stage"),
    backupRoot: "",
    entries: [],
  };
  transaction.backupRoot = join(transactionRoot, transaction.id, "backup");
  await mkdir(transaction.backupRoot, { recursive: true });
  await writeTransactionJournal(transaction);
  return transaction;
}

async function withLifecycleLock(operation, {
  timeoutMs = Number(process.env.CAIRN_LIFECYCLE_LOCK_TIMEOUT_MS ?? DEFAULT_LIFECYCLE_LOCK_TIMEOUT_MS),
  retryMs = 25,
  malformedStaleMs = 30_000,
  afterRelease,
} = {}) {
  await mkdir(dirname(lifecycleLockPath), { recursive: true });
  if (process.env.CAIRN_TEST_PRUNE_LOCK_PARENT_BEFORE_ACQUIRE === "1") await rmdir(dirname(lifecycleLockPath));
  const owner = { schemaVersion: 1, pid: process.pid, hostname: hostname(), nonce: randomUUID(), acquiredAt: new Date().toISOString() };
  const deadline = Date.now() + timeoutMs;
  while (true) {
    try {
      await writeFile(lifecycleLockPath, `${JSON.stringify(owner)}\n`, { flag: "wx" });
      if (process.env.CAIRN_TEST_REPLACE_LOCK_AFTER_ACQUIRE === "1") {
        await writeFile(lifecycleLockPath, `${JSON.stringify({ ...owner, nonce: randomUUID() })}\n`);
      }
      const acquired = parseLifecycleLock(await readFile(lifecycleLockPath, "utf8"));
      if (acquired?.nonce !== owner.nonce) throw new Error("Cairn lifecycle lock ownership changed after acquisition");
      break;
    } catch (error) {
      if (error?.code === "ENOENT") {
        if (Date.now() >= deadline) throw new Error(`Timed out waiting for Cairn lifecycle lock after ${timeoutMs}ms`);
        await mkdir(dirname(lifecycleLockPath), { recursive: true });
        continue;
      }
      if (error?.code !== "EEXIST") throw error;
      if (await reclaimLifecycleLock(malformedStaleMs)) continue;
      if (Date.now() >= deadline) throw new Error(`Timed out waiting for Cairn lifecycle lock after ${timeoutMs}ms`);
      await delay(Math.min(retryMs, Math.max(1, deadline - Date.now())));
    }
  }
  let operationSucceeded = false;
  try {
    const result = await operation();
    operationSucceeded = true;
    return result;
  } finally {
    if (process.env.CAIRN_TEST_REPLACE_LOCK_BEFORE_RELEASE === "1") {
      await writeFile(lifecycleLockPath, `${JSON.stringify({ ...owner, nonce: randomUUID() })}\n`);
    }
    const released = await releaseLifecycleLock(owner);
    if (operationSucceeded && released && afterRelease) await afterRelease();
  }
}

async function releaseLifecycleLock(owner) {
  let current;
  try {
    current = parseLifecycleLock(await readFile(lifecycleLockPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
  if (current?.nonce !== owner.nonce) return false;
  const releasedPath = `${lifecycleLockPath}.released.${owner.nonce}`;
  try {
    await rename(lifecycleLockPath, releasedPath);
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
  const released = parseLifecycleLock(await readFile(releasedPath, "utf8"));
  if (released?.nonce !== owner.nonce) {
    if (!(await exists(lifecycleLockPath))) await rename(releasedPath, lifecycleLockPath);
    return false;
  }
  await rm(releasedPath, { force: true });
  return true;
}

async function pruneUninstallScaffolds() {
  for (const path of [
    join(marketplaceRoot, "plugins"),
    join(marketplaceRoot, pluginName),
    join(marketplaceRoot, ".agents", "plugins"),
    join(marketplaceRoot, ".agents"),
    transactionRoot,
  ]) await removeEmptyDirectory(path);
}

async function pruneUninstallRoots() {
  await removeEmptyDirectory(dirname(lifecycleLockPath));
  await removeEmptyDirectory(marketplaceRoot);
}

async function removeEmptyDirectory(path) {
  try {
    await rmdir(path);
  } catch (error) {
    if (!["ENOENT", "ENOTEMPTY", "EEXIST"].includes(error?.code)) throw error;
  }
}

async function reclaimLifecycleLock(malformedStaleMs) {
  let observed;
  let info;
  try {
    [observed, info] = await Promise.all([readFile(lifecycleLockPath, "utf8"), lstat(lifecycleLockPath)]);
  } catch (error) {
    if (error?.code === "ENOENT") return true;
    throw error;
  }
  if (info.isSymbolicLink()) throw new Error(`Lifecycle lock must not be a symlink: ${lifecycleLockPath}`);
  const record = parseLifecycleLock(observed);
  if (record) {
    if (record.hostname !== hostname() || pidIsAlive(record.pid)) return false;
  } else if (Date.now() - info.mtimeMs <= malformedStaleMs) return false;
  const quarantine = `${lifecycleLockPath}.stale.${record?.nonce ?? "malformed"}.${randomUUID()}`;
  try {
    await rename(lifecycleLockPath, quarantine);
  } catch (error) {
    if (error?.code === "ENOENT") return true;
    throw error;
  }
  if (await readFile(quarantine, "utf8") !== observed) {
    if (!(await exists(lifecycleLockPath))) await rename(quarantine, lifecycleLockPath);
    throw new Error("Cairn lifecycle lock ownership changed during stale recovery");
  }
  await rm(quarantine, { force: true });
  return true;
}

function parseLifecycleLock(text) {
  try {
    const value = JSON.parse(text);
    if (value?.schemaVersion !== 1 || !Number.isSafeInteger(value.pid) || value.pid <= 0
        || typeof value.hostname !== "string" || value.hostname.length === 0 || typeof value.nonce !== "string" || value.nonce.length === 0
        || typeof value.acquiredAt !== "string" || Number.isNaN(Date.parse(value.acquiredAt))) return null;
    return value;
  } catch { return null; }
}

function pidIsAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { return error?.code !== "ESRCH"; }
}

function delay(ms) { return new Promise((resolvePromise) => setTimeout(resolvePromise, ms)); }

async function replaceTarget(target, transaction) {
  let configProjection = null;
  if (target.type === "config") {
    const snapshot = await readSharedConfigSnapshot(target.path);
    configProjection = cairnConfigProjection((await readSharedConfigSnapshot(target.staged)).text);
    if (snapshot.digest !== target.configSourceDigest) {
      await writeFile(target.staged, `${removeCairnConfig(snapshot.text)}${configProjection}`);
      target.configSourceDigest = snapshot.digest;
    }
  }
  const existed = await exists(target.path);
  const backup = join(transaction.backupRoot, String(transaction.entries.length));
  await mkdir(dirname(backup), { recursive: true });
  const entry = {
    id: target.id,
    phase: target.phase,
    path: target.path,
    type: target.type,
    backup,
    existed,
    previousDigest: existed ? await targetDigest(target.path, target.type) : "missing",
    expectedNewDigest: await targetDigest(target.staged, target.type),
    operation: "replace",
    status: "prepared",
  };
  transaction.entries.push(entry);
  await writeTransactionJournal(transaction);
  if (target.type === "config" && process.env.CAIRN_TEST_APPEND_CONFIG_BEFORE_REPLACE) {
    const snapshot = await readSharedConfigSnapshot(target.path);
    await writeFile(target.path, `${snapshot.text}${process.env.CAIRN_TEST_APPEND_CONFIG_BEFORE_REPLACE}`);
  }
  if (target.type === "config" && process.env.CAIRN_TEST_REMOVE_CONFIG_BEFORE_REPLACE === "1") {
    await rm(target.path, { force: true });
  }
  if (target.type === "config") {
    let capturedExists = true;
    try {
      await rename(target.path, backup);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      capturedExists = false;
    }
    if (process.env.CAIRN_TEST_CRASH_AFTER_CONFIG_CAPTURE === "1") process.exit(86);
    const captured = await readSharedConfigSnapshot(backup);
    if (capturedExists) await writeFile(target.staged, `${removeCairnConfig(captured.text)}${configProjection}`);
    else await writeFile(target.staged, configProjection);
    entry.existed = capturedExists;
    entry.previousDigest = capturedExists ? await targetDigest(backup, target.type) : "missing";
    entry.expectedNewDigest = await targetDigest(target.staged, target.type);
    await writeTransactionJournal(transaction);
  } else if (existed) await rename(target.path, backup);
  await mkdir(dirname(target.path), { recursive: true });
  await rename(target.staged, target.path);
  entry.status = "applied";
  await writeTransactionJournal(transaction);
}

async function removeManagedTarget(target, transaction) {
  if (!(await exists(target.path))) throw new Error(`Managed uninstall target is missing: ${target.path}`);
  const backup = join(transaction.backupRoot, String(transaction.entries.length));
  await mkdir(dirname(backup), { recursive: true });
  const entry = {
    id: target.id,
    phase: target.phase,
    path: target.path,
    type: target.type,
    backup,
    existed: true,
    previousDigest: await targetDigest(target.path, target.type),
    expectedNewDigest: "missing",
    operation: "remove",
    status: "prepared",
  };
  transaction.entries.push(entry);
  await writeTransactionJournal(transaction);
  await rename(target.path, backup);
  entry.status = "applied";
  await writeTransactionJournal(transaction);
}

async function rollback(transaction) {
  await rollbackEntries(transaction);
  await rm(transaction.root, { recursive: true, force: true });
  await rm(join(transactionRoot, transaction.id), { recursive: true, force: true });
  await rm(transactionPath, { force: true });
}

async function finishTransaction(transaction) {
  transaction.state = "committed";
  try {
    await writeTransactionJournal(transaction);
  } catch (error) {
    transaction.state = "active";
    throw error;
  }
  await rm(transaction.root, { recursive: true, force: true });
  await rm(join(transactionRoot, transaction.id), { recursive: true, force: true });
  await rm(transactionPath, { force: true });
}

async function writeTransactionJournal(transaction) {
  const durable = {
    schemaVersion: transaction.schemaVersion,
    id: transaction.id,
    state: transaction.state,
    entries: transaction.entries,
  };
  await durableReplaceFile(transactionPath, `${JSON.stringify(durable, null, 2)}\n`, transaction.id);
}

async function durableReplaceFile(path, content, nonce = randomUUID()) {
  await mkdir(dirname(path), { recursive: true });
  const candidate = `${path}.${nonce}.tmp`;
  const file = await open(candidate, "w", 0o600);
  try {
    await file.writeFile(content, "utf8");
    await file.sync();
  } finally {
    await file.close();
  }
  await rename(candidate, path);
  // Directory fsync is unavailable on some Windows/filesystem combinations. The
  // file fsync+atomic rename remains the portable floor; directory sync is best effort.
  try {
    const directory = await open(dirname(path), "r");
    try { await directory.sync(); } finally { await directory.close(); }
  } catch (error) {
    if (!(["EINVAL", "ENOTSUP", "EISDIR", "EPERM", "EACCES"].includes(error?.code))) throw error;
  }
}

async function recoverInterruptedTransaction() {
  if (!(await exists(transactionPath))) return;
  let journal;
  try {
    journal = JSON.parse(await readFile(transactionPath, "utf8"));
  } catch {
    throw new Error(`Lifecycle transaction journal is invalid: ${transactionPath}`);
  }
  validateTransactionJournal(journal, { strict: true });
  if (journal.state === "committed") {
    await rm(join(transactionRoot, journal.id), { recursive: true, force: true });
    await rm(transactionPath, { force: true });
    return;
  }
  await rollbackEntries(journal);
  await rm(join(transactionRoot, journal.id), { recursive: true, force: true });
  await rm(transactionPath, { force: true });
}

function validateTransactionJournal(journal, { strict = false } = {}) {
  if (journal?.schemaVersion !== 1 || typeof journal.id !== "string" || !/^[a-f0-9-]{20,}$/i.test(journal.id)
      || !["active", "committed"].includes(journal.state) || !Array.isArray(journal.entries)) {
    throw new Error("Lifecycle transaction journal has an invalid schema.");
  }
  if (strict && !sameKeys(journal, ["schemaVersion", "id", "state", "entries"])) throw new Error("Lifecycle transaction journal has unknown fields.");
  const allowedBackupRoot = resolve(transactionRoot, journal.id, "backup");
  const ids = new Set();
  const paths = new Set();
  for (const entry of journal.entries) {
    const expected = entry.id === "ownership"
      ? { phase: "manifest", path: ownershipPath, type: "file" }
      : entry.id === "previous-codex-runtime"
        ? previousRuntimeTarget(entry.path)
      : expectedManagedTarget(entry.id);
    if (!expected || expected.path !== entry.path || expected.phase !== entry.phase || expected.type !== entry.type
        || !["prepared", "applied"].includes(entry.status)
        || !["replace", "remove"].includes(entry.operation)
        || typeof entry.existed !== "boolean"
        || !isInside(allowedBackupRoot, entry.backup)
        || typeof entry.expectedNewDigest !== "string" || typeof entry.previousDigest !== "string") {
      throw new Error(`Lifecycle transaction journal contains an unsafe entry: ${entry?.id ?? "unknown"}`);
    }
    if (strict && !sameKeys(entry, ["id", "phase", "path", "type", "backup", "existed", "previousDigest", "expectedNewDigest", "operation", "status"])) {
      throw new Error(`Lifecycle transaction journal entry has unknown fields: ${entry.id}`);
    }
    if (ids.has(entry.id) || paths.has(entry.path)) throw new Error(`Lifecycle transaction journal contains duplicate targets: ${entry.id}`);
    if (entry.operation === "remove" && entry.expectedNewDigest !== "missing") throw new Error(`Lifecycle remove entry has an invalid new digest: ${entry.id}`);
    ids.add(entry.id);
    paths.add(entry.path);
  }
}

function previousRuntimeTarget(path) {
  const parent = join(marketplaceRoot, pluginName);
  const relation = relative(parent, resolve(path));
  if (!relation || relation.includes(sep) || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(relation) || relation === releaseVersion) return null;
  return { phase: "cleanup", path: join(parent, relation), type: "tree" };
}

function sameKeys(value, expected) {
  return Object.keys(value).sort().join("\0") === [...expected].sort().join("\0");
}

async function rollbackEntries(transaction) {
  validateTransactionJournal(transaction);
  for (const entry of [...transaction.entries].reverse()) {
    const destinationExists = await exists(entry.path);
    const backupExists = await exists(entry.backup);
    if (backupExists) {
      if (entry.type === "config" && entry.status === "prepared") {
        const previousConfig = (await readSharedConfigSnapshot(entry.backup)).text;
        if (destinationExists) {
          const currentConfig = (await readSharedConfigSnapshot(entry.path)).text;
          await writeFile(entry.path, `${removeCairnConfig(currentConfig)}${cairnConfigProjection(previousConfig)}`);
          await rm(entry.backup, { force: true });
        } else {
          await mkdir(dirname(entry.path), { recursive: true });
          await rename(entry.backup, entry.path);
        }
        continue;
      }
      if (!entry.existed) throw new Error(`Cannot recover transaction because an unexpected backup exists: ${entry.path}`);
      if (await targetDigest(entry.backup, entry.type) !== entry.previousDigest) {
        throw new Error(`Cannot recover transaction because its durable backup changed: ${entry.path}`);
      }
      if (destinationExists) {
        const current = await targetDigest(entry.path, entry.type);
        if (current !== entry.expectedNewDigest) throw new Error(`Cannot recover transaction because destination changed: ${entry.path}`);
        if (entry.type === "config") {
          const currentConfig = (await readSharedConfigSnapshot(entry.path)).text;
          const previousConfig = (await readSharedConfigSnapshot(entry.backup)).text;
          await writeFile(entry.path, `${removeCairnConfig(currentConfig)}${cairnConfigProjection(previousConfig)}`);
          await rm(entry.backup, { force: true });
          continue;
        }
        await rm(entry.path, { recursive: true, force: true });
      }
      await mkdir(dirname(entry.path), { recursive: true });
      await rename(entry.backup, entry.path);
    } else if (entry.type === "config" && entry.status === "prepared" && !destinationExists) {
      continue;
    } else if (!entry.existed) {
      if (destinationExists) {
        const current = await targetDigest(entry.path, entry.type);
        if (current !== entry.expectedNewDigest) throw new Error(`Cannot recover new transaction target because it changed: ${entry.path}`);
        if (entry.type === "config") {
          const preserved = removeCairnConfig((await readSharedConfigSnapshot(entry.path)).text);
          if (preserved.length > 0) await writeFile(entry.path, preserved);
          else await rm(entry.path, { force: true });
        } else await rm(entry.path, { recursive: true, force: true });
      }
    } else {
      if (!destinationExists || await targetDigest(entry.path, entry.type) !== entry.previousDigest) {
        throw new Error(`Cannot recover transaction because its durable backup is missing: ${entry.path}`);
      }
    }
  }
}

function isInside(root, candidate) {
  const path = resolve(candidate);
  return path === root || path.startsWith(`${root}${sep}`);
}

function injectFailure(point) {
  if (process.env.CAIRN_TEST_FAIL_PHASE === point) throw new Error(`Injected lifecycle failure: ${point}`);
}

async function assertTargetsReplaceable(targets, ownership) {
  const records = new Map((ownership?.targets ?? []).map((record) => [record.id, record]));
  for (const target of targets) {
    if (!(await exists(target.path))) continue;
    if (target.id === "previous-codex-runtime") {
      const previous = records.get("codex-runtime");
      if (!previous || previous.path !== target.path || previous.type !== target.type) throw new Error("Previous runtime does not match ownership manifest.");
      continue;
    }
    const record = records.get(target.id);
    if (!record) {
      if (target.type === "config" && cairnConfigProjection((await readSharedConfigSnapshot(target.path)).text).length === 0) continue;
      throw new Error(`Refusing to overwrite unmanaged artifact: ${target.path}`);
    }
    if (target.id === "codex-runtime" && ownership?.version !== releaseVersion) {
      throw new Error(`Refusing to overwrite unmanaged current-version runtime: ${target.path}`);
    }
    if (record.path !== target.path || record.type !== target.type) throw new Error(`Ownership manifest target mismatch: ${target.id}`);
    const current = await targetDigest(target.path, target.type);
    if (target.type !== "config" && current !== record.installedDigest) throw new Error(`Managed artifact was modified: ${target.path}`);
  }
}

async function assertOwnershipDigests(ownership) {
  for (const record of ownership.targets) {
    const current = await targetDigest(record.path, record.type);
    if (record.type !== "config" && current !== record.installedDigest) {
      throw new Error(`Managed artifact was modified: ${record.path}`);
    }
  }
}

async function targetRecord(target) {
  return { id: target.id, phase: target.phase, path: target.path, type: target.type, installedDigest: await targetDigest(target.path, target.type), previous: null };
}

async function readOwnership({ required = false } = {}) {
  if (!(await exists(ownershipPath))) {
    if (required) throw new Error(`Ownership manifest is missing: ${ownershipPath}`);
    return null;
  }
  try {
    return JSON.parse(await readFile(ownershipPath, "utf8"));
  } catch {
    throw new Error(`Ownership manifest is invalid: ${ownershipPath}`);
  }
}

function validateOwnershipShape(ownership, { required = false } = {}) {
  if (!ownership) {
    if (required) throw new Error("Ownership manifest is required.");
    return;
  }
  if (!sameKeys(ownership, ["schemaVersion", "plugin", "version", "transactionId", "installedAt", "targets"])
      || ownership.schemaVersion !== 1 || ownership.plugin !== pluginName
      || typeof ownership.version !== "string" || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(ownership.version)
      || typeof ownership.transactionId !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(ownership.transactionId)
      || typeof ownership.installedAt !== "string" || Number.isNaN(Date.parse(ownership.installedAt))
      || !Array.isArray(ownership.targets)) {
    throw new Error("Ownership manifest schema or plugin identity is invalid.");
  }
  const ids = new Set();
  const paths = new Set();
  for (const record of ownership.targets) {
    if (!record || !sameKeys(record, ["id", "phase", "path", "type", "installedDigest", "previous"])
        || typeof record.id !== "string" || record.id.length === 0 || ids.has(record.id)
        || typeof record.path !== "string" || record.path.length === 0 || paths.has(record.path)
        || typeof record.phase !== "string" || !phases.includes(record.phase)
        || typeof record.type !== "string" || !["file", "tree", "config"].includes(record.type)
        || typeof record.installedDigest !== "string" || !/^sha256:[a-f0-9]{64}$/.test(record.installedDigest)
        || record.previous !== null) {
      throw new Error("Ownership manifest contains an invalid or duplicate target.");
    }
    const expected = expectedManagedTarget(record.id, ownership.version);
    if (!expected || expected.path !== record.path || expected.phase !== record.phase || expected.type !== record.type) {
      throw new Error(`Ownership manifest target is outside the Cairn allowlist: ${record.id}`);
    }
    ids.add(record.id);
    paths.add(record.path);
  }
  const requiredTargets = requiredOwnershipTargets(ownership.version);
  if (ids.size !== requiredTargets.size || [...requiredTargets.keys()].some((id) => !ids.has(id))) {
    throw new Error("Ownership manifest does not contain the complete managed target set.");
  }
}

function requiredOwnershipTargets(version = releaseVersion) {
  const ids = ["codex-source", "codex-runtime", "marketplace", "claude-runtime", "ide-runtime", "cli-runtime", "codex-config"];
  for (const name of commandNames()) ids.push(`claude-command-${name}`, `ide-workflow-${name}`, `cli-workflow-${name}`);
  for (const name of ["explorer", "worker"]) ids.push(`claude-agent-${name}`);
  for (const name of skillNames()) ids.push(`ide-skill-${name}`, `cli-skill-${name}`);
  return new Map(ids.map((id) => [id, expectedManagedTarget(id, version)]));
}

function expectedManagedTarget(id, version = releaseVersion) {
  const exact = {
    "codex-source": { phase: "codex", path: installedPluginRoot, type: "tree" },
    "codex-runtime": { phase: "codex", path: versionedRuntimeRoot(version), type: "tree" },
    marketplace: { phase: "codex", path: marketplaceJsonPath, type: "file" },
    "claude-runtime": { phase: "claude", path: claudeRuntimeLocatorPath, type: "file" },
    "ide-runtime": { phase: "antigravity", path: antigravityRuntimeLocatorPath(antigravityHome), type: "file" },
    "cli-runtime": { phase: "antigravity", path: antigravityRuntimeLocatorPath(antigravityCliHome), type: "file" },
    "legacy-ide-runtime": { phase: "antigravity", path: antigravityRuntimeLocatorPath(legacyAntigravityHome), type: "file" },
    "codex-config": { phase: "config", path: configPath, type: "config" },
  };
  if (exact[id]) return exact[id];
  for (const name of commandNames()) {
    if (id === `claude-command-${name}`) return { phase: "claude", path: join(claudeHome, "commands", `cairn-${name}.md`), type: "file" };
    if (id === `ide-workflow-${name}`) return { phase: "antigravity", path: join(antigravityHome, "workflows", `cairn-${name}.md`), type: "file" };
    if (id === `cli-workflow-${name}`) return { phase: "antigravity", path: join(antigravityCliHome, "workflows", `cairn-${name}.md`), type: "file" };
    if (id === `legacy-ide-workflow-${name}`) return { phase: "antigravity", path: join(legacyAntigravityHome, "workflows", `cairn-${name}.md`), type: "file" };
  }
  for (const name of ["explorer", "worker"]) if (id === `claude-agent-${name}`) return { phase: "claude", path: join(claudeHome, "agents", `cairn-${name}.md`), type: "file" };
  for (const name of skillNames()) {
    if (id === `ide-skill-${name}`) return { phase: "antigravity", path: join(antigravityHome, "skills", name), type: "tree" };
    if (id === `cli-skill-${name}`) return { phase: "antigravity", path: join(antigravityCliHome, "skills", `${name}.md`), type: "file" };
    if (id === `legacy-ide-skill-${name}`) return { phase: "antigravity", path: join(legacyAntigravityHome, "skills", name), type: "tree" };
    if (id === `legacy-cli-skill-${name}`) return { phase: "antigravity", path: join(antigravityCliHome, "skills", name), type: "tree" };
  }
  return null;
}

function versionedRuntimeRoot(version) {
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error(`Invalid Cairn runtime version: ${version}`);
  return join(marketplaceRoot, pluginName, version);
}

async function anyManagedArtifactExists(targets) {
  for (const target of targets) {
    if (!(await exists(target.path))) continue;
    if (target.type !== "config" || cairnConfigProjection((await readSharedConfigSnapshot(target.path)).text).length > 0) return true;
  }
  return false;
}

async function adoptLegacy(targets, transaction) {
  if (!(await exists(installedPluginRoot))) throw new Error("Existing lifecycle artifacts are unmanaged; legacy Cairn root is missing.");
  await verifyLegacy022Root(installedPluginRoot);
  const records = [];
  for (const target of targets) {
    if (!(await exists(target.path))) continue;
    if (target.id === "codex-runtime") continue;
    if (target.id === "marketplace") {
      const marketplace = await readJson(target.path);
      const entry = marketplace?.plugins?.find((plugin) => plugin.name === pluginName);
      if (marketplace?.name !== marketplaceName || entry?.source?.source !== "local" || entry?.source?.path !== "./plugins/cairn") {
        throw new Error(`Legacy Cairn marketplace cannot be identified: ${target.path}`);
      }
    }
    if (target.type === "config") {
      const projection = cairnConfigProjection((await readSharedConfigSnapshot(target.path)).text);
      if (!projection.includes("[marketplaces.cairn]") || !projection.includes('[plugins."cairn@cairn"]')) {
        throw new Error(`Legacy Cairn config cannot be identified: ${target.path}`);
      }
    } else if (target.id.endsWith("-runtime")) {
      const locator = await readJson(target.path);
      if (!validLegacyLocator(locator, installedPluginRoot)) throw new Error(`Legacy runtime mirror is invalid: ${target.path}`);
    } else if (target.id !== "codex-source" && target.id !== "marketplace") {
      await verifyLegacyMirror(target);
    }
    const backup = join(transaction.backupRoot, `legacy-${records.length}`);
    await mkdir(dirname(backup), { recursive: true });
    await cp(target.path, backup, { recursive: true });
    records.push({ id: target.id, phase: target.phase, path: target.path, type: target.type, installedDigest: await targetDigest(target.path, target.type), previous: null });
  }
  return { schemaVersion: 1, plugin: pluginName, version: "0.2.2", transactionId: `legacy-${transaction.id}`, targets: records };
}

export async function verifyLegacy022Root(root) {
  const integrity = JSON.parse(await readFile(join(pluginRoot, "scripts", "release-integrity-0.2.2.json"), "utf8"));
  const allowedGenerated = new Set([".cairn-runtime.json", ...skillNames().map((name) => `skills/${name}/references/cairn-runtime.json`)]);
  const actual = await regularFiles(root);
  const expected = new Set([...Object.keys(integrity.files), ...allowedGenerated]);
  if (actual.length !== expected.size || actual.some((file) => !expected.has(file))) throw new Error("Legacy Cairn 0.2.2 root file set does not match the signed release allowlist.");
  for (const [path, expectedHash] of Object.entries(integrity.files)) {
    const content = await readFile(join(root, path));
    if (path === ".codex-plugin/plugin.json") {
      const manifest = JSON.parse(content);
      if (manifest.name !== "cairn" || manifest.version !== "0.2.2" || manifest.hooks !== "./hooks/hooks.json") throw new Error("Legacy Cairn manifest identity is invalid.");
      delete manifest.hooks;
      if (sha(`${JSON.stringify(manifest, null, 2)}\n`) !== `sha256:${expectedHash}`) throw new Error("Legacy Cairn manifest differs from release 0.2.2.");
    } else if (sha(content) !== `sha256:${expectedHash}`) throw new Error(`Legacy Cairn release file was modified: ${path}`);
  }
  for (const path of allowedGenerated) {
    const locator = JSON.parse(await readFile(join(root, path), "utf8"));
    if (!validLegacyLocator(locator, root)) throw new Error(`Legacy runtime locator is invalid: ${path}`);
  }
}

function validLegacyLocator(locator, root) {
  const expected = createRuntimeLocator(root);
  return locator?.schemaVersion === RUNTIME_LOCATOR_SCHEMA_VERSION
    && locator.pluginRoot === expected.pluginRoot
    && JSON.stringify(locator.entrypoints) === JSON.stringify(expected.entrypoints)
    && JSON.stringify(locator.resources) === JSON.stringify(expected.resources);
}

async function verifyLegacyMirror(target) {
  // Legacy mirrors are accepted only when byte-identical to a deterministic render
  // from the verified release tree. Unknown or user-modified mirrors are preserved.
  const temp = await mkdtemp(join(tmpdir(), "cairn-legacy-mirror-"));
  try {
    const expected = join(temp, "expected");
    if (target.id.startsWith("claude-command-")) {
      const name = target.id.slice("claude-command-".length);
      await renderMirrorFile(join(installedPluginRoot, ".claude", "commands", `cairn-${name}.md`), expected, claudeRuntimeLocatorPath, {}, installedPluginRoot);
    } else if (target.id.startsWith("claude-agent-")) {
      const name = target.id.slice("claude-agent-".length);
      await renderMirrorFile(join(installedPluginRoot, ".claude", "agents", `${name}.md`), expected, claudeRuntimeLocatorPath, {}, installedPluginRoot);
    } else if (target.id.startsWith("ide-skill-")) {
      const name = target.id.slice("ide-skill-".length);
      await cp(join(installedPluginRoot, "skills", name), expected, { recursive: true });
      const locator = antigravitySkillLocatorPath(antigravityHome, name);
      await renderMirrorFile(join(installedPluginRoot, "skills", name, "SKILL.md"), join(expected, "SKILL.md"), locator, { includeLocatorNotice: true }, installedPluginRoot);
      await writeLocator(join(expected, "references", "cairn-runtime.json"), installedPluginRoot);
    } else if (target.id.startsWith("cli-skill-")) {
      const name = target.id.slice("cli-skill-".length);
      await renderMirrorFile(join(installedPluginRoot, "skills", name, "SKILL.md"), expected, antigravityRuntimeLocatorPath(antigravityCliHome), { includeLocatorNotice: true }, installedPluginRoot);
    } else if (target.id.startsWith("legacy-ide-skill-") || target.id.startsWith("legacy-cli-skill-")) {
      const isIde = target.id.startsWith("legacy-ide-skill-");
      const prefix = isIde ? "legacy-ide-skill-" : "legacy-cli-skill-";
      const name = target.id.slice(prefix.length);
      const root = isIde ? legacyAntigravityHome : antigravityCliHome;
      const locator = antigravitySkillLocatorPath(root, name);
      await cp(join(installedPluginRoot, "skills", name), expected, { recursive: true });
      await renderMirrorFile(join(installedPluginRoot, "skills", name, "SKILL.md"), join(expected, "SKILL.md"), locator, { includeLocatorNotice: true }, installedPluginRoot);
      await writeLocator(join(expected, "references", "cairn-runtime.json"), installedPluginRoot);
    } else if (target.id.startsWith("legacy-ide-workflow-")) {
      const name = target.id.slice("legacy-ide-workflow-".length);
      await renderMirrorFile(join(installedPluginRoot, ".agents", "workflows", `cairn-${name}.md`), expected, antigravityRuntimeLocatorPath(legacyAntigravityHome), {}, installedPluginRoot);
    } else if (target.id.startsWith("ide-workflow-") || target.id.startsWith("cli-workflow-")) {
      const isIde = target.id.startsWith("ide-workflow-");
      const prefix = isIde ? "ide-workflow-" : "cli-workflow-";
      const name = target.id.slice(prefix.length);
      const root = isIde ? antigravityHome : antigravityCliHome;
      await renderMirrorFile(join(installedPluginRoot, ".agents", "workflows", `cairn-${name}.md`), expected, antigravityRuntimeLocatorPath(root), {}, installedPluginRoot);
    } else {
      throw new Error(`Legacy mirror target is not recognized: ${target.id}`);
    }
    if (await targetDigest(expected, "file") !== await targetDigest(target.path, target.type)) throw new Error(`Legacy mirror was modified: ${target.path}`);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

export async function targetDigest(path, type) {
  if (!(await exists(path))) return "missing";
  if (type === "config") return sha(cairnConfigProjection((await readSharedConfigSnapshot(path)).text));
  const info = await lstat(path);
  if (info.isSymbolicLink() || (!info.isFile() && !info.isDirectory())) throw new Error(`Managed artifact is not a regular file/tree: ${path}`);
  if (info.isFile()) return sha(await readFile(path));
  const files = await regularFiles(path);
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file).update("\0").update(await readFile(join(path, file))).update("\0");
  }
  return `sha256:${hash.digest("hex")}`;
}

async function regularFiles(root) {
  const output = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) throw new Error(`Symlink or special file is not allowed in managed tree: ${path}`);
      if (entry.isDirectory()) await walk(path);
      else output.push(relative(root, path).split(sep).join("/"));
    }
  }
  const info = await lstat(root);
  if (info.isSymbolicLink()) throw new Error(`Symlink is not allowed: ${root}`);
  if (info.isFile()) return [basename(root)];
  await walk(root);
  return output.sort();
}

async function assertRegularTree(path) {
  await regularFiles(path);
}

function sha(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function updateConfig(config, hookStates, { marketplacePath = marketplaceRoot } = {}) {
  let next = removeCairnConfig(config);
  next = append(next, `[marketplaces.cairn]\nlast_updated = ${JSON.stringify(new Date().toISOString().replace(/\.\d{3}Z$/, "Z"))}\nsource_type = "local"\nsource = ${JSON.stringify(marketplacePath)}\n`);
  next = append(next, '[plugins."cairn@cairn"]\nenabled = true\n');
  for (const state of hookStates) next = append(next, `[hooks.state.${JSON.stringify(state.key)}]\ntrusted_hash = ${JSON.stringify(state.trustedHash)}\n`);
  return next;
}

export function removeCairnConfig(config) {
  return splitSections(config).map((section) => isCairnConfigSection(section)
    ? splitTrailingTomlTrivia(section.text).trivia
    : section.text).join("");
}

function cairnConfigProjection(config) {
  return splitSections(config).filter(isCairnConfigSection)
    .map((section) => splitTrailingTomlTrivia(section.text).body).join("");
}

function isCairnConfigSection(section) {
  return section.header === "marketplaces.cairn"
    || section.header === 'plugins."cairn@cairn"'
    || (section.header?.startsWith("hooks.state.") && section.header.includes("cairn@cairn:"));
}

function splitTrailingTomlTrivia(text) {
  const lines = text.split(/(?<=\n)/);
  let boundary = lines.length;
  while (boundary > 0) {
    const line = lines[boundary - 1];
    if (line.length === 0 || line.trim().length === 0 || line.trimStart().startsWith("#")) boundary -= 1;
    else break;
  }
  return { body: lines.slice(0, boundary).join(""), trivia: lines.slice(boundary).join("") };
}

async function readSharedConfigSnapshot(path) {
  let pathInfo;
  try {
    pathInfo = await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return { exists: false, text: "", digest: "missing" };
    throw error;
  }
  if (pathInfo.isSymbolicLink() || !pathInfo.isFile()) throw new Error(`Managed config is not a regular file: ${path}`);
  let handle;
  try {
    const flags = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0) | (fsConstants.O_NONBLOCK ?? 0);
    handle = await open(path, flags);
  } catch (error) {
    if (["ELOOP", "EFTYPE", "ENXIO"].includes(error?.code)) throw new Error(`Managed config is not a regular file: ${path}`);
    throw error;
  }
  try {
    const openedInfo = await handle.stat();
    if (!openedInfo.isFile() || openedInfo.dev !== pathInfo.dev || openedInfo.ino !== pathInfo.ino) {
      throw new Error(`Managed config changed identity while opening: ${path}`);
    }
    const text = await handle.readFile("utf8");
    return { exists: true, text, digest: sha(text) };
  } finally {
    await handle.close();
  }
}

export function ensureSetting(config, sectionName, key, value) {
  const sections = splitSections(config);
  const index = sections.findIndex((section) => section.header === sectionName);
  if (index === -1) return append(config, `[${sectionName}]\n${key} = ${value}\n`);
  const lines = sections[index].text.trimEnd().split("\n");
  const settingIndex = lines.findIndex((line) => line.trim().startsWith(`${key} =`));
  if (settingIndex === -1) lines.push(`${key} = ${value}`);
  else lines[settingIndex] = `${key} = ${value}`;
  sections[index].text = `${lines.join("\n")}\n`;
  return sections.map((section) => section.text).join("");
}

export function hasSetting(config, sectionName, key, value) {
  const section = splitSections(config).find((candidate) => candidate.header === sectionName);
  return section?.text.split("\n").some((line) => line.trim() === `${key} = ${value}`) ?? false;
}

export function splitSections(config) {
  const result = [];
  let current = { header: null, text: "" };
  let multiline = null;
  for (const line of config.split(/(?<=\n)/)) {
    const delimiterCount = (delimiter) => line.split(delimiter).length - 1;
    if (multiline) {
      current.text += line;
      if (delimiterCount(multiline) % 2 === 1) multiline = null;
      continue;
    }
    const doubleCount = delimiterCount('"""');
    const singleCount = delimiterCount("'''");
    const match = line.trim().match(/^\[([^\]]+)\]$/);
    if (match) {
      if (current.text.length > 0) result.push(current);
      current = { header: match[1], text: line };
    } else current.text += line;
    if (doubleCount % 2 === 1) multiline = '"""';
    else if (singleCount % 2 === 1) multiline = "'''";
  }
  if (current.text.length > 0) result.push(current);
  return result;
}

async function trustedHookStates(root) {
  const parsed = await readJson(join(root, "hooks", "hooks.json"));
  const states = [];
  const labels = { SessionStart: "session_start", UserPromptSubmit: "user_prompt_submit", PostToolUse: "post_tool_use", Stop: "stop", SubagentStop: "subagent_stop" };
  for (const [eventName, groups] of Object.entries(parsed?.hooks ?? {})) {
    const eventLabel = labels[eventName];
    if (!eventLabel || !Array.isArray(groups)) continue;
    for (const [groupIndex, group] of groups.entries()) for (const [handlerIndex, handler] of (group.hooks ?? []).entries()) {
      states.push({ key: `cairn@cairn:hooks/hooks.json:${eventLabel}:${groupIndex}:${handlerIndex}`, trustedHash: hookHash(eventLabel, group.matcher, handler) });
    }
  }
  return states;
}

export function hookHash(eventName, matcher, handler) {
  const normalized = { type: "command", command: handler.command, timeout: Math.max(Number(handler.timeout ?? 600), 1), async: false };
  if (typeof handler.statusMessage === "string") normalized.statusMessage = handler.statusMessage;
  const identity = { event_name: eventName, hooks: [normalized] };
  if (typeof matcher === "string") identity.matcher = matcher;
  return sha(JSON.stringify(canonical(identity)));
}

export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function append(config, block) {
  if (config.length === 0) return `${block.trimEnd()}\n`;
  return `${config}${config.endsWith("\n") ? "" : "\n"}${block.trimEnd()}\n`;
}

export function pathHasSegment(path, segment) { return path.split(/[\\/]+/).includes(segment); }
export function shouldCopyPluginPath(source) {
  const name = source.split(/[\\/]+/).at(-1);
  if ([".git", "node_modules", ".cairn"].includes(name)) return false;
  if (sep === "/" && source.includes("\\")) return true;
  const relativePath = relative(pluginRoot, source);
  // Windows fs.cp filters can surface an absolute path when source and pluginRoot
  // use different drive/callback representations. Excluded basenames remain denied.
  if (isAbsolute(relativePath)) return true;
  const path = relativePath.split(sep).join("/");
  if (path === "") return true;
  if (path.startsWith("../") || path === "..") return true;
  if (/^(package\.json|LICENSE|README(?:\.[^.]+)?\.md)$/.test(path)) return true;
  if (path === "docs") return true;
  if (path.startsWith("docs/")) return path === "docs/model-guidance" || path.startsWith("docs/model-guidance/");
  return [".agents", ".claude", ".codex-plugin", "agents", "commands", "hooks", "scripts", "skills", "templates"]
    .some((directory) => path === directory || path.startsWith(`${directory}/`));
}
export function samePath(left, right) { try { return realpathSync(left) === realpathSync(right); } catch { return resolve(left) === resolve(right); } }
export function commandNames() { return ["install", "upgrade", "doctor", "uninstall", "memory", "plan", "work", "review", "toolcheck"]; }
export function skillNames() { return ["cairn-memory", "cairn-plan", "cairn-work", "cairn-review"]; }

export function renderInstalledMirror(content, { runtimeRoot = versionedPluginRoot, locatorPath = installedRuntimeLocatorPath, platform = process.platform } = {}) {
  const platformJoin = platform === "win32" ? win32.join : posix.join;
  const quotedCli = quoteShellArg(platformJoin(runtimeRoot, "scripts", "cairn.mjs"), platform);
  let rendered = content.replaceAll("{{CAIRN_RUNTIME_LOCATOR_JSON}}", JSON.stringify(locatorPath))
    .replace(/\bnode\s+scripts\/cairn\.mjs\b/g, `node ${quotedCli}`)
    .replace(/\bnode\s+scripts\/([A-Za-z0-9._/-]+)/g, (_, path) => `node ${quoteShellArg(join(runtimeRoot, "scripts", path), platform)}`);
  rendered = rendered.replace(/(^|[\s`("'=])(commands|agents|templates|docs\/model-guidance)\/([A-Za-z0-9._<>/-]+)/gm,
    (_, prefix, directory, suffix) => `${prefix}${platformJoin(runtimeRoot, directory, suffix)}`);
  return rendered;
}

export function quoteShellArg(value, platform = process.platform) { return platform === "win32" ? `"${value.replaceAll('"', '""')}"` : `'${value.replaceAll("'", "'\\''")}'`; }
function antigravityRuntimeLocatorPath(root) { return join(root, "cairn", "runtime.json"); }
function installedSkillLocatorPath(name) { return join(versionedPluginRoot, "skills", name, "references", "cairn-runtime.json"); }
function antigravitySkillLocatorPath(root, name) { return join(root, "skills", name, "references", "cairn-runtime.json"); }

async function writeLocator(path, root) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, `${JSON.stringify(createRuntimeLocator(root), null, 2)}\n`); }
async function validRuntimeLocator(path) {
  try {
    const locator = await readJson(path);
    const expected = createRuntimeLocator(versionedPluginRoot);
    if (locator?.schemaVersion !== RUNTIME_LOCATOR_SCHEMA_VERSION || resolve(locator.pluginRoot ?? ".") !== resolve(versionedPluginRoot)) return false;
    for (const [name, value] of Object.entries(expected.entrypoints)) if (locator.entrypoints?.[name] !== value) return false;
    for (const [name, value] of Object.entries(expected.resources)) if (locator.resources?.[name] !== value) return false;
    return (await Promise.all(runtimeRequiredPaths(locator).map(exists))).every(Boolean);
  } catch { return false; }
}

async function renderMirrorFile(source, destination, locatorPath, { includeLocatorNotice = false } = {}, runtimeRoot = versionedPluginRoot) {
  const content = await readFile(source, "utf8");
  const notice = includeLocatorNotice ? `\n\n## Installed Cairn runtime\n\nRead the structured runtime locator at \`${JSON.stringify(locatorPath)}\`. Resolve Cairn scripts and static resources from its absolute paths, never from the target project.\n` : "";
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, `${renderInstalledMirror(content, { runtimeRoot, locatorPath }).trimEnd()}${notice}`);
}

function hostJson(args, extraEnv = {}) {
  const result = spawnSync("codex", args, { encoding: "utf8", env: { ...process.env, ...extraEnv } });
  if (result.error || result.status !== 0) return null;
  try { return JSON.parse(result.stdout); } catch { return null; }
}

export function findPluginStatus(value, id) {
  const entries = Array.isArray(value) ? value : value?.installed ?? value?.plugins ?? value?.data ?? [];
  return entries.find((entry) => entry.pluginId === id || entry.id === id || entry.name === id || `${entry.name}@${entry.marketplaceName ?? entry.marketplace}` === id) ?? null;
}

export function parseCodexFeatureList(output) {
  if (typeof output !== "string" || output.trim().length === 0) return null;
  const features = {};
  for (const line of output.split(/\r?\n/)) {
    const match = line.trim().match(/^([A-Za-z0-9_]+)\s+.+?\s+(true|false)$/);
    if (match) features[match[1]] = match[2] === "true";
  }
  return Object.keys(features).length > 0 ? features : null;
}

async function validateAntigravitySkills() {
  try {
    if (!(await validRuntimeLocator(antigravityRuntimeLocatorPath(antigravityCliHome)))) return false;
    for (const name of skillNames()) {
      const content = await readFile(join(antigravityCliHome, "skills", `${name}.md`), "utf8");
      if (!/^---\r?\n[\s\S]*?\r?\n---\r?\n/.test(content) || !/^name:\s*\S+/m.test(content) || !/^description:\s*\S+/m.test(content)) return false;
      if (!content.includes(JSON.stringify(antigravityRuntimeLocatorPath(antigravityCliHome)))) return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function readJson(path) { if (!(await exists(path))) return null; return JSON.parse(await readFile(path, "utf8")); }
async function readText(path) { if (!(await exists(path))) return ""; return readFile(path, "utf8"); }
async function exists(path) { try { await lstat(path); return true; } catch (error) { if (error.code === "ENOENT") return false; throw error; } }
function help() { console.log(t("usage")); }
function t(key) {
  const messages = { en: { installComplete: "Cairn install complete", upgradeComplete: "Cairn upgrade complete", uninstallComplete: "Cairn uninstall complete", usage: "Usage: cairn install|upgrade|doctor|uninstall|toolcheck" }, ko: { installComplete: "Cairn 설치 완료", upgradeComplete: "Cairn 업그레이드 완료", uninstallComplete: "Cairn 언인스톨 완료", usage: "사용법: cairn install|upgrade|doctor|uninstall|toolcheck" } };
  return messages[localeFamily()]?.[key] ?? messages.en[key];
}
export function localeFamily() { const locale = [process.env.LC_ALL, process.env.LC_MESSAGES, process.env.LANG].find((value) => typeof value === "string" && value.length > 0) ?? Intl.DateTimeFormat().resolvedOptions().locale; return locale.toLowerCase().startsWith("ko") ? "ko" : "en"; }
function isCliEntry() { if (!process.argv[1]) return false; try { return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]); } catch { return import.meta.url === pathToFileURL(process.argv[1]).href; } }
