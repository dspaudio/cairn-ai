import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { PassThrough } from "node:stream";
import { message } from "../scripts/cairn.mjs";
import { HOSTS, parseHostsOption, promptHosts } from "../scripts/cairn-lifecycle-hosts.mjs";
import {
  hookHash,
  removeCairnConfig,
  splitSections,
  updateConfig,
} from "../scripts/cairn-lifecycle-config.mjs";
import { pathHasSegment, shouldCopyPluginPath } from "../scripts/cairn-lifecycle.mjs";
import { runState, runStateResult } from "../scripts/cairn-state.mjs";

const fakeClaudeCli = resolve("test/fixtures/fake-claude.mjs");
const root = resolve(".");
const lifecycleScript = join(root, "scripts", "cairn-lifecycle.mjs");
const stateScript = join(root, "scripts", "cairn-state.mjs");
const cliScript = join(root, "scripts", "cairn.mjs");
const releaseVersion = JSON.parse(await readFile(join(root, "package.json"), "utf8")).version;

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

  const output = updateConfig(
    input,
    [{ key: "cairn@cairn:hooks/hooks.json:stop:0:0", trustedHash: "sha256:new" }],
    { marketplacePath: "/tmp/cairn-marketplace" },
  );

  assert.match(output, /\[features\]\nplugins = false\nother = true/);
  assert.doesNotMatch(output, /plugin_hooks =/);
  assert.doesNotMatch(output, /multi_agent =/);
  assert.doesNotMatch(output, /\[agents\]/);
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

