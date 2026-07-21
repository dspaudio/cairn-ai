#!/usr/bin/env node
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
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
const antigravityHome = resolve(process.env.ANTIGRAVITY_HOME ?? join(homeRoot, ".agents"));
const antigravityCliHome = resolve(process.env.ANTIGRAVITY_CLI_HOME ?? join(homeRoot, ".gemini", "antigravity-cli"));
const configPath = process.env.CODEX_CONFIG_PATH ?? join(codexHome, "config.toml");
const marketplaceName = "cairn";
const pluginName = "cairn";
const marketplaceRoot = join(codexHome, "plugins", "cache", marketplaceName);
const installedPluginRoot = join(marketplaceRoot, "plugins", pluginName);
const marketplaceJsonPath = join(marketplaceRoot, ".agents", "plugins", "marketplace.json");
const installedRuntimeLocatorPath = join(installedPluginRoot, ".cairn-runtime.json");
const claudeRuntimeLocatorPath = join(claudeHome, "cairn", "runtime.json");

if (isCliEntry()) {
  const command = process.argv[2] ?? "help";
  if (command === "install" || command === "upgrade") await install(command);
  else if (command === "doctor") await doctor();
  else if (command === "uninstall") await uninstall();
  else help();
}

async function install(mode) {
  if (samePath(pluginRoot, installedPluginRoot)) {
    throw new Error("Run install or upgrade from the Cairn package/global source, not from the installed cache.");
  }
  await copyPlugin();
  await writeRuntimeLocator(installedRuntimeLocatorPath);
  await writeInstalledSkillLocators();
  await writeMarketplace();
  await installClaudeFiles();
  await installAntigravityFiles();
  const hookStates = await trustedHookStates();
  const config = await readText(configPath);
  await backupConfig();
  await writeFile(configPath, `${updateConfig(config, hookStates).trimEnd()}\n`);
  console.log(t(mode === "upgrade" ? "upgradeComplete" : "installComplete"));
  console.log(`Codex plugin: ${installedPluginRoot}`);
  console.log(`Marketplace: ${marketplaceJsonPath}`);
  console.log(`Hook trust states: ${hookStates.length}`);
  console.log(`Antigravity skills: ${join(antigravityHome, "skills")}`);
}

