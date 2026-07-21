import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const sourceRoot = resolve(".");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

test("packed install remains self-contained after the npm package source is removed", async () => {
  const temp = await mkdtemp(join(tmpdir(), "cairn-packed-install-"));
  const packDirectory = join(temp, "pack");
  const prefix = join(temp, "npm prefix");
  const project = join(temp, "target project");
  const nestedProject = join(project, "packages", "app");
  const unrelated = join(temp, "unrelated cwd");
  const env = {
    ...process.env,
    CODEX_HOME: join(temp, "Codex Home"),
    CLAUDE_HOME: join(temp, "Claude Home"),
    ANTIGRAVITY_HOME: join(temp, "Antigravity Home"),
    ANTIGRAVITY_CLI_HOME: join(temp, "Antigravity CLI Home"),
    HOME: join(temp, "Home"),
    CODEX_CONFIG_PATH: join(temp, "config.toml"),
  };
  delete env.npm_config_dry_run;
  delete env.NPM_CONFIG_DRY_RUN;

  try {
    await stat(sourceRoot);
    await Promise.all([
      mkdir(packDirectory, { recursive: true }),
      mkdir(project, { recursive: true }),
      mkdir(join(project, ".git"), { recursive: true }),
      mkdir(nestedProject, { recursive: true }),
      mkdir(unrelated, { recursive: true }),
    ]);
    await writeFile(env.CODEX_CONFIG_PATH, "[profiles.default]\nmodel = \"gpt-5\"\n");

    const packed = run(npmCommand, ["pack", "--ignore-scripts", "--json", "--pack-destination", packDirectory], { cwd: sourceRoot, env });
    assert.equal(packed.status, 0, packed.stderr);
    const packReport = JSON.parse(packed.stdout);
    const packEntry = Array.isArray(packReport)
      ? packReport[0]
      : packReport.filename
        ? packReport
        : Object.values(packReport)[0];
    assert.equal(packEntry.name, "cairn-ai");
    const tarball = join(packDirectory, packEntry.filename);
    await stat(tarball);

    const npmInstall = run(npmCommand, ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--prefix", prefix, tarball], { cwd: temp, env });
    assert.equal(npmInstall.status, 0, npmInstall.stderr);
    const packageRoot = join(prefix, "node_modules", "cairn-ai");
    const packageCli = join(packageRoot, "scripts", "cairn.mjs");

    const lifecycleInstall = run(process.execPath, [packageCli, "install"], { cwd: unrelated, env });
    assert.equal(lifecycleInstall.status, 0, lifecycleInstall.stderr);

    const installedRoot = join(env.CODEX_HOME, "plugins", "cache", "cairn", "plugins", "cairn");
    const installedCli = join(installedRoot, "scripts", "cairn.mjs");
    await stat(join(installedRoot, ".cairn-runtime.json"));
    await rm(packageRoot, { recursive: true, force: true });

    const init = run(process.execPath, [installedCli, "init", "--root", project], { cwd: unrelated, env });
    assert.equal(init.status, 0, init.stderr);
    await stat(join(project, "MEMORY.md"));
    await stat(join(project, "PLAN.md"));
    await assert.rejects(stat(join(project, "scripts")));
    await assert.rejects(stat(join(project, "templates")));
    await assert.rejects(stat(join(project, "docs", "model-guidance")));

    const goal = run(process.execPath, [
      installedCli,
      "goal", "start",
      "--root", project,
      "--goal", "Packed install goal",
      "--plan", "docs/plan/packed.md",
      "--tasks", "Packed task",
      "--session", "packed-session",
    ], { cwd: unrelated, env });
    assert.equal(goal.status, 0, goal.stderr);

    const hook = run(process.execPath, [join(installedRoot, "scripts", "cairn-state.mjs"), "stop"], {
      cwd: unrelated,
      env,
      input: JSON.stringify({ cwd: nestedProject, session_id: "packed-session", turn_id: "packed-turn" }),
    });
    assert.equal(hook.status, 0, hook.stderr);
    const hookOutput = JSON.parse(hook.stdout);
    assert.equal(hookOutput.decision, "block");
    assert.match(hookOutput.reason, /Packed task/);

    const toolcheck = run(process.execPath, [installedCli, "toolcheck", "--json", "--root", project], { cwd: unrelated, env });
    assert.equal(toolcheck.status, 0, toolcheck.stderr);
    const report = JSON.parse(toolcheck.stdout);
    assert.equal(report.root, project);
    assert.deepEqual(report.detected, []);

    const state = JSON.parse(await readFile(join(project, ".cairn", "state.json"), "utf8"));
    assert.equal(state.goal.ownerSessionId, "packed-session");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

function run(command, args, { cwd, env, input } = {}) {
  return spawnSync(command, args, {
    cwd,
    env,
    input,
    encoding: "utf8",
    timeout: 60_000,
  });
}
