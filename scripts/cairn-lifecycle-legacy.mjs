import { createHash } from "node:crypto";
import { cp, lstat, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { cairnConfigProjection, readSharedConfigSnapshot } from "./cairn-lifecycle-config.mjs";
import {
  antigravityRuntimeLocatorPath, antigravitySkillLocatorPath, renderMirrorFile,
  validLegacyLocator, writeLocator,
} from "./cairn-lifecycle-mirror.mjs";

export function createLegacyIntegrity(context) {
  const {
    antigravityCliHome, antigravityHome, claudeRuntimeLocatorPath,
    installedPluginRoot, legacyAntigravityHome, marketplaceName, pluginName,
    pluginRoot, regularFiles, skillNames, targetDigest,
  } = context;
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

async function verifyLegacy022Root(root) {
  const integrity = JSON.parse(await readFile(join(pluginRoot, "scripts", "release-integrity-0.2.2.json"), "utf8"));
  const allowedGenerated = new Set([".cairn-runtime.json", ...skillNames().map((name) => `skills/${name}/references/cairn-runtime.json`)]);
  const actual = await regularFiles(root);
  const expected = new Set([...Object.keys(integrity.files), ...allowedGenerated]);
  if (actual.length !== expected.size || actual.some((file) => !expected.has(file))) throw new Error("Legacy Cairn 0.2.2 root file set does not match the pinned SHA-256 file-hash allowlist.");
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

async function verifyLegacyMirror(target) {
  // Legacy mirrors are accepted only when byte-identical to a deterministic render
  // from the verified release tree. Unknown or user-modified mirrors are preserved.
  const temp = await mkdtemp(join(tmpdir(), "cairn-legacy-mirror-"));
  try {
    const expected = join(temp, "expected");
    if (target.id.startsWith("claude-command-")) {
      const name = target.id.slice("claude-command-".length);
      await renderMirrorFile(join(installedPluginRoot, ".claude", "commands", `cairn-${name}.md`), expected, { locatorPath: claudeRuntimeLocatorPath, runtimeRoot: installedPluginRoot });
    } else if (target.id.startsWith("claude-agent-")) {
      const name = target.id.slice("claude-agent-".length);
      await renderMirrorFile(join(installedPluginRoot, ".claude", "agents", `${name}.md`), expected, { locatorPath: claudeRuntimeLocatorPath, runtimeRoot: installedPluginRoot });
    } else if (target.id.startsWith("ide-skill-")) {
      const name = target.id.slice("ide-skill-".length);
      await cp(join(installedPluginRoot, "skills", name), expected, { recursive: true });
      const locator = antigravitySkillLocatorPath(antigravityHome, name);
      await renderMirrorFile(join(installedPluginRoot, "skills", name, "SKILL.md"), join(expected, "SKILL.md"), { locatorPath: locator, runtimeRoot: installedPluginRoot, includeLocatorNotice: true });
      await writeLocator(join(expected, "references", "cairn-runtime.json"), installedPluginRoot);
    } else if (target.id.startsWith("cli-skill-")) {
      const name = target.id.slice("cli-skill-".length);
      await renderMirrorFile(join(installedPluginRoot, "skills", name, "SKILL.md"), expected, {
        locatorPath: antigravityRuntimeLocatorPath(antigravityCliHome),
        runtimeRoot: installedPluginRoot,
        includeLocatorNotice: true,
      });
    } else if (target.id.startsWith("legacy-ide-skill-") || target.id.startsWith("legacy-cli-skill-")) {
      const isIde = target.id.startsWith("legacy-ide-skill-");
      const prefix = isIde ? "legacy-ide-skill-" : "legacy-cli-skill-";
      const name = target.id.slice(prefix.length);
      const root = isIde ? legacyAntigravityHome : antigravityCliHome;
      const locator = antigravitySkillLocatorPath(root, name);
      await cp(join(installedPluginRoot, "skills", name), expected, { recursive: true });
      await renderMirrorFile(join(installedPluginRoot, "skills", name, "SKILL.md"), join(expected, "SKILL.md"), { locatorPath: locator, runtimeRoot: installedPluginRoot, includeLocatorNotice: true });
      await writeLocator(join(expected, "references", "cairn-runtime.json"), installedPluginRoot);
    } else if (target.id.startsWith("legacy-ide-workflow-")) {
      const name = target.id.slice("legacy-ide-workflow-".length);
      await renderMirrorFile(join(installedPluginRoot, ".agents", "workflows", `cairn-${name}.md`), expected, {
        locatorPath: antigravityRuntimeLocatorPath(legacyAntigravityHome),
        runtimeRoot: installedPluginRoot,
      });
    } else if (target.id.startsWith("ide-workflow-") || target.id.startsWith("cli-workflow-")) {
      const isIde = target.id.startsWith("ide-workflow-");
      const prefix = isIde ? "ide-workflow-" : "cli-workflow-";
      const name = target.id.slice(prefix.length);
      const root = isIde ? antigravityHome : antigravityCliHome;
      await renderMirrorFile(join(installedPluginRoot, ".agents", "workflows", `cairn-${name}.md`), expected, { locatorPath: antigravityRuntimeLocatorPath(root), runtimeRoot: installedPluginRoot });
    } else {
      throw new Error(`Legacy mirror target is not recognized: ${target.id}`);
    }
    if (await targetDigest(expected, "file") !== await targetDigest(target.path, target.type)) throw new Error(`Legacy mirror was modified: ${target.path}`);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}


  return { adoptLegacy, verifyLegacy022Root };

  function sha(value) {
    return `sha256:${createHash("sha256").update(value).digest("hex")}`;
  }

  async function readJson(path) {
    if (!(await exists(path))) return null;
    return JSON.parse(await readFile(path, "utf8"));
  }

  async function exists(path) {
    try { await lstat(path); return true; }
    catch (error) { if (error?.code === "ENOENT") return false; throw error; }
  }
}
