import { copyFile, cp, lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { readSharedConfigSnapshot, trustedHookStates } from "./cairn-lifecycle-config.mjs";
import {
  antigravityRuntimeLocatorPath, antigravitySkillLocatorPath, renderMirrorFile, writeLocator,
} from "./cairn-lifecycle-mirror.mjs";

export function createStaging(context) {
  const {
    agentNames, antigravityCliHome, antigravityHome, claudeHome,
    claudeRuntimeLocatorPath, commandNames, configPath, installedPluginRoot,
    legacyAntigravityHome, marketplaceJsonPath, marketplaceName, pluginName,
    pluginRoot, skillNames, updateConfig, versionedPluginRoot, assertRegularTree,
  } = context;
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
    await renderMirrorFile(join(runtimeStage, ".claude", "commands", `cairn-${name}.md`), staged, { locatorPath: claudeRuntimeLocatorPath, runtimeRoot: versionedPluginRoot });
    add(`claude-command-${name}`, "claude", join(claudeHome, "commands", `cairn-${name}.md`), staged, "file");
  }
  for (const name of agentNames()) {
    const staged = join(stageRoot, "claude-agents", `cairn-${name}.md`);
    await renderMirrorFile(join(runtimeStage, ".claude", "agents", `${name}.md`), staged, { locatorPath: claudeRuntimeLocatorPath, runtimeRoot: versionedPluginRoot });
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
      await renderMirrorFile(join(runtimeStage, "skills", name, "SKILL.md"), staged, { locatorPath, runtimeRoot: versionedPluginRoot, includeLocatorNotice: true });
      targets.push({ id: `${label}-skill-${name}`, phase: "antigravity", path: join(destinationRoot, "skills", `${name}.md`), staged, type: "file" });
    } else {
      const staged = join(stageRoot, `${label}-skills`, name);
      await cp(join(runtimeStage, "skills", name), staged, { recursive: true });
      await renderMirrorFile(join(runtimeStage, "skills", name, "SKILL.md"), join(staged, "SKILL.md"), {
        locatorPath: antigravitySkillLocatorPath(destinationRoot, name),
        runtimeRoot: versionedPluginRoot,
        includeLocatorNotice: true,
      });
      await writeLocator(join(staged, "references", "cairn-runtime.json"), versionedPluginRoot);
      targets.push({ id: `${label}-skill-${name}`, phase: "antigravity", path: join(destinationRoot, "skills", name), staged, type: "tree" });
    }
  }
  for (const name of commandNames()) {
    const staged = join(stageRoot, `${label}-workflows`, `cairn-${name}.md`);
    await renderMirrorFile(join(runtimeStage, ".agents", "workflows", `cairn-${name}.md`), staged, { locatorPath, runtimeRoot: versionedPluginRoot });
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
  if (!shouldCopyPluginPath(source, pluginRoot)) return;
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


  return { legacyMigrationTargets, stageInstall };

  async function exists(path) {
    try { await lstat(path); return true; }
    catch (error) { if (error?.code === "ENOENT") return false; throw error; }
  }
}

export function pathHasSegment(path, segment) { return path.split(/[\\/]+/).includes(segment); }

export function shouldCopyPluginPath(source, pluginRoot) {
  const name = source.split(/[\\/]+/).at(-1);
  if ([".git", "node_modules", ".cairn"].includes(name)) return false;
  if (sep === "/" && source.includes("\\")) return true;
  const relativePath = relative(pluginRoot, source);
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
