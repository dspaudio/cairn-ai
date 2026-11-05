import { spawnSync } from "node:child_process";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { hasSetting, readSharedConfigSnapshot, removeCairnConfig, splitSections } from "./cairn-lifecycle-config.mjs";
import {
  installedSkillLocatorPath, validRuntimeLocator, validateAntigravitySkills,
} from "./cairn-lifecycle-mirror.mjs";
import { createClaudeRegistration } from "./cairn-lifecycle-claude.mjs";

export function createCommands(context) {
  const {
    antigravityCliHome, antigravityHome, claudeHome, claudeHomeOverridden, claudePluginMarketplaceRoot,
    claudeRuntimeLocatorPath, codexHome, marketplaceName, configPath, installedPluginRoot, installedRuntimeLocatorPath,
    marketplaceJsonPath, ownershipPath, phases, pluginName, pluginRoot,
    pruneUninstallScaffolds, releaseVersion, samePath, skillNames, t, transaction,
    versionedPluginRoot, staging, integrity,
  } = context;
  const {
    createTransaction, finishTransaction, recoverInterruptedTransaction,
    removeManagedTarget, replaceTarget, rollback,
  } = transaction;
  const { legacyMigrationTargets, stageInstall } = staging;
  const claudeRegistration = createClaudeRegistration({
    claudeHome, claudeHomeOverridden, marketplaceRoot: claudePluginMarketplaceRoot, marketplaceName, pluginName,
  });
  const {
    adoptLegacy, anyManagedArtifactExists, assertOwnershipDigests,
    assertTargetsReplaceable, ownershipDigestsValid, readOwnership, targetDigest,
    targetRecord, validateOwnershipShape, versionedRuntimeRoot,
  } = integrity;
async function install(mode) {
  if (samePath(pluginRoot, installedPluginRoot) || samePath(pluginRoot, versionedPluginRoot)) {
    throw new Error("Run install or upgrade from the Cairn package/global source, not from the installed cache.");
  }
  await recoverInterruptedTransaction();
  const transaction = await createTransaction();
  try {
    const targets = await stageInstall(transaction.stageRoot);
    if (process.env.CAIRN_TEST_CRASH_AFTER_STAGE === "1") process.exit(87);
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
  reportClaudeRegistration();
}

// Files are committed first; registering with Claude Code is idempotent, and a failure leaves the files
// installed with a manual command to finish, instead of rolling back a working Codex/Antigravity install.
function reportClaudeRegistration() {
  const manual = `claude plugin marketplace add ${JSON.stringify(claudePluginMarketplaceRoot)} && claude plugin install ${claudeRegistration.pluginId} --scope user`;
  try {
    const result = claudeRegistration.register();
    if (result.registered) {
      console.log(`Claude Code plugin: ${claudeRegistration.pluginId} (${claudePluginMarketplaceRoot})`);
      return;
    }
    console.log(`Claude Code plugin not registered: ${result.reason}. To register: ${manual}`);
  } catch (error) {
    console.log(`Claude Code plugin registration failed: ${error.message}. To register: ${manual}`);
    process.exitCode = 1;
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
  // Unregister before removing files so Claude Code never points at a deleted plugin; a failure aborts with nothing changed.
  const unregistered = claudeRegistration.unregister().unregistered;
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
    if (transaction.state !== "committed") {
      await rollback(transaction);
      // The rollback restored the plugin files, so restore the Claude Code registration that preceded them.
      if (unregistered) {
        try { claudeRegistration.register(); } catch (registrationError) { console.error(`Claude Code plugin re-registration failed: ${registrationError.message}`); }
      }
    }
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
  checks.push(["installed runtime locator", await validRuntimeLocator(installedRuntimeLocatorPath, versionedPluginRoot)]);
  checks.push(["installed skill locators", (await Promise.all(skillNames().map((name) => validRuntimeLocator(installedSkillLocatorPath(versionedPluginRoot, name), versionedPluginRoot)))).every(Boolean)]);
  checks.push(["installed CLI script", await exists(join(versionedPluginRoot, "scripts", "cairn.mjs"))]);
  checks.push(["installed plan template", await exists(join(versionedPluginRoot, "templates", "work-plan.md"))]);
  checks.push(["installed model guidance", await exists(join(versionedPluginRoot, "docs", "model-guidance", "codex.md"))]);
  const config = (await readSharedConfigSnapshot(configPath)).text;
  checks.push(["config marketplace", splitSections(config).some((section) => section.header === "marketplaces.cairn")]);
  checks.push(["config plugin enabled", hasSetting(config, 'plugins."cairn@cairn"', "enabled", "true")]);
  checks.push(["Claude runtime locator", await validRuntimeLocator(claudeRuntimeLocatorPath, versionedPluginRoot)]);
  const claudePluginManifest = await readJson(join(claudePluginMarketplaceRoot, pluginName, ".claude-plugin", "plugin.json"));
  checks.push(["Claude plugin files", claudePluginManifest?.version === releaseVersion
    && await exists(join(claudePluginMarketplaceRoot, ".claude-plugin", "marketplace.json"))
    && await exists(join(claudePluginMarketplaceRoot, pluginName, "hooks", "hooks.json"))]);
  let claudeStatus = null;
  try { claudeStatus = claudeRegistration.status(); } catch { claudeStatus = null; }
  checks.push(["Claude plugin registered", Boolean(claudeStatus?.marketplace && claudeStatus.installed)]);
  checks.push(["Claude plugin enabled", Boolean(claudeStatus?.enabled)]);
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
  checks.push(["Antigravity CLI skill validation", await validateAntigravitySkills(antigravityCliHome, skillNames(), versionedPluginRoot)]);
  for (const [name, ok] of checks) console.log(`${ok ? "OK" : "FAIL"} ${name}`);
  if (checks.some(([, ok]) => !ok)) process.exitCode = 1;
}


  function injectFailure(point) {
    if (process.env.CAIRN_TEST_FAIL_PHASE === point) throw new Error(`Injected lifecycle failure: ${point}`);
  }

function hostJson(args, extraEnv = {}) {
  const result = spawnSync("codex", args, { encoding: "utf8", env: { ...process.env, ...extraEnv } });
  if (result.error || result.status !== 0) return null;
  try { return JSON.parse(result.stdout); } catch { return null; }
}

function findPluginStatus(value, id) {
  const entries = Array.isArray(value) ? value : value?.installed ?? value?.plugins ?? value?.data ?? [];
  return entries.find((entry) => entry.pluginId === id || entry.id === id || entry.name === id || `${entry.name}@${entry.marketplaceName ?? entry.marketplace}` === id) ?? null;
}

function parseCodexFeatureList(output) {
  if (typeof output !== "string" || output.trim().length === 0) return null;
  const features = {};
  for (const line of output.split(/\r?\n/)) {
    const match = line.trim().match(/^([A-Za-z0-9_]+)\s+.+?\s+(true|false)$/);
    if (match) features[match[1]] = match[2] === "true";
  }
  return Object.keys(features).length > 0 ? features : null;
}

async function readJson(path) { if (!(await exists(path))) return null; return JSON.parse(await readFile(path, "utf8")); }

  return { doctor, install, uninstall };

  async function exists(path) {
    try { await lstat(path); return true; }
    catch (error) { if (error?.code === "ENOENT") return false; throw error; }
  }
}