test("removeCairnConfig keeps array-of-tables and commented headers that follow Cairn sections", () => {
  const input = [
    'model = "x"',
    "[marketplaces.cairn]",
    'source = "/tmp/cairn"',
    '[plugins."cairn@cairn"]',
    "enabled = true",
    "[[mcp_servers.list]]",
    'name = "keep-me"',
    '[projects."/x"] # trust',
    'trust_level = "trusted"',
    "",
  ].join("\n");

  const output = removeCairnConfig(input);

  assert.match(output, /\[\[mcp_servers\.list\]\]\nname = "keep-me"/);
  assert.match(output, /\[projects\."\/x"\] # trust\ntrust_level = "trusted"/);
  assert.doesNotMatch(output, /marketplaces\.cairn|cairn@cairn/);
});

test("removeCairnConfig preserves trailing trivia that separates the next public section", () => {
  const publicSuffix = '\n# user profile separator\n[profiles.user]\nmodel = "custom"\n';
  const input = `[marketplaces.cairn]\nsource = "/tmp/cairn"\n${publicSuffix}`;

  assert.equal(removeCairnConfig(input), publicSuffix);
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

test("hook status messages use user-facing evidence terminology", async () => {
  const hooks = await readFile(join(root, "hooks", "hooks.json"), "utf8");
  assert.doesNotMatch(hooks, /statusMessage[^\n]*receipt/i);
  assert.match(hooks, /statusMessage[^\n]*evidence/i);
});

test("CLI messages and state initialization run without a POSIX shell", async () => {
  const temp = await mkdtemp(join(tmpdir(), "cairn-state-"));
  const tempKo = await mkdtemp(join(tmpdir(), "cairn-state-ko-"));
  try {
    assert.match(message("usage", "en-US"), /cairn install\|upgrade/);
    assert.match(message("memory", "ko-KR"), /cairn-memory/);
    assert.match(message("plan", "en-US"), /MEMORY\.md first when present.*continue without repository memory/i);
    assert.match(message("plan", "en-US"), /Light\/Heavy Path triage/);
    assert.match(message("plan", "en-US"), /request, planning, and code checkpoints/i);
    assert.match(message("plan", "en-US"), /plan artifact.*repository goal task roadmap.*UI plan/i);
    assert.match(message("work", "en-US"), /code checkpoint.*before the first edit/i);
    assert.match(message("plan", "en-US"), /model per task.*pass it.*effort/i);
    assert.match(message("work", "en-US"), /Light.*medium.*Heavy.*high.*xhigh/i);
    assert.match(message("work", "en-US"), /dispatch MUST pass the requested effort through the host option.*Agent `effort`, never fork/);
    assert.match(message("work", "en-US"), /Effective is the passed value.*not-applied: <reason>.*inherited` only when the host has no option/);
    assert.match(message("plan", "en-US"), /whole work.*tasks and sub-tasks/i);
    assert.match(message("plan", "ko-KR"), /전체 작업.*task.*sub-task/);
    assert.match(message("work", "ko-KR"), /MEMORY\.md가 있으면 읽고 없으면 무시하고 진행/);
    assert.match(message("work", "ko-KR"), /Light\/Heavy Path/);
    assert.match(message("work", "en-US"), /resume active work after side questions/i);
    assert.match(message("work", "ko-KR"), /곁가지 질문.*active work/);
    for (const command of ["memory", "plan", "work", "review"]) {
      assert.match(message(command, "en-US"), /generated or updated documentation, plans, and memory artifacts/i);
      assert.match(message(command, "ko-KR"), /문서, 계획, 메모리 산출물/);
    }
    for (const locale of ["en-US", "ko-KR", "ja-JP", "zh-CN", "es-ES", "fr-FR", "de-DE", "pt-BR"]) {
      for (const command of ["plan", "work"]) {
        const output = message(command, locale);
        assert.match(output, /user-called\/main agent (?:is the orchestrator|orchestrates)/i, `${locale} ${command} orchestrator policy`);
        assert.match(output, /(implementation edits.*worker subagents?|worker subagents?.*implementation edits)/i, `${locale} ${command} worker edit policy`);
        assert.match(output, /progress-reporting channel.*subagents report status.*starting work.*deciding or confirming direction.*periodic progress.*finishing/i, `${locale} ${command} status report policy`);
        assert.match(output, /orchestrator must immediately relay received status events to the user/i, `${locale} ${command} relay policy`);
        assert.match(output, /no mid-run reporting channel exists.*observable events.*assignment.*waiting.*final completion/i, `${locale} ${command} observable relay policy`);
        assert.match(output, /delegated subagent finishes.*final report before leaving/i, `${locale} ${command} final report before leave policy`);
        assert.match(output, /captures? the final report and evidence.*close or release the completed subagent/i, `${locale} ${command} close completed subagent policy`);
        assert.match(output, /close or release the completed subagent.*review the final report and evidence/i, `${locale} ${command} final report evidence review policy`);
        assert.match(output, /subagent tools are unavailable.*main agent takes over implementation directly.*records that takeover in evidence/i, `${locale} ${command} takeover policy`);
      }
    }

    const output = await runState("manual", { root: temp, locale: "en-US" });
    assert.equal(output, "Cairn initialized MEMORY.md, PLAN.md, docs/memory, and docs/plan.");
    await stat(join(temp, "MEMORY.md"));
    await stat(join(temp, "PLAN.md"));
    const plan = await readFile(join(temp, "PLAN.md"), "utf8");

    const outputKo = await runState("manual", { root: tempKo, locale: "ko-KR" });
    assert.equal(outputKo, "Cairn이 MEMORY.md, PLAN.md, docs/memory, docs/plan을 초기화했습니다.");
    const memoryKo = await readFile(join(tempKo, "MEMORY.md"), "utf8");
    const planKo = await readFile(join(tempKo, "PLAN.md"), "utf8");
    assert.match(memoryKo, /문서, 계획, 메모리 산출물/);
    // Planning rules moved from the PLAN.md index template to the cairn-plan skill, their canonical source.
    for (const index of [plan, planKo]) {
      assert.doesNotMatch(index, /## Planning Rules/);
      assert.match(index, /cairn-plan/);
      assert.match(index, /cairn plan index/);
    }
    assert.ok(plan.length <= 700, `PLAN.md template is ${plan.length} characters; budget is 700`);
    const planningRules = await readFile(join(root, "skills", "cairn-plan", "planning-rules.md"), "utf8");
    assert.match(planningRules, /complexity triage, the selected path, and the Heavy Path signals checked/);
    assert.match(planningRules, /Request checkpoint, planning checkpoint, and code checkpoint/);
    assert.match(planningRules, /plan artifact, repository goal task roadmap, native UI plan/);

    const cli = spawnSync(process.execPath, [cliScript, "memory"], {
      cwd: root,
      env: { ...process.env, LC_ALL: "en-US" },
      encoding: "utf8",
    });
    assert.equal(cli.status, 0, cli.stderr);
    assert.match(cli.stdout, /cairn-memory/);

    const linkedCli = join(temp, "cairn-link.mjs");
    await symlink(cliScript, linkedCli);
    const linked = spawnSync(process.execPath, [linkedCli], {
      cwd: root,
      env: { ...process.env, LC_ALL: "en-US" },
      encoding: "utf8",
    });
    assert.equal(linked.status, 0, linked.stderr);
    assert.match(linked.stdout, /Usage: cairn install\|upgrade/);
  } finally {
    await rm(temp, { recursive: true, force: true });
    await rm(tempKo, { recursive: true, force: true });
  }
});

test("stop hook ignores historical Markdown plans when no Cairn goal is active", async () => {
  const temp = await mkdtemp(join(tmpdir(), "cairn-goal-scope-"));
  try {
    await runState("manual", { root: temp, locale: "en-US" });
    await writeFile(join(temp, "docs", "plan", "stale-unindexed-work.md"), [
      "# Plan: stale work",
      "",
      "## Evidence",
      "",
      "- Tests: skipped",
      "",
      "## Status",
      "",
      "- [ ] Implemented",
      "",
    ].join("\n"));

    const result = await runStateResult("stop", {
      root: temp,
      locale: "en-US",
      payload: { cwd: temp, session_id: "session-current", turn_id: "turn-current" },
    });
    assert.equal(result.status, 0);
    assert.deepEqual(result.hookOutput, { continue: true });
    assert.match(result.message, /no active Cairn goal/i);

    const cli = spawnSync(process.execPath, [stateScript, "stop"], {
      cwd: root,
      input: JSON.stringify({ cwd: temp, session_id: "session-current", turn_id: "turn-current" }),
      encoding: "utf8",
    });
    assert.equal(cli.status, 0, cli.stderr);
    assert.deepEqual(JSON.parse(cli.stdout), { continue: true });
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("path segment filtering handles platform separators", () => {
  assert.equal(pathHasSegment(["nested", ".git", "config"].join("\\"), ".git"), true);
  assert.equal(pathHasSegment(["nested", "node_modules", "pkg"].join("/"), "node_modules"), true);
  assert.equal(pathHasSegment(["nested", "modules", "pkg"].join("/"), "node_modules"), false);
});

test("plugin copy filtering ignores excluded names outside the package root", () => {
  assert.equal(shouldCopyPluginPath("C:\\npm-prefix\\node_modules\\cairn-ai\\.codex-plugin"), true);
  assert.equal(shouldCopyPluginPath("C:\\npm-prefix\\node_modules\\cairn-ai\\hooks\\hooks.json"), true);
  assert.equal(shouldCopyPluginPath("C:\\npm-prefix\\node_modules\\cairn-ai\\node_modules"), false);
  assert.equal(shouldCopyPluginPath("/tmp/node_modules/cairn-ai/.git"), false);
});

test("doctor waits for a concurrent lifecycle transaction before observing installed state", async () => {
  const temp = await mkdtemp(join(tmpdir(), "cairn-doctor-lock-"));
  const env = {
    ...process.env,
    CAIRN_HOME: join(temp, "cairn-home"),
    CODEX_HOME: join(temp, "codex"),
    CLAUDE_HOME: join(temp, "claude"),
    CAIRN_CLAUDE_CLI: fakeClaudeCli,
    ANTIGRAVITY_HOME: join(temp, "agents"),
    ANTIGRAVITY_CLI_HOME: join(temp, "antigravity-cli"),
    HOME: join(temp, "home"),
    CODEX_CONFIG_PATH: join(temp, "codex", "config.toml"),
  };

  try {
    await mkdir(dirname(env.CODEX_CONFIG_PATH), { recursive: true });
    await writeFile(env.CODEX_CONFIG_PATH, "[profiles.default]\nmodel = \"gpt-5\"\n");

    const install = spawn(process.execPath, [lifecycleScript, "install"], {
      cwd: root,
      env: { ...env, CAIRN_TEST_HOLD_LOCK_STDIN: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const installExit = waitForExit(install);
    await waitForOutput(install.stdout, "CAIRN_TEST_LOCK_ACQUIRED");

    const doctor = spawn(process.execPath, [lifecycleScript, "doctor"], {
      cwd: root,
      env: { ...env, CAIRN_TEST_REPORT_LOCK_WAIT: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const doctorExit = waitForExit(doctor);
    let doctorOutput = "";
    doctor.stdout.on("data", (chunk) => { doctorOutput += chunk; });
    doctor.stderr.on("data", (chunk) => { doctorOutput += chunk; });
    await waitForOutput(doctor.stdout, "CAIRN_TEST_LOCK_WAIT");

    install.stdin.end("release\n");
    assert.equal(await installExit, 0);
    await doctorExit;
    assert.match(doctorOutput, /^OK ownership manifest$/m);
    assert.match(doctorOutput, /^OK ownership digests$/m);
    assert.match(doctorOutput, /^OK installed runtime locator$/m);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("install doctor uninstall lifecycle uses isolated homes", async () => {
  const temp = await mkdtemp(join(tmpdir(), "cairn-lifecycle-"));
  const env = {
    ...process.env,
    CAIRN_HOME: join(temp, "cairn-home"),
    CODEX_HOME: join(temp, "codex"),
    CLAUDE_HOME: join(temp, "claude"),
    CAIRN_CLAUDE_CLI: fakeClaudeCli,
    ANTIGRAVITY_HOME: join(temp, "agents"),
    ANTIGRAVITY_CLI_HOME: join(temp, "antigravity-cli"),
    HOME: join(temp, "home"),
    CODEX_CONFIG_PATH: join(temp, "codex", "config.toml"),
  };

  try {
    await mkdir(dirname(env.CODEX_CONFIG_PATH), { recursive: true });
    await writeFile(env.CODEX_CONFIG_PATH, "[profiles.default]\nmodel = \"gpt-5\"\n");

    const install = runLifecycle("install", env);
    assert.equal(install.status, 0, install.stderr);
    assert.match(install.stdout, /Cairn install complete|Cairn 설치 완료/);

    const doctor = runLifecycle("doctor", env);
    assert.equal(doctor.status, hostToolsAvailable() ? 0 : 1, doctor.stdout + doctor.stderr);
    if (hostToolsAvailable()) assert.doesNotMatch(doctor.stdout, /^FAIL/m);
    else assert.match(doctor.stdout, /^FAIL (?:Codex|Antigravity)/m);

    const config = await readFile(env.CODEX_CONFIG_PATH, "utf8");
    assert.match(config, /\[profiles\.default\]/);
    assert.doesNotMatch(config, /\[features\]/);
    assert.doesNotMatch(config, /\[agents\]/);
    assert.match(config, /\[marketplaces\.cairn\]/);
    assert.match(config, /\[hooks\.state\."cairn@cairn:hooks\/hooks\.json:stop:0:0"\]/);

    const installRoot = join(env.CAIRN_HOME, "install");
    const codexSource = join(installRoot, "codex", "plugins", "cairn");
    const manifestPath = join(env.CODEX_HOME, "plugins", "cache", "cairn", "cairn", releaseVersion, ".codex-plugin", "plugin.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    assert.equal(manifest.hooks, "./hooks/hooks.json");
    const kernel = manifest.interface.defaultPrompt.join("\n");
    assert.equal(manifest.interface.defaultPrompt.length, 7);
    assert.ok(kernel.length <= 1600, `installed default prompt is ${kernel.length} chars`);
    assert.match(kernel, /read root MEMORY\.md first when it exists.*continue without repository memory/i);
    assert.match(kernel, /load the phase skill.*restore the active plan and current-task references/i);
    assert.match(kernel, /compaction, restart, handoff, or delegation.*MEMORY\.md → phase skill → active plan → current task references/i);
    assert.match(kernel, /missing MEMORY\.md never blocks work.*fail closed only when active state/is);
    assert.match(kernel, /missing, failed, skipped, stale, or placeholder evidence never completes work/i);
    assert.match(kernel, /external-state changes.*dry-run\/check.*current task/i);
    assert.match(kernel, /side questions.*resume the current task.*pause, stop, or switch/i);
    const explorer = await readFile(join(codexSource, "agents", "explorer.md"), "utf8");
    const worker = await readFile(join(codexSource, "agents", "worker.md"), "utf8");
    const installedPlan = await readFile(join(codexSource, "skills", "cairn-plan", "SKILL.md"), "utf8");
    const installedWork = await readFile(join(codexSource, "skills", "cairn-work", "SKILL.md"), "utf8");
    const installedGuidance = await readFile(join(codexSource, "docs", "model-guidance", "README.md"), "utf8");
    assert.match(explorer, /root `MEMORY\.md` → the phase skill.*active plan.*current-task references/i);
    assert.match(explorer, /recursively delegate bounded read-only sub-tasks to subagents/);
    assert.match(worker, /root `MEMORY\.md` → the phase skill.*active plan.*current-task references/i);
    assert.match(worker, /recursively delegate bounded sub-tasks to subagents/);
    assert.match(installedPlan, /initial plan.*triage-plan.*not implementation-ready/i);
    assert.match(installedPlan, /update_plan.*create_goal/i);
    assert.match(installedPlan, /user-called\/main agent as the orchestrator/i);
    assert.match(installedWork, /test contract first.*requirements, invariants, boundaries, and failure modes/i);
    assert.match(installedWork, /npm pack --dry-run/i);
    assert.match(installedWork, /requested.*effective.*reasoning effort/is);
    assert.match(installedWork, /reasoning effort profile/i);
    assert.match(installedGuidance, /Reasoning Effort Routing/i);
    await stat(join(env.CLAUDE_HOME, "commands", "cairn-plan.md"));
    await stat(join(env.ANTIGRAVITY_HOME, "skills", "cairn-plan", "SKILL.md"));
    // On-demand skill reference files ship with the runtime and the Antigravity skill trees.
    for (const [skill, file] of [["cairn-plan", "heavy-path.md"], ["cairn-plan", "planning-rules.md"], ["cairn-plan", "delegation.md"], ["cairn-work", "heavy-path.md"], ["cairn-work", "verification.md"], ["cairn-work", "delegation.md"], ["cairn-work", "recovery.md"]]) {
      await stat(join(codexSource, "skills", skill, file));
      await stat(join(env.ANTIGRAVITY_HOME, "skills", skill, file));
    }
    const antigravityWork = await readFile(join(env.ANTIGRAVITY_HOME, "workflows", "cairn-work.md"), "utf8");
    assert.match(antigravityWork, /side question.*resume the previous active work/i);

    const uninstall = runLifecycle("uninstall", env);
    assert.equal(uninstall.status, 0, uninstall.stderr);
    const removedConfig = await readFile(env.CODEX_CONFIG_PATH, "utf8");
    assert.match(removedConfig, /\[profiles\.default\]/);
    assert.doesNotMatch(removedConfig, /marketplaces\.cairn/);

    await assert.rejects(stat(codexSource));
    await assert.rejects(stat(join(installRoot, "lifecycle.json")));
    await assert.rejects(stat(installRoot));
    await assert.rejects(stat(join(env.CODEX_HOME, "plugins", "cache", "cairn")));
    await assert.rejects(stat(join(env.CLAUDE_HOME, "commands", "cairn-plan.md")));
    await assert.rejects(stat(join(env.ANTIGRAVITY_HOME, "skills", "cairn-plan")));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

function waitForOutput(stream, expected) {
  return new Promise((resolvePromise, rejectPromise) => {
    let output = "";
    const timeout = setTimeout(() => {
      stream.off("data", onData);
      rejectPromise(new Error(`Timed out waiting for ${expected}`));
    }, 10_000);
    const onData = (chunk) => {
      output += chunk;
      if (!output.includes(expected)) return;
      clearTimeout(timeout);
      stream.off("data", onData);
      resolvePromise();
    };
    stream.on("data", onData);
  });
}

function waitForExit(child) {
  return new Promise((resolvePromise, rejectPromise) => {
    const timeout = setTimeout(() => rejectPromise(new Error("Timed out waiting for lifecycle process")), 20_000);
    child.once("error", (error) => {
      clearTimeout(timeout);
      rejectPromise(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      resolvePromise(code);
    });
  });
}

function runLifecycle(command, env) {
  return spawnSync(process.execPath, [lifecycleScript, command], {
    cwd: root,
    env,
    encoding: "utf8",
  });
}

function hostToolsAvailable() {
  return commandAvailable("codex") && commandAvailable("agy");
}

function commandAvailable(command) {
  const result = spawnSync(command, ["--version"], { encoding: "utf8" });
  return result.error === undefined && result.status === 0;
}

test("install registers a Claude Code plugin whose hooks call the installed runtime, and uninstall removes it", async () => {
  const temp = await mkdtemp(join(tmpdir(), "cairn-claude-plugin-"));
  const env = claudePluginEnv(temp);
  const claudeLog = () => readFile(join(env.CLAUDE_HOME, "fake-claude.log"), "utf8").then((text) => text.trim().split("\n"));
  const claudeState = () => readFile(join(env.CLAUDE_HOME, "fake-claude-state.json"), "utf8").then(JSON.parse);
  try {
    await mkdir(dirname(env.CODEX_CONFIG_PATH), { recursive: true });
    await writeFile(env.CODEX_CONFIG_PATH, "");

    const install = runLifecycle("install", env);
    assert.equal(install.status, 0, install.stdout + install.stderr);
    const pluginMarketplace = join(env.CAIRN_HOME, "install", "claude");
    const runtimeRoot = join(env.CAIRN_HOME, "install", "runtime", releaseVersion);
    assert.match(install.stdout, /Claude Code plugin: cairn@cairn/);

    const marketplace = JSON.parse(await readFile(join(pluginMarketplace, ".claude-plugin", "marketplace.json"), "utf8"));
    assert.deepEqual(marketplace.plugins.map((plugin) => [plugin.name, plugin.source]), [["cairn", "./cairn"]]);
    const manifest = JSON.parse(await readFile(join(pluginMarketplace, "cairn", ".claude-plugin", "plugin.json"), "utf8"));
    assert.equal(manifest.name, "cairn");
    assert.equal(manifest.version, releaseVersion);
    const hooksText = await readFile(join(pluginMarketplace, "cairn", "hooks", "hooks.json"), "utf8");
    assert.doesNotMatch(hooksText, /PLUGIN_ROOT/, "Claude Code does not expand Codex's ${PLUGIN_ROOT}");
    const hooks = JSON.parse(hooksText).hooks;
    assert.deepEqual(Object.keys(hooks).sort(), ["PostToolUse", "SessionStart", "Stop", "SubagentStop", "UserPromptSubmit"]);
    for (const group of Object.values(hooks).flat()) {
      for (const handler of group.hooks) assert.ok(handler.command.includes(join(runtimeRoot, "scripts", "cairn-state.mjs")), handler.command);
    }
    await stat(join(pluginMarketplace, "cairn", "skills", "cairn-plan", "references", "cairn-runtime.json"));
    await assert.rejects(stat(join(pluginMarketplace, "cairn", "commands")), "commands stay in the ~/.claude mirrors");

    if (process.platform !== "win32") {
      const sessionStart = hooks.SessionStart[0].hooks[0].command;
      const hookRun = spawnSync(sessionStart, { shell: true, cwd: temp, input: JSON.stringify({ cwd: temp, session_id: "s" }), encoding: "utf8", env });
      assert.equal(hookRun.status, 0, hookRun.stderr);
      assert.equal(JSON.parse(hookRun.stdout).hookSpecificOutput.hookEventName, "SessionStart");
    }

    assert.deepEqual(await claudeLog(), [
      "--version", "plugin marketplace list", "plugin list",
      `plugin marketplace add ${pluginMarketplace} --scope user`, "plugin install cairn@cairn --scope user",
    ]);
    const state = await claudeState();
    // Claude Code installs a cached copy, not the marketplace directory itself.
    assert.equal(state.plugins[0].installPath, join(env.CLAUDE_HOME, "plugins", "cache", "cairn", "cairn", releaseVersion));
    await stat(join(state.plugins[0].installPath, "hooks", "hooks.json"));

    const upgrade = runLifecycle("upgrade", env);
    assert.equal(upgrade.status, 0, upgrade.stdout + upgrade.stderr);
    assert.equal((await claudeLog()).filter((line) => line.startsWith("plugin marketplace add") || line.startsWith("plugin install")).length, 2,
      "re-running install must not register twice");

    const doctor = runLifecycle("doctor", env);
    assert.match(doctor.stdout, /^OK Claude plugin files$/m);
    assert.match(doctor.stdout, /^OK Claude plugin registered$/m);
    assert.match(doctor.stdout, /^OK Claude plugin enabled$/m);
    assert.match(doctor.stdout, /^OK Claude plugin cache version$/m);

    const uninstall = runLifecycle("uninstall", env);
    assert.equal(uninstall.status, 0, uninstall.stdout + uninstall.stderr);
    assert.deepEqual(await claudeState(), { marketplaces: [], plugins: [] });
    await assert.rejects(stat(pluginMarketplace));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("install and uninstall leave a foreign Claude Code marketplace named cairn untouched", async () => {
  const temp = await mkdtemp(join(tmpdir(), "cairn-claude-foreign-"));
  const env = claudePluginEnv(temp);
  try {
    await mkdir(dirname(env.CODEX_CONFIG_PATH), { recursive: true });
    await writeFile(env.CODEX_CONFIG_PATH, "");
    const foreign = { marketplaces: [{ name: "cairn", source: "directory", path: join(temp, "someone-else") }], plugins: [] };
    await mkdir(env.CLAUDE_HOME, { recursive: true });
    await writeFile(join(env.CLAUDE_HOME, "fake-claude-state.json"), JSON.stringify(foreign));

    const install = runLifecycle("install", env);
    assert.equal(install.status, 0, install.stdout + install.stderr);
    assert.match(install.stdout, /Claude Code plugin not registered: a different Claude Code marketplace named "cairn" already exists/);
    const uninstall = runLifecycle("uninstall", env);
    assert.equal(uninstall.status, 0, uninstall.stdout + uninstall.stderr);
    assert.deepEqual(JSON.parse(await readFile(join(env.CLAUDE_HOME, "fake-claude-state.json"), "utf8")), foreign);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

const claudeRefreshManual = "claude plugin marketplace update cairn && claude plugin update cairn@cairn --scope user";

// Installs into isolated homes and then marks the Claude Code cache as holding an older plugin version.
async function installWithStaleClaudeCache(temp) {
  const env = claudePluginEnv(temp);
  await mkdir(dirname(env.CODEX_CONFIG_PATH), { recursive: true });
  await writeFile(env.CODEX_CONFIG_PATH, "");
  const install = runLifecycle("install", env);
  assert.equal(install.status, 0, install.stdout + install.stderr);
  const statePath = join(env.CLAUDE_HOME, "fake-claude-state.json");
  const state = JSON.parse(await readFile(statePath, "utf8"));
  state.plugins[0].version = "0.5.0";
  state.plugins[0].installPath = join(env.CLAUDE_HOME, "plugins", "cache", "cairn", "cairn", "0.5.0");
  await writeFile(statePath, JSON.stringify(state, null, 2));
  return {
    env,
    claudeLog: () => readFile(join(env.CLAUDE_HOME, "fake-claude.log"), "utf8").then((text) => text.trim().split("\n")),
    claudeState: () => readFile(statePath, "utf8").then(JSON.parse),
    ownership: () => readFile(join(env.CAIRN_HOME, "install", "lifecycle.json"), "utf8").then(JSON.parse),
  };
}

test("upgrade refreshes a stale Claude Code plugin cache to the installed version", async () => {
  const temp = await mkdtemp(join(tmpdir(), "cairn-claude-refresh-"));
  try {
    const { env, claudeLog, claudeState } = await installWithStaleClaudeCache(temp);
    const before = (await claudeLog()).length;

    const upgrade = runLifecycle("upgrade", env);
    assert.equal(upgrade.status, 0, upgrade.stdout + upgrade.stderr);
    assert.match(upgrade.stdout, /Claude Code plugin: cairn@cairn/);
    const added = (await claudeLog()).slice(before);
    const marketplaceUpdate = added.indexOf("plugin marketplace update cairn");
    const pluginUpdate = added.indexOf("plugin update cairn@cairn --scope user");
    assert.ok(marketplaceUpdate >= 0 && pluginUpdate > marketplaceUpdate, added.join("\n"));
    assert.equal(added.filter((line) => line.startsWith("plugin install") || line.startsWith("plugin marketplace add")).length, 0, added.join("\n"));
    const [plugin] = (await claudeState()).plugins;
    assert.equal(plugin.version, releaseVersion);
    assert.equal(plugin.installPath, join(env.CLAUDE_HOME, "plugins", "cache", "cairn", "cairn", releaseVersion));
    await stat(join(plugin.installPath, ".claude-plugin", "plugin.json"));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("upgrade does not call claude plugin update when the cache already matches", async () => {
  const temp = await mkdtemp(join(tmpdir(), "cairn-claude-current-"));
  const env = claudePluginEnv(temp);
  const claudeLog = () => readFile(join(env.CLAUDE_HOME, "fake-claude.log"), "utf8").then((text) => text.trim().split("\n"));
  try {
    await mkdir(dirname(env.CODEX_CONFIG_PATH), { recursive: true });
    await writeFile(env.CODEX_CONFIG_PATH, "");
    assert.equal(runLifecycle("install", env).status, 0);
    const before = (await claudeLog()).length;

    const upgrade = runLifecycle("upgrade", env);
    assert.equal(upgrade.status, 0, upgrade.stdout + upgrade.stderr);
    const added = (await claudeLog()).slice(before);
    for (const command of ["plugin update", "plugin marketplace update", "plugin marketplace add", "plugin install"]) {
      assert.equal(added.filter((line) => line.startsWith(command)).length, 0, `${command} was called: ${added.join("\n")}`);
    }
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("a failed Claude cache refresh keeps the upgrade committed, exits 1, and prints the manual command", async () => {
  const temp = await mkdtemp(join(tmpdir(), "cairn-claude-refresh-fail-"));
  try {
    const { env, claudeState, ownership } = await installWithStaleClaudeCache(temp);
    const installed = await ownership();

    const upgrade = runLifecycle("upgrade", { ...env, FAKE_CLAUDE_FAIL: "plugin update" });
    assert.equal(upgrade.status, 1, upgrade.stdout + upgrade.stderr);
    assert.match(upgrade.stdout, /Cairn upgrade complete|Cairn 업그레이드 완료/);
    assert.ok(upgrade.stdout.includes("Claude Code plugin cache refresh failed:"), upgrade.stdout);
    assert.ok(upgrade.stdout.includes(claudeRefreshManual), upgrade.stdout);
    const upgraded = await ownership();
    assert.equal(upgraded.version, releaseVersion);
    assert.notEqual(upgraded.transactionId, installed.transactionId, "the upgrade transaction stays committed");
    await stat(join(env.CAIRN_HOME, "install", "runtime", releaseVersion, "scripts", "cairn.mjs"));
    await stat(join(env.CODEX_HOME, "plugins", "cache", "cairn", "cairn", releaseVersion, "scripts", "cairn.mjs"));
    await assert.rejects(stat(join(env.CAIRN_HOME, "install", "transaction.json")));
    assert.equal((await claudeState()).plugins[0].version, "0.5.0");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("a refresh that leaves the old cached version is reported as failed", async () => {
  const temp = await mkdtemp(join(tmpdir(), "cairn-claude-refresh-noop-"));
  try {
    const { env } = await installWithStaleClaudeCache(temp);

    const upgrade = runLifecycle("upgrade", { ...env, FAKE_CLAUDE_UPDATE_NOOP: "1" });
    assert.equal(upgrade.status, 1, upgrade.stdout + upgrade.stderr);
    assert.ok(upgrade.stdout.includes("Claude Code plugin cache refresh failed:"), upgrade.stdout);
    assert.match(upgrade.stdout, /still at 0\.5\.0/);
    assert.ok(upgrade.stdout.includes(claudeRefreshManual), upgrade.stdout);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("doctor fails when the Claude Code plugin cache version differs", async () => {
  const temp = await mkdtemp(join(tmpdir(), "cairn-claude-doctor-cache-"));
  try {
    const { env } = await installWithStaleClaudeCache(temp);

    const doctor = runLifecycle("doctor", env);
    assert.equal(doctor.status, 1, doctor.stdout + doctor.stderr);
    assert.match(doctor.stdout, /^FAIL Claude plugin cache version$/m);
    assert.match(doctor.stdout, /^OK Claude plugin registered$/m);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

const promptQuestionEn = "Enter a number, or host names separated by commas (codex,claude,antigravity) [1]: ";
const promptHeadingEn = "Select the hosts to install Cairn into.";

// Isolated homes with a pre-existing shared config, an English locale, and no CI marker, so the interactive host
// prompt is reachable through CAIRN_TEST_HOSTS_PROMPT_TTY when a test opts into it.
async function withHostsHome(fn) {
  const temp = await mkdtemp(join(tmpdir(), "cairn-hosts-"));
  const env = { ...claudePluginEnv(temp), LC_ALL: "en_US.UTF-8" };
  delete env.CI;
  delete env.CAIRN_TEST_HOSTS_PROMPT_TTY;
  const installRoot = join(env.CAIRN_HOME, "install");
  const paths = {
    installRoot,
    ownership: join(installRoot, "lifecycle.json"),
    runtime: join(installRoot, "runtime", releaseVersion),
    codexSource: join(installRoot, "codex", "plugins", "cairn"),
    codexMarketplace: join(installRoot, "codex"),
    claudeMarketplace: join(installRoot, "claude"),
    codexCache: join(env.CODEX_HOME, "plugins", "cache", "cairn"),
    codexRuntime: join(env.CODEX_HOME, "plugins", "cache", "cairn", "cairn", releaseVersion),
    claudeCommand: join(env.CLAUDE_HOME, "commands", "cairn-plan.md"),
    claudeLocator: join(env.CLAUDE_HOME, "cairn", "runtime.json"),
    ideSkill: join(env.ANTIGRAVITY_HOME, "skills", "cairn-plan", "SKILL.md"),
    cliSkill: join(env.ANTIGRAVITY_CLI_HOME, "skills", "cairn-plan.md"),
    claudeLog: join(env.CLAUDE_HOME, "fake-claude.log"),
    claudeState: join(env.CLAUDE_HOME, "fake-claude-state.json"),
  };
  const config = "[profiles.default]\nmodel = \"gpt-5\"\n";
  await mkdir(dirname(env.CODEX_CONFIG_PATH), { recursive: true });
  await writeFile(env.CODEX_CONFIG_PATH, config);
  try {
    await fn({ temp, env, paths, config });
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

function runHosts(args, env, input = "") {
  return spawnSync(process.execPath, [lifecycleScript, ...args], { cwd: root, env, input, encoding: "utf8", timeout: 60_000 });
}

const readJsonFile = (path) => readFile(path, "utf8").then(JSON.parse);
const occurrences = (text, fragment) => text.split(fragment).length - 1;

test("promptHosts asks in English and Korean and accepts numbers, comma lists, and an empty answer", async () => {
  const ask = async (answer, ko = false) => {
    const input = new PassThrough();
    const output = new PassThrough();
    let written = "";
    output.on("data", (chunk) => { written += chunk; });
    input.end(answer);
    try { return { hosts: await promptHosts({ input, output, ko }), written }; }
    catch (error) { return { error, written }; }
  };

  const en = await ask("\n");
  assert.deepEqual(en.hosts, HOSTS);
  assert.ok(en.written.startsWith([
    "Select the hosts to install Cairn into.",
    "  1) All — Codex, Claude Code, Antigravity (default)",
    "  2) Claude Code only",
    "  3) Codex only",
    "  4) Antigravity only",
    "Enter a number, or host names separated by commas (codex,claude,antigravity) [1]: ",
  ].join("\n")), en.written);
  assert.match(en.written, /Selected hosts: Codex, Claude Code, Antigravity\. To change later: cairn install --hosts <list>\n$/);

  const ko = await ask("2\n", true);
  assert.deepEqual(ko.hosts, ["claude"]);
  assert.ok(ko.written.startsWith([
    "Cairn을 설치할 호스트를 선택하세요.",
    "  1) 전체 — Codex, Claude Code, Antigravity (기본)",
    "  2) Claude Code만",
    "  3) Codex만",
    "  4) Antigravity만",
    "번호를 입력하거나 호스트 이름을 쉼표로 구분해 입력하세요 (codex,claude,antigravity) [1]: ",
  ].join("\n")), ko.written);
  assert.match(ko.written, /선택한 호스트: Claude Code\. 나중에 바꾸려면: cairn install --hosts <목록>\n$/);

  assert.deepEqual((await ask("1\n")).hosts, HOSTS);
  assert.deepEqual((await ask("3\n")).hosts, ["codex"]);
  assert.deepEqual((await ask("4\n")).hosts, ["antigravity"]);
  assert.deepEqual((await ask(" antigravity, codex \n")).hosts, ["codex", "antigravity"]);
  assert.deepEqual((await ask("all\n")).hosts, HOSTS);

  const retried = await ask("9\nclaude\n");
  assert.deepEqual(retried.hosts, ["claude"]);
  assert.equal(occurrences(retried.written, promptQuestionEn), 2);

  for (const answer of ["5\nfoo\ncodex,codex\n", "x\n", ""]) {
    const failed = await ask(answer);
    assert.equal(failed.error?.message, "No valid host selection was entered.", JSON.stringify(answer));
  }
});

test("parseHostsOption returns canonical order and rejects missing, empty, unknown, and duplicate names", () => {
  assert.deepEqual(parseHostsOption("all"), ["codex", "claude", "antigravity"]);
  assert.deepEqual(parseHostsOption("antigravity,claude"), ["claude", "antigravity"]);
  assert.deepEqual(parseHostsOption("codex"), ["codex"]);
  for (const value of [undefined, "", "gemini", "codex,codex", "codex,,claude", ",", "all,codex"]) {
    assert.throws(() => parseHostsOption(value), /^Error: Invalid --hosts value/, String(value));
  }
});

test("a non-interactive install without --hosts installs every host", async () => {
  await withHostsHome(async ({ env, paths }) => {
    // Without a TTY the prompt never runs, even when input is available.
    const install = runHosts(["install"], env, "2\n");
    assert.equal(install.status, 0, install.stdout + install.stderr);
    assert.ok(!install.stdout.includes(promptHeadingEn), install.stdout);
    const ownership = await readJsonFile(paths.ownership);
    assert.deepEqual(ownership.hosts, ["codex", "claude", "antigravity"]);
    for (const path of [paths.codexSource, paths.codexRuntime, paths.claudeCommand, paths.ideSkill, paths.cliSkill]) await stat(path);
  });
});

test("install --hosts claude writes only core and Claude targets", async () => {
  await withHostsHome(async ({ env, paths, config }) => {
    const install = runHosts(["install", "--hosts", "claude"], env);
    assert.equal(install.status, 0, install.stdout + install.stderr);
    const ownership = await readJsonFile(paths.ownership);
    assert.deepEqual(ownership.hosts, ["claude"]);
    assert.ok(ownership.targets.every((record) => record.id === "runtime" || record.id.startsWith("claude-")), ownership.targets.map((record) => record.id).join(","));
    assert.ok(ownership.targets.some((record) => record.id === "claude-plugin"));
    await stat(join(paths.runtime, "scripts", "cairn.mjs"));
    await stat(paths.claudeCommand);
    await stat(join(paths.claudeMarketplace, "cairn", "hooks", "hooks.json"));
    assert.deepEqual(await readdir(env.CODEX_HOME), ["config.toml"]);
    assert.equal(await readFile(env.CODEX_CONFIG_PATH, "utf8"), config);
    await assert.rejects(stat(paths.codexMarketplace));
    await assert.rejects(stat(env.ANTIGRAVITY_HOME));
    await assert.rejects(stat(env.ANTIGRAVITY_CLI_HOME));
    assert.equal((await readJsonFile(paths.claudeState)).plugins[0].id, "cairn@cairn");
    assert.ok(!install.stdout.includes("Codex plugin source:"), install.stdout);
  });
});

test("install --hosts codex never calls the claude CLI", async () => {
  await withHostsHome(async ({ env, paths }) => {
    const install = runHosts(["install", "--hosts=codex"], env);
    assert.equal(install.status, 0, install.stdout + install.stderr);
    assert.deepEqual((await readJsonFile(paths.ownership)).hosts, ["codex"]);
    await stat(paths.codexSource);
    await stat(paths.codexRuntime);
    assert.match(await readFile(env.CODEX_CONFIG_PATH, "utf8"), /\[marketplaces\.cairn\]/);
    await assert.rejects(stat(env.CLAUDE_HOME), "nothing is written under the Claude home and the claude CLI is never run");
    await assert.rejects(stat(paths.claudeMarketplace));
    assert.doesNotMatch(install.stdout, /Claude Code plugin/);

    const upgrade = runHosts(["upgrade"], env);
    assert.equal(upgrade.status, 0, upgrade.stdout + upgrade.stderr);
    const uninstall = runHosts(["uninstall"], env);
    assert.equal(uninstall.status, 0, uninstall.stdout + uninstall.stderr);
    await assert.rejects(stat(env.CLAUDE_HOME));
    await assert.rejects(stat(paths.installRoot));
  });
});

test("upgrade follows the recorded host selection", async () => {
  await withHostsHome(async ({ env, paths }) => {
    assert.equal(runHosts(["install", "--hosts", "claude,antigravity"], env).status, 0);
    const upgrade = runHosts(["upgrade"], env);
    assert.equal(upgrade.status, 0, upgrade.stdout + upgrade.stderr);
    const ownership = await readJsonFile(paths.ownership);
    assert.deepEqual(ownership.hosts, ["claude", "antigravity"]);
    assert.ok(!ownership.targets.some((record) => ["codex-source", "codex-runtime", "marketplace", "codex-config"].includes(record.id)));
    await stat(paths.ideSkill);
    await stat(paths.claudeCommand);
    await assert.rejects(stat(paths.codexCache));
    await assert.rejects(stat(paths.codexMarketplace));
    assert.deepEqual(await readdir(env.CODEX_HOME), ["config.toml"]);
  });
});

test("upgrade --hosts adds a host and removes a deselected host", async () => {
  await withHostsHome(async ({ env, paths }) => {
    assert.equal(runHosts(["install"], env).status, 0);

    const withoutClaude = runHosts(["upgrade", "--hosts", "codex,antigravity"], env);
    assert.equal(withoutClaude.status, 0, withoutClaude.stdout + withoutClaude.stderr);
    assert.deepEqual((await readJsonFile(paths.ownership)).hosts, ["codex", "antigravity"]);
    for (const path of [paths.claudeCommand, paths.claudeLocator, join(env.CLAUDE_HOME, "agents", "cairn-worker.md"), paths.claudeMarketplace]) {
      await assert.rejects(stat(path), path);
    }
    assert.deepEqual(await readJsonFile(paths.claudeState), { marketplaces: [], plugins: [] });
    const log = (await readFile(paths.claudeLog, "utf8")).trim().split("\n");
    const uninstalled = log.indexOf("plugin uninstall cairn@cairn --scope user");
    assert.ok(uninstalled >= 0 && log.indexOf("plugin marketplace remove cairn") > uninstalled, log.join("\n"));
    await stat(paths.codexSource);
    await stat(paths.ideSkill);

    const onlyClaude = runHosts(["upgrade", "--hosts", "claude"], env);
    assert.equal(onlyClaude.status, 0, onlyClaude.stdout + onlyClaude.stderr);
    const ownership = await readJsonFile(paths.ownership);
    assert.deepEqual(ownership.hosts, ["claude"]);
    assert.ok(ownership.targets.every((record) => record.id === "runtime" || record.id.startsWith("claude-")));
    await stat(paths.claudeCommand);
    const state = await readJsonFile(paths.claudeState);
    assert.equal(state.marketplaces[0].path, paths.claudeMarketplace);
    assert.equal(state.plugins[0].id, "cairn@cairn");
    for (const path of [paths.codexMarketplace, paths.codexCache, dirname(paths.ideSkill), paths.cliSkill]) {
      await assert.rejects(stat(path), path);
    }
    const config = await readFile(env.CODEX_CONFIG_PATH, "utf8");
    assert.match(config, /\[profiles\.default\]\nmodel = "gpt-5"/);
    assert.doesNotMatch(config, /cairn/);

    const doctor = runHosts(["doctor"], env);
    assert.equal(doctor.status, 0, doctor.stdout + doctor.stderr);
  });
});

test("deselecting a host with a modified artifact is refused and changes nothing", async () => {
  await withHostsHome(async ({ env, paths }) => {
    assert.equal(runHosts(["install"], env).status, 0);
    await writeFile(paths.claudeCommand, "user edit\n");
    const ownershipBefore = await readFile(paths.ownership, "utf8");
    const stateBefore = await readFile(paths.claudeState, "utf8");
    const logBefore = await readFile(paths.claudeLog, "utf8");

    const upgrade = runHosts(["upgrade", "--hosts", "codex,antigravity"], env);
    assert.equal(upgrade.status, 1, upgrade.stdout + upgrade.stderr);
    assert.match(upgrade.stderr, /Managed artifact was modified/);
    assert.equal(await readFile(paths.claudeCommand, "utf8"), "user edit\n");
    assert.equal(await readFile(paths.ownership, "utf8"), ownershipBefore);
    assert.equal(await readFile(paths.claudeState, "utf8"), stateBefore);
    assert.equal(await readFile(paths.claudeLog, "utf8"), logBefore, "the claude CLI is not called for a refused deselection");
    await stat(paths.claudeMarketplace);
    await assert.rejects(stat(join(paths.installRoot, "transaction.json")));
  });
});

test("a rollback after Claude deselection re-registers the plugin", async () => {
  await withHostsHome(async ({ env, paths }) => {
    assert.equal(runHosts(["install"], env).status, 0);
    const ownershipBefore = await readFile(paths.ownership, "utf8");
    const commandBefore = await readFile(paths.claudeCommand, "utf8");

    const upgrade = runHosts(["upgrade", "--hosts", "codex,antigravity"], { ...env, CAIRN_TEST_FAIL_PHASE: "after-cleanup" });
    assert.equal(upgrade.status, 1, upgrade.stdout + upgrade.stderr);
    assert.match(upgrade.stderr, /Injected lifecycle failure: after-cleanup/);
    assert.equal(await readFile(paths.ownership, "utf8"), ownershipBefore);
    assert.equal(await readFile(paths.claudeCommand, "utf8"), commandBefore);
    await stat(join(paths.claudeMarketplace, "cairn", "hooks", "hooks.json"));
    const log = (await readFile(paths.claudeLog, "utf8")).trim().split("\n");
    const uninstalled = log.lastIndexOf("plugin uninstall cairn@cairn --scope user");
    assert.ok(uninstalled >= 0, log.join("\n"));
    assert.ok(log.lastIndexOf("plugin install cairn@cairn --scope user") > uninstalled, log.join("\n"));
    const state = await readJsonFile(paths.claudeState);
    assert.equal(state.marketplaces[0].path, paths.claudeMarketplace);
    assert.equal(state.plugins[0].id, "cairn@cairn");
    await assert.rejects(stat(join(paths.installRoot, "transaction.json")));
  });
});

test("an interactive install prompts once and records the choice", async () => {
  await withHostsHome(async ({ env, paths }) => {
    const install = runHosts(["install"], { ...env, CAIRN_TEST_HOSTS_PROMPT_TTY: "1" }, "2\n");
    assert.equal(install.status, 0, install.stdout + install.stderr);
    assert.equal(occurrences(install.stdout, promptHeadingEn), 1, install.stdout);
    assert.equal(occurrences(install.stdout, promptQuestionEn), 1, install.stdout);
    assert.ok(install.stdout.includes("Selected hosts: Claude Code. To change later: cairn install --hosts <list>"), install.stdout);
    assert.deepEqual((await readJsonFile(paths.ownership)).hosts, ["claude"]);
    await assert.rejects(stat(paths.codexCache));
  });
});

test("the prompt re-asks on invalid input and exits 1 after three attempts without mutation", async () => {
  await withHostsHome(async ({ env, paths }) => {
    const result = runHosts(["install"], { ...env, CAIRN_TEST_HOSTS_PROMPT_TTY: "1" }, "9\nfoo\ncodex,codex\n2\n");
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.equal(result.stderr, "Cairn lifecycle error: No valid host selection was entered.\n");
    assert.equal(occurrences(result.stdout, promptQuestionEn), 3, result.stdout);
    await assert.rejects(stat(env.CAIRN_HOME));
    await assert.rejects(stat(paths.codexCache));
    await assert.rejects(stat(env.CLAUDE_HOME));
  });
});

test("EOF at the prompt exits 1", async () => {
  await withHostsHome(async ({ env, paths }) => {
    const result = runHosts(["install"], { ...env, CAIRN_TEST_HOSTS_PROMPT_TTY: "1" }, "");
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.equal(result.stderr, "Cairn lifecycle error: No valid host selection was entered.\n");
    await assert.rejects(stat(env.CAIRN_HOME));
    await assert.rejects(stat(paths.codexCache));
  });
});

test("no prompt for upgrade, for an existing manifest, for --hosts, without a TTY, or when CI is set", async () => {
  const assertNoPrompt = (result) => {
    assert.ok(!result.stdout.includes(promptHeadingEn), result.stdout);
    assert.ok(!result.stdout.includes("Selected hosts:"), result.stdout);
  };
  await withHostsHome(async ({ env, paths }) => {
    const tty = { ...env, CAIRN_TEST_HOSTS_PROMPT_TTY: "1" };
    const explicit = runHosts(["install", "--hosts", "codex"], tty, "2\n");
    assert.equal(explicit.status, 0, explicit.stdout + explicit.stderr);
    assertNoPrompt(explicit);
    for (const command of ["install", "upgrade"]) {
      const result = runHosts([command], tty, "2\n");
      assert.equal(result.status, 0, `${command}\n${result.stdout}${result.stderr}`);
      assertNoPrompt(result);
      assert.deepEqual((await readJsonFile(paths.ownership)).hosts, ["codex"], command);
    }
  });
  await withHostsHome(async ({ env, paths }) => {
    const result = runHosts(["upgrade"], { ...env, CAIRN_TEST_HOSTS_PROMPT_TTY: "1" }, "2\n");
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assertNoPrompt(result);
    assert.deepEqual((await readJsonFile(paths.ownership)).hosts, HOSTS);
  });
  await withHostsHome(async ({ env, paths }) => {
    const result = runHosts(["install"], { ...env, CAIRN_TEST_HOSTS_PROMPT_TTY: "1", CI: "true" }, "2\n");
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assertNoPrompt(result);
    assert.deepEqual((await readJsonFile(paths.ownership)).hosts, HOSTS);
  });
  await withHostsHome(async ({ env }) => {
    // A legacy (0.6.0-layout) manifest also suppresses the prompt; this one is invalid, so install then fails closed.
    const legacyManifest = join(env.CODEX_HOME, "plugins", "cache", "cairn", ".cairn", "lifecycle.json");
    await mkdir(dirname(legacyManifest), { recursive: true });
    await writeFile(legacyManifest, "{}\n");
    const result = runHosts(["install"], { ...env, CAIRN_TEST_HOSTS_PROMPT_TTY: "1" }, "");
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assertNoPrompt(result);
    assert.doesNotMatch(result.stderr, /No valid host selection/);
  });
});

test("a manifest whose hosts are empty, unordered, unknown, or inconsistent with its targets fails closed", async () => {
  await withHostsHome(async ({ env, paths }) => {
    assert.equal(runHosts(["install"], env).status, 0);
    const installed = await readFile(paths.ownership, "utf8");
    const protectedFile = join(paths.runtime, "package.json");
    const before = await readFile(protectedFile, "utf8");
    const withoutHost = (ownership, host) => {
      const prefixes = { codex: /^(?:codex-|marketplace$)/, antigravity: /^(?:ide|cli)-/ }[host];
      ownership.targets = ownership.targets.filter((record) => !prefixes.test(record.id));
    };
    const retainedCodex = (ownership) => ({
      id: "codex-runtime", version: "0.1.0", path: join(paths.codexCache, "cairn", "0.1.0"),
      installedDigest: ownership.targets.find((record) => record.id === "runtime").installedDigest, retiredAt: new Date().toISOString(),
    });
    for (const [change, expected] of [
      [(ownership) => { ownership.hosts = []; }, /Ownership manifest schema/],
      [(ownership) => { ownership.hosts = ["claude", "codex", "antigravity"]; }, /Ownership manifest schema/],
      [(ownership) => { ownership.hosts = ["codex", "claude", "gemini"]; }, /Ownership manifest schema/],
      [(ownership) => { ownership.hosts = "codex,claude,antigravity"; }, /Ownership manifest schema/],
      [(ownership) => { ownership.hosts = ["codex", "claude"]; }, /Ownership manifest schema/],
      [(ownership) => { withoutHost(ownership, "antigravity"); }, /complete managed target set/],
      [(ownership) => { ownership.hosts = ["claude", "antigravity"]; withoutHost(ownership, "codex"); ownership.retained = [retainedCodex(ownership)]; }, /invalid retained runtime/],
    ]) {
      const ownership = JSON.parse(installed);
      change(ownership);
      await writeFile(paths.ownership, `${JSON.stringify(ownership, null, 2)}\n`);
      for (const command of ["upgrade", "uninstall"]) {
        const result = runHosts([command], env);
        assert.equal(result.status, 1, `${command}: ${result.stdout}${result.stderr}`);
        assert.match(result.stderr, expected, `${command}: ${JSON.stringify(ownership.hosts)}`);
      }
      const doctor = runHosts(["doctor"], env);
      assert.match(doctor.stdout, /^FAIL ownership digests$/m);
      assert.equal(await readFile(protectedFile, "utf8"), before);
    }
  });
});

test("doctor checks only the selected hosts and prints the selection", async () => {
  await withHostsHome(async ({ env }) => {
    assert.equal(runHosts(["install", "--hosts", "claude"], env).status, 0);
    const doctor = runHosts(["doctor"], env);
    const lines = doctor.stdout.trim().split("\n");
    assert.equal(lines[0], "Hosts: claude");
    assert.equal(doctor.status, 0, doctor.stdout + doctor.stderr);
    for (const name of ["ownership manifest", "ownership digests", "canonical runtime", "installed runtime locator", "Claude plugin registered", "Claude plugin cache version"]) {
      assert.ok(lines.includes(`OK ${name}`), `${name}\n${doctor.stdout}`);
    }
    assert.ok(!lines.some((line) => /Codex|Antigravity|config|versioned runtime|marketplace|hooks/.test(line)), doctor.stdout);
  });
  await withHostsHome(async ({ env }) => {
    const doctor = runHosts(["doctor"], env);
    assert.equal(doctor.stdout.split("\n")[0], "Hosts: codex,claude,antigravity");
    assert.match(doctor.stdout, /^FAIL ownership manifest$/m);
  });
});

function claudePluginEnv(temp) {
  return {
    ...process.env,
    CAIRN_HOME: join(temp, "cairn-home"),
    CODEX_HOME: join(temp, "codex"),
    CLAUDE_HOME: join(temp, "claude"),
    CAIRN_CLAUDE_CLI: fakeClaudeCli,
    ANTIGRAVITY_HOME: join(temp, "agents"),
    ANTIGRAVITY_CLI_HOME: join(temp, "antigravity-cli"),
    HOME: join(temp, "home"),
    CODEX_CONFIG_PATH: join(temp, "codex", "config.toml"),
  };
}