async function doctor() {
  const checks = [];
  checks.push(["source", await exists(join(pluginRoot, ".codex-plugin", "plugin.json"))]);
  checks.push(["installed plugin", await exists(join(installedPluginRoot, ".codex-plugin", "plugin.json"))]);
  checks.push(["marketplace", await exists(marketplaceJsonPath)]);
  const installedManifest = await readJson(join(installedPluginRoot, ".codex-plugin", "plugin.json"));
  checks.push(["installed hooks manifest field", installedManifest?.hooks === "./hooks/hooks.json"]);
  checks.push(["hooks file", await exists(join(installedPluginRoot, "hooks", "hooks.json"))]);
  checks.push(["installed runtime locator", await validRuntimeLocator(installedRuntimeLocatorPath)]);
  checks.push(["installed skill locators", (await Promise.all(skillNames().map((name) => validRuntimeLocator(installedSkillLocatorPath(name))))).every(Boolean)]);
  checks.push(["installed CLI script", await exists(join(installedPluginRoot, "scripts", "cairn.mjs"))]);
  checks.push(["installed plan template", await exists(join(installedPluginRoot, "templates", "work-plan.md"))]);
  checks.push(["installed model guidance", await exists(join(installedPluginRoot, "docs", "model-guidance", "codex.md"))]);
  const config = await readText(configPath);
  checks.push(["config features.plugins", hasSetting(config, "features", "plugins", "true")]);
  checks.push(["config features.plugin_hooks", hasSetting(config, "features", "plugin_hooks", "true")]);
  checks.push(["config features.multi_agent", hasSetting(config, "features", "multi_agent", "true")]);
  checks.push(["config agents.max_depth", hasSetting(config, "agents", "max_depth", "2")]);
  checks.push(["config marketplace", config.includes("[marketplaces.cairn]")]);
  checks.push(["config plugin enabled", config.includes('[plugins."cairn@cairn"]') && hasSetting(config, 'plugins."cairn@cairn"', "enabled", "true")]);
  const expectedStates = await trustedHookStates();
  const missingStates = expectedStates.filter((state) => !config.includes(`[hooks.state.${JSON.stringify(state.key)}]`));
  checks.push(["trusted hook states", expectedStates.length > 0 && missingStates.length === 0]);
  checks.push(["Claude commands", await exists(join(claudeHome, "commands", "cairn-plan.md"))]);
  checks.push(["Claude agents", await exists(join(claudeHome, "agents", "cairn-explorer.md"))]);
  checks.push(["Claude runtime locator", await validRuntimeLocator(claudeRuntimeLocatorPath)]);
  checks.push(["Antigravity skills", await exists(join(antigravityHome, "skills", "cairn-plan", "SKILL.md"))]);
  checks.push(["Antigravity workflows", await exists(join(antigravityHome, "workflows", "cairn-plan.md"))]);
  checks.push(["Antigravity runtime locator", await validRuntimeLocator(antigravityRuntimeLocatorPath(antigravityHome))]);
  checks.push(["Antigravity skill locators", (await Promise.all(skillNames().map((name) => validRuntimeLocator(antigravitySkillLocatorPath(antigravityHome, name))))).every(Boolean)]);
  checks.push(["Antigravity CLI skills", await exists(join(antigravityCliHome, "skills", "cairn-plan", "SKILL.md"))]);
  checks.push(["Antigravity CLI workflows", await exists(join(antigravityCliHome, "workflows", "cairn-plan.md"))]);
  checks.push(["Antigravity CLI runtime locator", await validRuntimeLocator(antigravityRuntimeLocatorPath(antigravityCliHome))]);
  checks.push(["Antigravity CLI skill locators", (await Promise.all(skillNames().map((name) => validRuntimeLocator(antigravitySkillLocatorPath(antigravityCliHome, name))))).every(Boolean)]);
  for (const [name, ok] of checks) console.log(`${ok ? "OK" : "FAIL"} ${name}`);
  if (checks.some(([, ok]) => !ok)) process.exitCode = 1;
}

async function uninstall() {
  const config = await readText(configPath);
  await backupConfig();
  await writeFile(configPath, `${removeCairnConfig(config).trimEnd()}\n`);
  await rm(marketplaceRoot, { recursive: true, force: true });
  for (const name of commandNames()) {
    await rm(join(claudeHome, "commands", `cairn-${name}.md`), { force: true });
  }
  for (const name of ["architect", "planner", "builder", "reviewer", "explorer", "worker"]) {
    await rm(join(claudeHome, "agents", `cairn-${name}.md`), { force: true });
  }
  await rm(join(claudeHome, "cairn"), { recursive: true, force: true });
  await uninstallAntigravityFiles();
  console.log(t("uninstallComplete"));
}

