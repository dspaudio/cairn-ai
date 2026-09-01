import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { basename, join, relative, sep } from "node:path";
import { cairnConfigProjection, readSharedConfigSnapshot } from "./cairn-lifecycle-config.mjs";
import { createLegacyIntegrity } from "./cairn-lifecycle-legacy.mjs";
import { antigravityRuntimeLocatorPath } from "./cairn-lifecycle-mirror.mjs";

export function createIntegrity(context) {
  const {
    antigravityCliHome, antigravityHome, claudeHome, claudeRuntimeLocatorPath,
    commandNames, configPath, installedPluginRoot, legacyAntigravityHome,
    marketplaceJsonPath, marketplaceRoot, ownershipPath, phases, pluginName,
    releaseVersion, skillNames,
  } = context;
async function assertTargetsReplaceable(targets, ownership) {
  const records = new Map((ownership?.targets ?? []).map((record) => [record.id, record]));
  for (const target of targets) {
    if (!(await exists(target.path))) {
      target.preflightDigest = "missing";
      continue;
    }
    const current = await targetDigest(target.path, target.type);
    target.preflightDigest = current;
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

async function targetDigest(path, type) {
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

  async function ownershipDigestsValid(ownership) {
    try {
      validateOwnershipShape(ownership, { required: true });
      for (const record of ownership.targets) if (await targetDigest(record.path, record.type) !== record.installedDigest) return false;
      return true;
    } catch {
      return false;
    }
  }

  const legacy = createLegacyIntegrity({ ...context, regularFiles, targetDigest });
  return {
    ...legacy, anyManagedArtifactExists, assertOwnershipDigests, assertRegularTree,
    assertTargetsReplaceable, expectedManagedTarget, ownershipDigestsValid, readOwnership,
    targetDigest, targetRecord, validateOwnershipShape, versionedRuntimeRoot,
  };

  function sameKeys(value, expected) {
    return Object.keys(value).sort().join("\0") === [...expected].sort().join("\0");
  }

  async function exists(path) {
    try { await lstat(path); return true; }
    catch (error) { if (error?.code === "ENOENT") return false; throw error; }
  }
}
