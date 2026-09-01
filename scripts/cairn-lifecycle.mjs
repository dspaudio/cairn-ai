#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { lstat, readFile, rmdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolvePluginRoot } from "./cairn-paths.mjs";
import {
  canonical, ensureSetting, hasSetting, hookHash, removeCairnConfig, splitSections,
  updateConfig as projectConfig,
} from "./cairn-lifecycle-config.mjs";
import { createCommands } from "./cairn-lifecycle-commands.mjs";
import { createIntegrity } from "./cairn-lifecycle-integrity.mjs";
import {
  antigravityRuntimeLocatorPath, quoteShellArg, renderInstalledMirror as projectMirror,
} from "./cairn-lifecycle-mirror.mjs";
import {
  pathHasSegment, shouldCopyPluginPath as projectShouldCopyPluginPath,
} from "./cairn-lifecycle-staging.mjs";
import { createStaging } from "./cairn-lifecycle-staging.mjs";
import {
  createTransactionManager, DEFAULT_LIFECYCLE_LOCK_TIMEOUT_MS,
} from "./cairn-lifecycle-transaction.mjs";

export {
  canonical, DEFAULT_LIFECYCLE_LOCK_TIMEOUT_MS, ensureSetting, hasSetting, hookHash,
  pathHasSegment, quoteShellArg, removeCairnConfig, splitSections,
};

const pluginRoot = resolvePluginRoot(import.meta.url);
const homeRoot = process.env.HOME ?? process.env.USERPROFILE ?? homedir() ?? ".";
const codexHome = resolve(process.env.CODEX_HOME ?? join(homeRoot, ".codex"));
const claudeHome = resolve(process.env.CLAUDE_HOME ?? join(homeRoot, ".claude"));
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
const versionedPluginRoot = join(marketplaceRoot, pluginName, releaseVersion);
const installedRuntimeLocatorPath = join(versionedPluginRoot, ".cairn-runtime.json");
const phases = ["codex", "claude", "antigravity", "config", "cleanup"];
const MAX_LIFECYCLE_LOCK_TIMEOUT_MS = 2_147_483_647;

const lifecycleContext = {
  agentNames, antigravityCliHome, antigravityHome, claudeHome, claudeRuntimeLocatorPath,
  codexHome, commandNames, configPath, installedPluginRoot, installedRuntimeLocatorPath,
  legacyAntigravityHome, lifecycleLockPath, marketplaceJsonPath, marketplaceName,
  marketplaceRoot, ownershipPath, phases, pluginName, pluginRoot, releaseVersion,
  samePath, skillNames, transactionPath, transactionRoot, updateConfig, versionedPluginRoot,
};
const integrity = createIntegrity(lifecycleContext);
const transaction = createTransactionManager({ ...lifecycleContext, ...integrity });
const staging = createStaging({ ...lifecycleContext, assertRegularTree: integrity.assertRegularTree });
const commands = createCommands({
  ...lifecycleContext, integrity, pruneUninstallScaffolds, staging, t, transaction,
});

if (isCliEntry()) {
  try {
    const command = parseLifecycleInvocation(process.argv.slice(2));
    if (command === "install" || command === "upgrade") {
      await assertLifecycleMutationPaths();
      await transaction.withLifecycleLock(() => commands.install(command), { timeoutMs: lifecycleLockTimeout() });
    } else if (command === "doctor") {
      await assertNoSymlinkAncestor(codexHome, lifecycleLockPath);
      await transaction.withLifecycleLock(commands.doctor, { timeoutMs: lifecycleLockTimeout(), afterRelease: pruneUninstallRoots });
    } else if (command === "uninstall") {
      await assertLifecycleMutationPaths();
      await transaction.withLifecycleLock(commands.uninstall, { timeoutMs: lifecycleLockTimeout(), afterRelease: pruneUninstallRoots });
    } else help();
  } catch (error) {
    console.error(`Cairn lifecycle error: ${error.message}`);
    process.exitCode = 1;
  }
}

function parseLifecycleInvocation(args) {
  if (args.length === 0) return "help";
  const [command, ...trailing] = args;
  if (!["install", "upgrade", "doctor", "uninstall", "help"].includes(command)) throw new Error(`Unknown lifecycle command: ${command}`);
  if (trailing.length > 0) throw new Error(`Lifecycle command ${command} does not accept arguments: ${trailing.join(" ")}`);
  return command;
}

function lifecycleLockTimeout() {
  const raw = process.env.CAIRN_LIFECYCLE_LOCK_TIMEOUT_MS;
  if (raw === undefined) return DEFAULT_LIFECYCLE_LOCK_TIMEOUT_MS;
  if (!/^[1-9]\d*$/.test(raw)) throw new Error(`CAIRN_LIFECYCLE_LOCK_TIMEOUT_MS must be an integer between 1 and ${MAX_LIFECYCLE_LOCK_TIMEOUT_MS}`);
  const timeoutMs = Number(raw);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs > MAX_LIFECYCLE_LOCK_TIMEOUT_MS) throw new Error(`CAIRN_LIFECYCLE_LOCK_TIMEOUT_MS must be an integer between 1 and ${MAX_LIFECYCLE_LOCK_TIMEOUT_MS}`);
  return timeoutMs;
}

