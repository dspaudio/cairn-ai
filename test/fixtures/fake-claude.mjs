// Minimal stand-in for the `claude plugin` CLI used by lifecycle tests. State lives in CLAUDE_CONFIG_DIR so each
// test home is isolated, and every call is appended to a log so tests can assert the exact command sequence.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

// node --test also loads files under test/; without CLI arguments this module is a no-op there.
if (process.argv.length <= 2) process.exit(0);
const home = process.env.CLAUDE_CONFIG_DIR;
if (!home) {
  console.error("fake claude requires CLAUDE_CONFIG_DIR");
  process.exit(2);
}
mkdirSync(home, { recursive: true });
const statePath = join(home, "fake-claude-state.json");
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : { marketplaces: [], plugins: [] };
const args = process.argv.slice(2).filter((arg) => arg !== "--json");
appendFileSync(join(home, "fake-claude.log"), `${args.join(" ")}\n`);
const save = () => writeFileSync(statePath, JSON.stringify(state, null, 2));
const ok = (message) => console.log(JSON.stringify({ command: args.slice(0, 3).join(" "), outcome: "ok", message }));
const fail = (message) => {
  console.log(JSON.stringify({ outcome: "failed", message }));
  process.exit(1);
};
const optionValue = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

if (args[0] === "--version") {
  console.log("0.0.0 (fake Claude Code)");
} else if (args[0] === "plugin" && args[1] === "marketplace" && args[2] === "list") {
  console.log(JSON.stringify(state.marketplaces));
} else if (args[0] === "plugin" && args[1] === "marketplace" && args[2] === "add") {
  const path = resolve(args[3]);
  const manifest = join(path, ".claude-plugin", "marketplace.json");
  if (!existsSync(manifest)) fail(`no marketplace at ${path}`);
  const { name } = JSON.parse(readFileSync(manifest, "utf8"));
  if (state.marketplaces.some((entry) => entry.name === name)) fail(`marketplace ${name} already exists`);
  state.marketplaces.push({ name, source: "directory", path, installLocation: path });
  save();
  ok(`added ${name}`);
} else if (args[0] === "plugin" && args[1] === "marketplace" && (args[2] === "remove" || args[2] === "rm")) {
  const name = args[3];
  state.plugins = state.plugins.filter((entry) => !entry.id.endsWith(`@${name}`));
  state.marketplaces = state.marketplaces.filter((entry) => entry.name !== name);
  save();
  ok(`removed ${name}`);
} else if (args[0] === "plugin" && args[1] === "list") {
  console.log(JSON.stringify(state.plugins));
} else if (args[0] === "plugin" && (args[1] === "install" || args[1] === "i")) {
  const id = args[2];
  const [pluginName, marketplaceName] = id.split("@");
  const marketplace = state.marketplaces.find((entry) => entry.name === marketplaceName);
  if (!marketplace) fail(`unknown marketplace ${marketplaceName}`);
  const catalog = JSON.parse(readFileSync(join(marketplace.path, ".claude-plugin", "marketplace.json"), "utf8"));
  const entry = catalog.plugins.find((plugin) => plugin.name === pluginName);
  if (!entry) fail(`unknown plugin ${id}`);
  const installPath = resolve(marketplace.path, entry.source);
  const manifest = JSON.parse(readFileSync(join(installPath, ".claude-plugin", "plugin.json"), "utf8"));
  state.plugins = state.plugins.filter((plugin) => plugin.id !== id);
  state.plugins.push({ id, version: manifest.version, scope: optionValue("--scope") ?? "user", enabled: true, installPath });
  save();
  ok(`installed ${id}`);
} else if (args[0] === "plugin" && (args[1] === "uninstall" || args[1] === "remove" || args[1] === "rm")) {
  state.plugins = state.plugins.filter((plugin) => plugin.id !== args[2]);
  save();
  ok(`uninstalled ${args[2]}`);
} else if (args[0] === "plugin" && args[1] === "enable") {
  for (const plugin of state.plugins) if (plugin.id === args[2]) plugin.enabled = true;
  save();
  ok(`enabled ${args[2]}`);
} else {
  fail(`unsupported fake claude command: ${args.join(" ")}`);
}
