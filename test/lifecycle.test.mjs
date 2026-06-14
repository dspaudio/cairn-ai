import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { message } from "../scripts/cairn.mjs";
import {
  hookHash,
  pathHasSegment,
  removeCairnConfig,
  splitSections,
  updateConfig,
} from "../scripts/cairn-lifecycle.mjs";
import { runState } from "../scripts/cairn-state.mjs";

const root = resolve(".");
const lifecycleScript = join(root, "scripts", "cairn-lifecycle.mjs");
const cliScript = join(root, "scripts", "cairn.mjs");

test("updateConfig replaces Cairn sections and preserves unrelated TOML", () => {
  const input = [
    "# user config",
    "[features]",
    "plugins = false",
    "other = true",
    "",
    "[marketplaces.cairn]",
    'source = "/old"',
    "",
    '[plugins."cairn@cairn"]',
    "enabled = false",
    "",
    '[hooks.state."cairn@cairn:hooks/hooks.json:stop:0:0"]',
    'trusted_hash = "sha256:old"',
    "",
    "[profiles.default]",
    'model = "gpt-5"',
    "",
  ].join("\n");

  const output = updateConfig(input, [{ key: "cairn@cairn:hooks/hooks.json:stop:0:0", trustedHash: "sha256:new" }]);

  assert.match(output, /\[features\]\nplugins = true\nother = true/);
  assert.match(output, /\[profiles\.default\]\nmodel = "gpt-5"/);
  assert.match(output, /\[marketplaces\.cairn\]/);
  assert.match(output, /\[plugins\."cairn@cairn"\]\nenabled = true/);
  assert.match(output, /trusted_hash = "sha256:new"/);
  assert.doesNotMatch(output, /sha256:old/);
  assert.equal(splitSections(output).filter((section) => section.header === "marketplaces.cairn").length, 1);
});

test("removeCairnConfig removes only Cairn-owned sections", () => {
  const input = [
    "[features]",
    "plugins = true",
    "",
    "[marketplaces.cairn]",
    'source = "/tmp/cairn"',
    "",
    "[marketplaces.other]",
    'source = "/tmp/other"',
    "",
    '[hooks.state."other@other:hooks/hooks.json:stop:0:0"]',
    'trusted_hash = "sha256:other"',
    "",
  ].join("\n");

  const output = removeCairnConfig(input);

  assert.match(output, /\[features\]/);
  assert.match(output, /\[marketplaces\.other\]/);
  assert.match(output, /other@other/);
  assert.doesNotMatch(output, /marketplaces\.cairn/);
});

test("hookHash is stable and sensitive to hook identity", () => {
  const handler = {
    type: "command",
    command: 'node "${PLUGIN_ROOT}/scripts/cairn-state.mjs" stop',
    timeout: 10,
    statusMessage: "Cairn: checking two-gate evidence requirements",
  };

  const first = hookHash("stop", undefined, handler);
  const second = hookHash("stop", undefined, { ...handler });
  const changed = hookHash("stop", undefined, { ...handler, timeout: 11 });

  assert.equal(first, second);
  assert.match(first, /^sha256:[a-f0-9]{64}$/);
  assert.notEqual(first, changed);
});

test("CLI messages and state initialization run without a POSIX shell", async () => {
  const temp = await mkdtemp(join(tmpdir(), "cairn-state-"));
  try {
    assert.match(message("usage", "en-US"), /cairn install\|upgrade/);
    assert.match(message("memory", "ko-KR"), /cairn-memory/);

    const output = await runState("manual", { root: temp, locale: "en-US" });
    assert.equal(output, "Cairn initialized MEMORY.md, PLAN.md, docs/memory, and docs/plan.");
    await stat(join(temp, "MEMORY.md"));
    await stat(join(temp, "PLAN.md"));

    const cli = spawnSync(process.execPath, [cliScript, "memory"], {
      cwd: root,
      env: { ...process.env, LC_ALL: "en-US" },
      encoding: "utf8",
    });
    assert.equal(cli.status, 0, cli.stderr);
    assert.match(cli.stdout, /cairn-memory/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("path segment filtering handles platform separators", () => {
  assert.equal(pathHasSegment(["nested", ".git", "config"].join("\\"), ".git"), true);
  assert.equal(pathHasSegment(["nested", "node_modules", "pkg"].join("/"), "node_modules"), true);
  assert.equal(pathHasSegment(["nested", "modules", "pkg"].join("/"), "node_modules"), false);
});

test("install doctor uninstall lifecycle uses isolated homes", async () => {
  const temp = await mkdtemp(join(tmpdir(), "cairn-lifecycle-"));
  const env = {
    ...process.env,
    CODEX_HOME: join(temp, "codex"),
    CLAUDE_HOME: join(temp, "claude"),
    ANTIGRAVITY_HOME: join(temp, "agents"),
    ANTIGRAVITY_CLI_HOME: join(temp, "antigravity-cli"),
    HOME: join(temp, "home"),
    CODEX_CONFIG_PATH: join(temp, "config.toml"),
  };

  try {
    await writeFile(env.CODEX_CONFIG_PATH, "[profiles.default]\nmodel = \"gpt-5\"\n");

    const install = runLifecycle("install", env);
    assert.equal(install.status, 0, install.stderr);
    assert.match(install.stdout, /Cairn install complete|Cairn 설치 완료/);

    const doctor = runLifecycle("doctor", env);
    assert.equal(doctor.status, 0, doctor.stdout + doctor.stderr);
    assert.doesNotMatch(doctor.stdout, /^FAIL/m);

    const config = await readFile(env.CODEX_CONFIG_PATH, "utf8");
    assert.match(config, /\[profiles\.default\]/);
    assert.match(config, /\[marketplaces\.cairn\]/);
    assert.match(config, /\[hooks\.state\."cairn@cairn:hooks\/hooks\.json:stop:0:0"\]/);

    const manifestPath = join(env.CODEX_HOME, "plugins", "cache", "cairn", "plugins", "cairn", ".codex-plugin", "plugin.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    assert.equal(manifest.hooks, "./hooks/hooks.json");
    await stat(join(env.CLAUDE_HOME, "commands", "cairn-plan.md"));
    await stat(join(env.ANTIGRAVITY_HOME, "skills", "cairn-plan", "SKILL.md"));

    const uninstall = runLifecycle("uninstall", env);
    assert.equal(uninstall.status, 0, uninstall.stderr);
    const removedConfig = await readFile(env.CODEX_CONFIG_PATH, "utf8");
    assert.match(removedConfig, /\[profiles\.default\]/);
    assert.doesNotMatch(removedConfig, /marketplaces\.cairn/);

    await assert.rejects(stat(join(env.CODEX_HOME, "plugins", "cache", "cairn")));
    await assert.rejects(stat(join(env.CLAUDE_HOME, "commands", "cairn-plan.md")));
    await assert.rejects(stat(join(env.ANTIGRAVITY_HOME, "skills", "cairn-plan")));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

function runLifecycle(command, env) {
  return spawnSync(process.execPath, [lifecycleScript, command], {
    cwd: root,
    env,
    encoding: "utf8",
  });
}