async function assertLifecycleMutationPaths() {
  const roots = [
    [codexHome, lifecycleLockPath], [codexHome, installedPluginRoot], [codexHome, versionedPluginRoot],
    [codexHome, marketplaceJsonPath], [isInside(codexHome, configPath) ? codexHome : dirname(configPath), configPath],
    [claudeHome, join(claudeHome, "commands")], [claudeHome, join(claudeHome, "agents")],
    [claudeHome, claudeRuntimeLocatorPath], [antigravityHome, join(antigravityHome, "skills")],
    ...skillNames().map((name) => [antigravityHome, join(antigravityHome, "skills", name)]),
    [antigravityHome, join(antigravityHome, "workflows")], [antigravityHome, antigravityRuntimeLocatorPath(antigravityHome)],
    [antigravityCliHome, join(antigravityCliHome, "skills")], [antigravityCliHome, join(antigravityCliHome, "workflows")],
    [antigravityCliHome, antigravityRuntimeLocatorPath(antigravityCliHome)],
    [legacyAntigravityHome, join(legacyAntigravityHome, "skills")], [legacyAntigravityHome, join(legacyAntigravityHome, "workflows")],
  ];
  for (const [root, destination] of roots) await assertNoSymlinkAncestor(root, destination);
}

async function assertNoSymlinkAncestor(root, destination) {
  const relation = relative(root, destination);
  if (relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) return;
  const paths = [resolve(root)];
  let current = resolve(root);
  for (const segment of relation.split(sep).filter(Boolean)) { current = join(current, segment); paths.push(current); }
  for (const path of paths) {
    let info;
    try { info = await lstat(path); }
    catch (error) { if (error?.code === "ENOENT") continue; throw error; }
    if (info.isSymbolicLink()) {
      if (path === configPath) throw new Error(`Managed config is not a regular file: ${path}`);
      throw new Error(`Lifecycle path ancestor must not be a symlink: ${path}`);
    }
  }
}

async function pruneUninstallScaffolds() {
  for (const path of [join(marketplaceRoot, "plugins"), join(marketplaceRoot, pluginName), join(marketplaceRoot, ".agents", "plugins"), join(marketplaceRoot, ".agents"), transactionRoot]) await removeEmptyDirectory(path);
}

async function pruneUninstallRoots() {
  await removeEmptyDirectory(dirname(lifecycleLockPath));
  await removeEmptyDirectory(marketplaceRoot);
}

async function removeEmptyDirectory(path) {
  try { await rmdir(path); }
  catch (error) { if (!["ENOENT", "ENOTEMPTY", "EEXIST"].includes(error?.code)) throw error; }
}

function isInside(root, candidate) {
  const path = resolve(candidate);
  return path === root || path.startsWith(`${root}${sep}`);
}

export async function verifyLegacy022Root(root) { return integrity.verifyLegacy022Root(root); }
export async function targetDigest(path, type) { return integrity.targetDigest(path, type); }
export function updateConfig(config, hookStates, options = {}) { return projectConfig(config, hookStates, { marketplacePath: options.marketplacePath ?? marketplaceRoot }); }
export function shouldCopyPluginPath(source) { return projectShouldCopyPluginPath(source, pluginRoot); }
export function samePath(left, right) { try { return realpathSync(left) === realpathSync(right); } catch { return resolve(left) === resolve(right); } }
export function commandNames() { return ["install", "upgrade", "doctor", "uninstall", "memory", "plan", "work", "review", "toolcheck"]; }
export function agentNames() { return ["explorer", "worker"]; }
export function skillNames() { return ["cairn-memory", "cairn-plan", "cairn-work", "cairn-review"]; }
export function renderInstalledMirror(content, options = {}) { return projectMirror(content, { runtimeRoot: options.runtimeRoot ?? versionedPluginRoot, locatorPath: options.locatorPath ?? installedRuntimeLocatorPath, platform: options.platform ?? process.platform }); }
export function findPluginStatus(value, id) { const entries = Array.isArray(value) ? value : value?.installed ?? value?.plugins ?? value?.data ?? []; return entries.find((entry) => entry.pluginId === id || entry.id === id || entry.name === id || `${entry.name}@${entry.marketplaceName ?? entry.marketplace}` === id) ?? null; }
export function parseCodexFeatureList(output) { if (typeof output !== "string" || output.trim().length === 0) return null; const features = {}; for (const line of output.split(/\r?\n/)) { const match = line.trim().match(/^([A-Za-z0-9_]+)\s+.+?\s+(true|false)$/); if (match) features[match[1]] = match[2] === "true"; } return Object.keys(features).length > 0 ? features : null; }
export function localeFamily() { const locale = [process.env.LC_ALL, process.env.LC_MESSAGES, process.env.LANG].find((value) => typeof value === "string" && value.length > 0) ?? Intl.DateTimeFormat().resolvedOptions().locale; return locale.toLowerCase().startsWith("ko") ? "ko" : "en"; }

function help() { console.log(t("usage")); }
function t(key) { const messages = { en: { installComplete: "Cairn install complete", upgradeComplete: "Cairn upgrade complete", uninstallComplete: "Cairn uninstall complete", usage: "Usage: cairn install|upgrade|doctor|uninstall|toolcheck" }, ko: { installComplete: "Cairn 설치 완료", upgradeComplete: "Cairn 업그레이드 완료", uninstallComplete: "Cairn 언인스톨 완료", usage: "사용법: cairn install|upgrade|doctor|uninstall|toolcheck" } }; return messages[localeFamily()]?.[key] ?? messages.en[key]; }
function isCliEntry() { if (!process.argv[1]) return false; try { return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]); } catch { return import.meta.url === pathToFileURL(process.argv[1]).href; } }
