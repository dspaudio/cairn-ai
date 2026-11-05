import { spawnSync } from "node:child_process";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { quoteShellArg, renderMirrorFile, writeLocator } from "./cairn-lifecycle-mirror.mjs";

// Claude Code loads a plugin's default hooks/hooks.json and merges any manifest hooks, and it only expands
// ${CLAUDE_PLUGIN_ROOT}. The shared package hooks use Codex's ${PLUGIN_ROOT}, so Claude gets a separate thin
// plugin whose hooks call the installed versioned runtime by absolute path. Commands and agents stay in the
// existing ~/.claude mirrors so they are not listed twice.
export async function stageClaudePlugin({
  stageRoot, runtimeStage, destinationRoot, versionedPluginRoot, marketplaceName, pluginName,
  releaseVersion, skillNames, platform = process.platform,
}) {
  const staged = join(stageRoot, "claude-plugin");
  const pluginDir = join(staged, pluginName);
  const packageJson = JSON.parse(await readFile(join(runtimeStage, "package.json"), "utf8"));
  const description = packageJson.description ?? "Cairn agent harness";

  await writeJson(join(staged, ".claude-plugin", "marketplace.json"), {
    name: marketplaceName,
    description: "Local Cairn marketplace managed by `cairn install`",
    owner: { name: packageJson.author?.name ?? "Cairn" },
    plugins: [{ name: pluginName, source: `./${pluginName}`, description, version: releaseVersion }],
  });
  await writeJson(join(pluginDir, ".claude-plugin", "plugin.json"), {
    name: pluginName,
    version: releaseVersion,
    description,
    author: { name: packageJson.author?.name ?? "Cairn" },
    ...(packageJson.homepage ? { homepage: packageJson.homepage } : {}),
    ...(packageJson.license ? { license: packageJson.license } : {}),
  });
  await writeJson(join(pluginDir, "hooks", "hooks.json"), await claudeHooks(runtimeStage, versionedPluginRoot, platform));

  for (const name of skillNames) {
    const skillStage = join(pluginDir, "skills", name);
    await cp(join(runtimeStage, "skills", name), skillStage, { recursive: true });
    const locatorPath = join(destinationRoot, pluginName, "skills", name, "references", "cairn-runtime.json");
    await renderMirrorFile(join(runtimeStage, "skills", name, "SKILL.md"), join(skillStage, "SKILL.md"), {
      locatorPath, runtimeRoot: versionedPluginRoot, includeLocatorNotice: true,
    });
    await writeLocator(join(skillStage, "references", "cairn-runtime.json"), versionedPluginRoot);
  }
  return staged;
}

async function claudeHooks(runtimeStage, versionedPluginRoot, platform) {
  const source = JSON.parse(await readFile(join(runtimeStage, "hooks", "hooks.json"), "utf8"));
  const stateScript = quoteShellArg(join(versionedPluginRoot, "scripts", "cairn-state.mjs"), platform);
  const hooks = {};
  for (const [eventName, groups] of Object.entries(source.hooks ?? {})) {
    hooks[eventName] = groups.map((group) => ({
      ...group,
      hooks: (group.hooks ?? []).map((handler) => {
        const event = String(handler.command ?? "").match(/cairn-state\.mjs"?\s+([a-z-]+)\s*$/)?.[1];
        if (!event) throw new Error(`Unsupported Cairn hook command for Claude Code: ${handler.command}`);
        return { ...handler, command: `node ${stateScript} ${event}` };
      }),
    }));
  }
  return { hooks };
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

// Registration goes through the documented `claude plugin` CLI. CLAUDE_CONFIG_DIR is only set when the caller
// overrode the Claude home, because setting it for the default home would move Claude's global config file.
export function createClaudeRegistration({ claudeHome, claudeHomeOverridden, marketplaceRoot, marketplaceName, pluginName }) {
  const cli = process.env.CAIRN_CLAUDE_CLI ?? "claude";
  const pluginId = `${pluginName}@${marketplaceName}`;
  const env = claudeHomeOverridden ? { ...process.env, CLAUDE_CONFIG_DIR: claudeHome } : process.env;

  // A .mjs/.js override runs through the current Node binary so tests can supply a portable stand-in CLI.
  function run(args) {
    if (/\.m?js$/.test(cli)) return spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", env, timeout: 120_000 });
    return spawnSync(cli, args, { encoding: "utf8", env, timeout: 120_000, shell: process.platform === "win32" });
  }

  function available() {
    if (cli === "none") return false;
    const result = run(["--version"]);
    return !result.error && result.status === 0;
  }

  function json(args) {
    const result = run([...args, "--json"]);
    if (result.error || result.status !== 0) {
      throw new Error(`claude ${args.join(" ")} failed: ${(result.stderr || result.stdout || result.error?.message || "").trim().split("\n").at(-1)}`);
    }
    const text = result.stdout.trim();
    try {
      return JSON.parse(text);
    } catch {
      return JSON.parse(text.split("\n").filter(Boolean).at(-1));
    }
  }

  const ownsMarketplace = (entry) => entry?.name === marketplaceName
    && typeof entry.path === "string" && resolve(entry.path) === resolve(marketplaceRoot);
  const ownedPlugins = (list) => (Array.isArray(list) ? list : [])
    .filter((entry) => entry?.id === pluginId && entry.scope === "user");

  function status({ checked = false } = {}) {
    if (!checked && !available()) return { available: false, marketplace: false, installed: false, enabled: false };
    const marketplace = json(["plugin", "marketplace", "list"]).find((entry) => entry?.name === marketplaceName) ?? null;
    const plugin = ownedPlugins(json(["plugin", "list"]))[0] ?? null;
    return {
      available: true,
      marketplace: ownsMarketplace(marketplace),
      foreignMarketplace: Boolean(marketplace) && !ownsMarketplace(marketplace),
      installed: Boolean(plugin),
      enabled: Boolean(plugin?.enabled),
    };
  }

  function register() {
    if (!available()) return { registered: false, reason: "claude CLI not found" };
    const current = status({ checked: true });
    if (current.foreignMarketplace) {
      return { registered: false, reason: `a different Claude Code marketplace named "${marketplaceName}" already exists` };
    }
    if (!current.marketplace) json(["plugin", "marketplace", "add", marketplaceRoot, "--scope", "user"]);
    if (!current.installed) json(["plugin", "install", pluginId, "--scope", "user"]);
    else if (!current.enabled) json(["plugin", "enable", pluginId, "--scope", "user"]);
    return { registered: true };
  }

  function unregister() {
    if (!available()) return { unregistered: false, reason: "claude CLI not found" };
    const current = status({ checked: true });
    // Only remove a registration that points at Cairn's own marketplace directory.
    if (!current.marketplace) return { unregistered: false, reason: "no Cairn-owned Claude Code marketplace is registered" };
    if (current.installed) json(["plugin", "uninstall", pluginId, "--scope", "user"]);
    json(["plugin", "marketplace", "remove", marketplaceName]);
    return { unregistered: true };
  }

  return { available, register, status, unregister, pluginId };
}
