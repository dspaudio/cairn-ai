import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const RUNTIME_LOCATOR_SCHEMA_VERSION = 1;

export function resolvePluginRoot(moduleUrl = import.meta.url) {
  return resolve(dirname(fileURLToPath(moduleUrl)), "..");
}

export function parseRootArgs(args = [], options = {}) {
  const remaining = [];
  let explicitRoot = null;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--root") {
      if (explicitRoot !== null) throw new Error("--root may only be provided once");
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--root requires a path");
      explicitRoot = value;
      index += 1;
      continue;
    }
    if (argument.startsWith("--root=")) {
      if (explicitRoot !== null) throw new Error("--root may only be provided once");
      const value = argument.slice("--root=".length);
      if (!value) throw new Error("--root requires a path");
      explicitRoot = value;
      continue;
    }
    remaining.push(argument);
  }

  return {
    args: remaining,
    explicitRoot,
    repoRoot: resolveRepoRoot({ ...options, explicitRoot }),
  };
}

export function resolveRepoRoot({
  explicitRoot = null,
  hookCwd = null,
  cwd = process.cwd(),
  env = process.env,
} = {}) {
  if (explicitRoot) return resolve(cwd, explicitRoot);
  if (hookCwd) {
    const hookStart = resolve(hookCwd);
    return discoverRepositoryRoot(hookStart) ?? hookStart;
  }
  if (env.HARNESS_REPO_ROOT) return resolve(env.HARNESS_REPO_ROOT);
  const start = resolve(cwd);
  return discoverRepositoryRoot(start) ?? start;
}

export function discoverRepositoryRoot(start = process.cwd()) {
  let current = resolve(start);
  while (true) {
    if (existsSync(join(current, ".git"))) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export function createRuntimeLocator(pluginRoot) {
  const root = resolve(pluginRoot);
  return {
    schemaVersion: RUNTIME_LOCATOR_SCHEMA_VERSION,
    plugin: "cairn",
    pluginRoot: root,
    entrypoints: {
      cli: join(root, "scripts", "cairn.mjs"),
      lifecycle: join(root, "scripts", "cairn-lifecycle.mjs"),
      state: join(root, "scripts", "cairn-state.mjs"),
      toolcheck: join(root, "scripts", "cairn-toolcheck.mjs"),
    },
    resources: {
      agents: join(root, "agents"),
      commands: join(root, "commands"),
      modelGuidance: join(root, "docs", "model-guidance"),
      skills: join(root, "skills"),
      templates: join(root, "templates"),
    },
  };
}

export function runtimeRequiredPaths(locator) {
  if (!locator || locator.schemaVersion !== RUNTIME_LOCATOR_SCHEMA_VERSION || locator.plugin !== "cairn") return [];
  return [
    locator.entrypoints?.cli,
    locator.entrypoints?.state,
    locator.entrypoints?.toolcheck,
    locator.resources?.commands,
    locator.resources?.agents,
    locator.resources?.skills,
    join(locator.resources?.templates ?? "", "work-plan.md"),
    join(locator.resources?.modelGuidance ?? "", "README.md"),
    join(locator.resources?.modelGuidance ?? "", "codex.md"),
  ].filter(Boolean);
}
