import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { message } from "../scripts/cairn.mjs";
import {
  hookHash,
  pathHasSegment,
  removeCairnConfig,
  shouldCopyPluginPath,
  splitSections,
  updateConfig,
} from "../scripts/cairn-lifecycle.mjs";
import { runState, runStateResult } from "../scripts/cairn-state.mjs";

const root = resolve(".");
const lifecycleScript = join(root, "scripts", "cairn-lifecycle.mjs");
const stateScript = join(root, "scripts", "cairn-state.mjs");
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
    assert.match(message("plan", "en-US"), /Every agent.*project-root MEMORY\.md/);
    assert.match(message("plan", "en-US"), /Light\/Heavy Path triage/);
    assert.match(message("plan", "en-US"), /whole work.*tasks and sub-tasks/i);
    assert.match(message("plan", "ko-KR"), /전체 작업.*task.*sub-task/);
    assert.match(message("work", "ko-KR"), /모든 에이전트.*MEMORY\.md/);
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
    assert.match(plan, /Every agent.*project-root `MEMORY\.md`/);
    assert.match(plan, /Run complexity triage/);
    assert.match(plan, /checked Heavy Path signals/);
    assert.match(plan, /generated or updated documentation, plans, and memory artifacts/i);

    const outputKo = await runState("manual", { root: tempKo, locale: "ko-KR" });
    assert.equal(outputKo, "Cairn이 MEMORY.md, PLAN.md, docs/memory, docs/plan을 초기화했습니다.");
    const memoryKo = await readFile(join(tempKo, "MEMORY.md"), "utf8");
    const planKo = await readFile(join(tempKo, "PLAN.md"), "utf8");
    assert.match(memoryKo, /문서, 계획, 메모리 산출물/);
    assert.match(planKo, /복잡도 트리아지/);
    assert.match(planKo, /문서, 계획, 메모리 산출물/);

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

test("install doctor uninstall lifecycle uses isolated homes", async () => {
  const temp = await mkdtemp(join(tmpdir(), "cairn-lifecycle-"));
  const env = {
    ...process.env,
    CODEX_HOME: join(temp, "codex"),
    CLAUDE_HOME: join(temp, "claude"),
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

    const manifestPath = join(env.CODEX_HOME, "plugins", "cache", "cairn", "cairn", "0.2.5", ".codex-plugin", "plugin.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    assert.equal(manifest.hooks, "./hooks/hooks.json");
    const kernel = manifest.interface.defaultPrompt.join("\n");
    assert.equal(manifest.interface.defaultPrompt.length, 7);
    assert.ok(kernel.length <= 1600, `installed default prompt is ${kernel.length} chars`);
    assert.match(kernel, /every agent reads root MEMORY\.md/i);
    assert.match(kernel, /load the phase skill.*restore the active plan and current-task references/i);
    assert.match(kernel, /compaction, restart, handoff, or delegation.*MEMORY\.md → phase skill → active plan → current task references/i);
    assert.match(kernel, /missing, unreadable, or inconsistent.*fail closed.*do not edit, delegate, or complete/i);
    assert.match(kernel, /missing, failed, skipped, stale, or placeholder evidence never completes work/i);
    assert.match(kernel, /external-state changes.*dry-run\/check.*current task/i);
    assert.match(kernel, /side questions.*resume the current task.*pause, stop, or switch/i);
    const explorer = await readFile(join(env.CODEX_HOME, "plugins", "cache", "cairn", "plugins", "cairn", "agents", "explorer.md"), "utf8");
    const worker = await readFile(join(env.CODEX_HOME, "plugins", "cache", "cairn", "plugins", "cairn", "agents", "worker.md"), "utf8");
    const installedPlan = await readFile(join(env.CODEX_HOME, "plugins", "cache", "cairn", "plugins", "cairn", "skills", "cairn-plan", "SKILL.md"), "utf8");
    const installedWork = await readFile(join(env.CODEX_HOME, "plugins", "cache", "cairn", "plugins", "cairn", "skills", "cairn-work", "SKILL.md"), "utf8");
    assert.match(explorer, /root `MEMORY\.md` → the phase skill.*active plan.*current-task references/i);
    assert.match(explorer, /recursively delegate bounded read-only sub-tasks to subagents/);
    assert.match(worker, /root `MEMORY\.md` → the phase skill.*active plan.*current-task references/i);
    assert.match(worker, /recursively delegate bounded sub-tasks to subagents/);
    assert.match(installedPlan, /initial plan.*triage-plan.*not implementation-ready/i);
    assert.match(installedPlan, /update_plan.*create_goal/i);
    assert.match(installedPlan, /user-called\/main agent as the orchestrator/i);
    assert.match(installedWork, /test contract first.*requirements, invariants, boundaries, and failure modes/i);
    assert.match(installedWork, /npm pack --dry-run/i);
    await stat(join(env.CLAUDE_HOME, "commands", "cairn-plan.md"));
    await stat(join(env.ANTIGRAVITY_HOME, "skills", "cairn-plan", "SKILL.md"));
    const antigravityWork = await readFile(join(env.ANTIGRAVITY_HOME, "workflows", "cairn-work.md"), "utf8");
    assert.match(antigravityWork, /side question.*resume the previous active work/i);

    const uninstall = runLifecycle("uninstall", env);
    assert.equal(uninstall.status, 0, uninstall.stderr);
    const removedConfig = await readFile(env.CODEX_CONFIG_PATH, "utf8");
    assert.match(removedConfig, /\[profiles\.default\]/);
    assert.doesNotMatch(removedConfig, /marketplaces\.cairn/);

    await assert.rejects(stat(join(env.CODEX_HOME, "plugins", "cache", "cairn", "plugins", "cairn")));
    await assert.rejects(stat(join(env.CODEX_HOME, "plugins", "cache", "cairn", ".cairn", "lifecycle.json")));
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

function hostToolsAvailable() {
  return commandAvailable("codex") && commandAvailable("agy");
}

function commandAvailable(command) {
  const result = spawnSync(command, ["--version"], { encoding: "utf8" });
  return result.error === undefined && result.status === 0;
}