async function copyPlugin() {
  await rm(installedPluginRoot, { recursive: true, force: true });
  await mkdir(dirname(installedPluginRoot), { recursive: true });
  await cp(pluginRoot, installedPluginRoot, {
    recursive: true,
    filter: (source) => !pathHasSegment(relative(pluginRoot, source), ".git") && !pathHasSegment(relative(pluginRoot, source), "node_modules"),
  });
  const manifestPath = join(installedPluginRoot, ".codex-plugin", "plugin.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.hooks = "./hooks/hooks.json";
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function writeMarketplace() {
  await mkdir(dirname(marketplaceJsonPath), { recursive: true });
  const marketplace = {
    name: marketplaceName,
    interface: { displayName: "Cairn" },
    plugins: [{
      name: pluginName,
      source: { source: "local", path: "./plugins/cairn" },
      policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
      category: "Productivity",
    }],
  };
  await writeFile(marketplaceJsonPath, `${JSON.stringify(marketplace, null, 2)}\n`);
}

async function installClaudeFiles() {
  await mkdir(join(claudeHome, "commands"), { recursive: true });
  await mkdir(join(claudeHome, "agents"), { recursive: true });
  await writeRuntimeLocator(claudeRuntimeLocatorPath);
  for (const name of commandNames()) {
    await renderMirrorFile(
      join(installedPluginRoot, ".claude", "commands", `cairn-${name}.md`),
      join(claudeHome, "commands", `cairn-${name}.md`),
      claudeRuntimeLocatorPath,
    );
  }
  for (const name of ["explorer", "worker"]) {
    await renderMirrorFile(
      join(installedPluginRoot, ".claude", "agents", `${name}.md`),
      join(claudeHome, "agents", `cairn-${name}.md`),
      claudeRuntimeLocatorPath,
    );
  }
}

async function installAntigravityFiles() {
  for (const root of [antigravityHome, antigravityCliHome]) {
    await mkdir(join(root, "skills"), { recursive: true });
    await mkdir(join(root, "workflows"), { recursive: true });
    await writeRuntimeLocator(antigravityRuntimeLocatorPath(root));
    for (const name of skillNames()) {
      await rm(join(root, "skills", name), { recursive: true, force: true });
      await cp(join(installedPluginRoot, "skills", name), join(root, "skills", name), { recursive: true });
      await renderMirrorFile(
        join(installedPluginRoot, "skills", name, "SKILL.md"),
        join(root, "skills", name, "SKILL.md"),
        antigravitySkillLocatorPath(root, name),
        { includeLocatorNotice: true },
      );
      await writeRuntimeLocator(antigravitySkillLocatorPath(root, name));
    }
    for (const name of commandNames()) {
      await renderMirrorFile(
        join(installedPluginRoot, ".agents", "workflows", `cairn-${name}.md`),
        join(root, "workflows", `cairn-${name}.md`),
        antigravityRuntimeLocatorPath(root),
      );
    }
  }
}

async function uninstallAntigravityFiles() {
  for (const root of [antigravityHome, antigravityCliHome]) {
    for (const name of skillNames()) {
      await rm(join(root, "skills", name), { recursive: true, force: true });
    }
    for (const name of commandNames()) {
      await rm(join(root, "workflows", `cairn-${name}.md`), { force: true });
    }
    await rm(join(root, "cairn"), { recursive: true, force: true });
  }
}

export function updateConfig(config, hookStates) {
  let next = removeCairnConfig(config);
  next = ensureSetting(next, "features", "plugins", "true");
  next = ensureSetting(next, "features", "plugin_hooks", "true");
  next = ensureSetting(next, "features", "multi_agent", "true");
  next = ensureSetting(next, "agents", "max_depth", "2");
  next = append(next, `[marketplaces.cairn]\nlast_updated = ${JSON.stringify(new Date().toISOString().replace(/\.\d{3}Z$/, "Z"))}\nsource_type = "local"\nsource = ${JSON.stringify(marketplaceRoot)}\n`);
  next = append(next, '[plugins."cairn@cairn"]\nenabled = true\n');
  for (const state of hookStates) next = append(next, `[hooks.state.${JSON.stringify(state.key)}]\ntrusted_hash = ${JSON.stringify(state.trustedHash)}\n`);
  return next;
}

export function removeCairnConfig(config) {
  return splitSections(config).filter((section) => {
    if (section.header === null) return true;
    if (section.header === "marketplaces.cairn") return false;
    if (section.header === 'plugins."cairn@cairn"') return false;
    return !(section.header.startsWith("hooks.state.") && section.header.includes("cairn@cairn:"));
  }).map((section) => section.text).join("").replace(/\n{3,}/g, "\n\n");
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
  for (const line of config.split(/(?<=\n)/)) {
    const match = line.trim().match(/^\[([^\]]+)\]$/);
    if (match) {
      if (current.text.length > 0) result.push(current);
      current = { header: match[1], text: line };
    } else current.text += line;
  }
  if (current.text.length > 0) result.push(current);
  return result;
}

async function trustedHookStates() {
  const hooksPath = join(installedPluginRoot, "hooks", "hooks.json");
  const parsed = await readJson(hooksPath);
  const states = [];
  const labels = { SessionStart: "session_start", UserPromptSubmit: "user_prompt_submit", PostToolUse: "post_tool_use", Stop: "stop", SubagentStop: "subagent_stop" };
  for (const [eventName, groups] of Object.entries(parsed?.hooks ?? {})) {
    const eventLabel = labels[eventName];
    if (!eventLabel || !Array.isArray(groups)) continue;
    for (const [groupIndex, group] of groups.entries()) {
      for (const [handlerIndex, handler] of (group.hooks ?? []).entries()) {
        const key = `cairn@cairn:hooks/hooks.json:${eventLabel}:${groupIndex}:${handlerIndex}`;
        states.push({ key, trustedHash: hookHash(eventLabel, group.matcher, handler) });
      }
    }
  }
  return states;
}

export function hookHash(eventName, matcher, handler) {
  const normalized = { type: "command", command: handler.command, timeout: Math.max(Number(handler.timeout ?? 600), 1), async: false };
  if (typeof handler.statusMessage === "string") normalized.statusMessage = handler.statusMessage;
  const identity = { event_name: eventName, hooks: [normalized] };
  if (typeof matcher === "string") identity.matcher = matcher;
  return `sha256:${createHash("sha256").update(JSON.stringify(canonical(identity))).digest("hex")}`;
}

export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

async function backupConfig() {
  if (!(await exists(configPath))) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await cp(configPath, `${configPath}.cairn-backup-${stamp}`);
}

async function readJson(path) {
  if (!(await exists(path))) return null;
  return JSON.parse(await readFile(path, "utf8"));
}

async function readText(path) {
  if (!(await exists(path))) return "";
  return readFile(path, "utf8");
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function append(config, block) {
  return `${config.trimEnd()}${config.trimEnd().length === 0 ? "" : "\n\n"}${block.trimEnd()}\n`;
}

export function pathHasSegment(path, segment) {
  return path.split(/[\\/]+/).includes(segment);
}

export function samePath(left, right) {
  try {
    return realpathSync(left) === realpathSync(right);
  } catch {
    return resolve(left) === resolve(right);
  }
}

export function commandNames() {
  return ["install", "upgrade", "doctor", "uninstall", "memory", "plan", "work", "review", "toolcheck"];
}

export function skillNames() {
  return ["cairn-memory", "cairn-plan", "cairn-work", "cairn-review"];
}

export function renderInstalledMirror(content, {
  runtimeRoot = installedPluginRoot,
  locatorPath = installedRuntimeLocatorPath,
  platform = process.platform,
} = {}) {
  const quotedCli = quoteShellArg(join(runtimeRoot, "scripts", "cairn.mjs"), platform);
  let rendered = content
    .replaceAll("{{CAIRN_RUNTIME_LOCATOR_JSON}}", JSON.stringify(locatorPath))
    .replace(/\bnode\s+scripts\/cairn\.mjs\b/g, `node ${quotedCli}`)
    .replace(/\bnode\s+scripts\/([A-Za-z0-9._/-]+)/g, (_, path) => `node ${quoteShellArg(join(runtimeRoot, "scripts", path), platform)}`);

  rendered = rendered.replace(
    /(^|[\s`("'=])(commands|agents|templates|docs\/model-guidance)\/([A-Za-z0-9._<>/-]+)/gm,
    (_, prefix, directory, suffix) => `${prefix}${join(runtimeRoot, directory, suffix)}`,
  );
  return rendered;
}

export function quoteShellArg(value, platform = process.platform) {
  if (platform === "win32") return `"${value.replaceAll('"', '""')}"`;
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function antigravityRuntimeLocatorPath(root) {
  return join(root, "cairn", "runtime.json");
}

function installedSkillLocatorPath(skillName) {
  return join(installedPluginRoot, "skills", skillName, "references", "cairn-runtime.json");
}

function antigravitySkillLocatorPath(root, skillName) {
  return join(root, "skills", skillName, "references", "cairn-runtime.json");
}

async function writeRuntimeLocator(path) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(createRuntimeLocator(installedPluginRoot), null, 2)}\n`);
}

async function writeInstalledSkillLocators() {
  await Promise.all(skillNames().map((name) => writeRuntimeLocator(installedSkillLocatorPath(name))));
}

async function validRuntimeLocator(path) {
  try {
    const locator = await readJson(path);
    const expected = createRuntimeLocator(installedPluginRoot);
    if (locator?.schemaVersion !== RUNTIME_LOCATOR_SCHEMA_VERSION) return false;
    if (resolve(locator.pluginRoot ?? ".") !== resolve(installedPluginRoot)) return false;
    for (const [name, expectedPath] of Object.entries(expected.entrypoints)) {
      if (locator.entrypoints?.[name] !== expectedPath) return false;
    }
    for (const [name, expectedPath] of Object.entries(expected.resources)) {
      if (locator.resources?.[name] !== expectedPath) return false;
    }
    const requiredPaths = runtimeRequiredPaths(locator);
    if (requiredPaths.length === 0) return false;
    return (await Promise.all(requiredPaths.map(exists))).every(Boolean);
  } catch {
    return false;
  }
}

async function renderMirrorFile(source, destination, locatorPath, { includeLocatorNotice = false } = {}) {
  const content = await readFile(source, "utf8");
  const notice = includeLocatorNotice
    ? `\n\n## Installed Cairn runtime\n\nRead the structured runtime locator at \`${JSON.stringify(locatorPath)}\`. Resolve Cairn scripts and static resources from its absolute paths, never from the target project.\n`
    : "";
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, `${renderInstalledMirror(content, { runtimeRoot: installedPluginRoot, locatorPath }).trimEnd()}${notice}`);
}

function help() {
  console.log(t("usage"));
}

function t(key) {
  const messages = {
    en: {
      installComplete: "Cairn install complete",
      upgradeComplete: "Cairn upgrade complete",
      uninstallComplete: "Cairn uninstall complete",
      usage: "Usage: cairn install|upgrade|doctor|uninstall|toolcheck",
    },
    ko: {
      installComplete: "Cairn 설치 완료",
      upgradeComplete: "Cairn 업그레이드 완료",
      uninstallComplete: "Cairn 언인스톨 완료",
      usage: "사용법: cairn install|upgrade|doctor|uninstall|toolcheck",
    },
    ja: {
      installComplete: "Cairn のインストールが完了しました",
      upgradeComplete: "Cairn のアップグレードが完了しました",
      uninstallComplete: "Cairn のアンインストールが完了しました",
      usage: "使い方: cairn install|upgrade|doctor|uninstall|toolcheck",
    },
    zh: {
      installComplete: "Cairn 安装完成",
      upgradeComplete: "Cairn 升级完成",
      uninstallComplete: "Cairn 卸载完成",
      usage: "用法: cairn install|upgrade|doctor|uninstall|toolcheck",
    },
    es: {
      installComplete: "Instalación de Cairn completada",
      upgradeComplete: "Actualización de Cairn completada",
      uninstallComplete: "Desinstalación de Cairn completada",
      usage: "Uso: cairn install|upgrade|doctor|uninstall|toolcheck",
    },
    fr: {
      installComplete: "Installation de Cairn terminée",
      upgradeComplete: "Mise à niveau de Cairn terminée",
      uninstallComplete: "Désinstallation de Cairn terminée",
      usage: "Utilisation: cairn install|upgrade|doctor|uninstall|toolcheck",
    },
    de: {
      installComplete: "Cairn-Installation abgeschlossen",
      upgradeComplete: "Cairn-Upgrade abgeschlossen",
      uninstallComplete: "Cairn-Deinstallation abgeschlossen",
      usage: "Verwendung: cairn install|upgrade|doctor|uninstall|toolcheck",
    },
    pt: {
      installComplete: "Instalação do Cairn concluída",
      upgradeComplete: "Atualização do Cairn concluída",
      uninstallComplete: "Desinstalação do Cairn concluída",
      usage: "Uso: cairn install|upgrade|doctor|uninstall|toolcheck",
    },
  };
  return messages[localeFamily()]?.[key] ?? messages.en[key];
}

export function localeFamily() {
  const locale = [process.env.LC_ALL, process.env.LC_MESSAGES, process.env.LANG]
    .find((value) => typeof value === "string" && value.length > 0) ?? Intl.DateTimeFormat().resolvedOptions().locale;
  const normalized = locale.toLowerCase();
  for (const family of ["ko", "ja", "zh", "es", "fr", "de", "pt"]) {
    if (normalized.startsWith(family)) return family;
  }
  return "en";
}

function isCliEntry() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  }
}
