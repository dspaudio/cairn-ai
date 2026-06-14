#!/usr/bin/env node
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const codexHome = resolve(process.env.CODEX_HOME ?? join(process.env.HOME ?? ".", ".codex"));
const claudeHome = resolve(process.env.CLAUDE_HOME ?? join(process.env.HOME ?? ".", ".claude"));
const configPath = process.env.CODEX_CONFIG_PATH ?? join(codexHome, "config.toml");
const marketplaceName = "cairn";
const pluginName = "cairn";
const marketplaceRoot = join(codexHome, "plugins", "cache", marketplaceName);
const installedPluginRoot = join(marketplaceRoot, "plugins", pluginName);
const marketplaceJsonPath = join(marketplaceRoot, ".agents", "plugins", "marketplace.json");

const command = process.argv[2] ?? "help";
if (command === "install" || command === "upgrade") await install(command);
else if (command === "doctor") await doctor();
else if (command === "uninstall") await uninstall();
else help();

async function install(mode) {
  await copyPlugin();
  await writeMarketplace();
  await installClaudeFiles();
  const hookStates = await trustedHookStates();
  const config = await readText(configPath);
  await backupConfig();
  await writeFile(configPath, `${updateConfig(config, hookStates).trimEnd()}\n`);
  console.log(`Cairn ${mode === "upgrade" ? "업그레이드" : "설치"} 완료`);
  console.log(`Codex plugin: ${installedPluginRoot}`);
  console.log(`Marketplace: ${marketplaceJsonPath}`);
  console.log(`Hook trust states: ${hookStates.length}`);
}

async function doctor() {
  const checks = [];
  checks.push(["source", await exists(join(pluginRoot, ".codex-plugin", "plugin.json"))]);
  checks.push(["installed plugin", await exists(join(installedPluginRoot, ".codex-plugin", "plugin.json"))]);
  checks.push(["marketplace", await exists(marketplaceJsonPath)]);
  const installedManifest = await readJson(join(installedPluginRoot, ".codex-plugin", "plugin.json"));
  checks.push(["installed hooks manifest field", installedManifest?.hooks === "./hooks/hooks.json"]);
  checks.push(["hooks file", await exists(join(installedPluginRoot, "hooks", "hooks.json"))]);
  const config = await readText(configPath);
  checks.push(["config features.plugins", hasSetting(config, "features", "plugins", "true")]);
  checks.push(["config features.plugin_hooks", hasSetting(config, "features", "plugin_hooks", "true")]);
  checks.push(["config marketplace", config.includes("[marketplaces.cairn]")]);
  checks.push(["config plugin enabled", config.includes('[plugins."cairn@cairn"]') && hasSetting(config, 'plugins."cairn@cairn"', "enabled", "true")]);
  const expectedStates = await trustedHookStates();
  const missingStates = expectedStates.filter((state) => !config.includes(`[hooks.state.${JSON.stringify(state.key)}]`));
  checks.push(["trusted hook states", expectedStates.length > 0 && missingStates.length === 0]);
  checks.push(["Claude commands", await exists(join(claudeHome, "commands", "cairn-plan.md"))]);
  checks.push(["Claude agents", await exists(join(claudeHome, "agents", "cairn-architect.md"))]);
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
  for (const name of ["architect", "planner", "builder", "reviewer", "worker"]) {
    await rm(join(claudeHome, "agents", `cairn-${name}.md`), { force: true });
  }
  console.log("Cairn 언인스톨 완료");
}

async function copyPlugin() {
  await rm(installedPluginRoot, { recursive: true, force: true });
  await mkdir(dirname(installedPluginRoot), { recursive: true });
  await cp(pluginRoot, installedPluginRoot, {
    recursive: true,
    filter: (source) => !source.includes(`${pluginRoot}/.git`) && !source.includes(`${pluginRoot}/node_modules`),
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
  for (const name of commandNames()) {
    await cp(join(pluginRoot, ".claude", "commands", `cairn-${name}.md`), join(claudeHome, "commands", `cairn-${name}.md`));
  }
  for (const name of ["architect", "planner", "builder", "reviewer", "worker"]) {
    await cp(join(pluginRoot, ".claude", "agents", `${name}.md`), join(claudeHome, "agents", `cairn-${name}.md`));
  }
}

function updateConfig(config, hookStates) {
  let next = removeCairnConfig(config);
  next = ensureSetting(next, "features", "plugins", "true");
  next = ensureSetting(next, "features", "plugin_hooks", "true");
  next = append(next, `[marketplaces.cairn]\nlast_updated = ${JSON.stringify(new Date().toISOString().replace(/\.\d{3}Z$/, "Z"))}\nsource_type = "local"\nsource = ${JSON.stringify(marketplaceRoot)}\n`);
  next = append(next, '[plugins."cairn@cairn"]\nenabled = true\n');
  for (const state of hookStates) next = append(next, `[hooks.state.${JSON.stringify(state.key)}]\ntrusted_hash = ${JSON.stringify(state.trustedHash)}\n`);
  return next;
}

function removeCairnConfig(config) {
  return splitSections(config).filter((section) => {
    if (section.header === null) return true;
    if (section.header === "marketplaces.cairn") return false;
    if (section.header === 'plugins."cairn@cairn"') return false;
    return !(section.header.startsWith("hooks.state.") && section.header.includes("cairn@cairn:"));
  }).map((section) => section.text).join("").replace(/\n{3,}/g, "\n\n");
}

function ensureSetting(config, sectionName, key, value) {
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

function hasSetting(config, sectionName, key, value) {
  const section = splitSections(config).find((candidate) => candidate.header === sectionName);
  return section?.text.split("\n").some((line) => line.trim() === `${key} = ${value}`) ?? false;
}

function splitSections(config) {
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

function hookHash(eventName, matcher, handler) {
  const normalized = { type: "command", command: handler.command, timeout: Math.max(Number(handler.timeout ?? 600), 1), async: false };
  if (typeof handler.statusMessage === "string") normalized.statusMessage = handler.statusMessage;
  const identity = { event_name: eventName, hooks: [normalized] };
  if (typeof matcher === "string") identity.matcher = matcher;
  return `sha256:${createHash("sha256").update(JSON.stringify(canonical(identity))).digest("hex")}`;
}

function canonical(value) {
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

function commandNames() {
  return ["install", "upgrade", "doctor", "uninstall", "memory", "plan", "work", "review"];
}

function help() {
  console.log("사용법: cairn install|upgrade|doctor|uninstall");
}
