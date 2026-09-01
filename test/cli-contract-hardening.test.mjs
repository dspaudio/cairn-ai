import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const rootCli = resolve("scripts", "cairn.mjs");
const toolcheckCli = resolve("scripts", "cairn-toolcheck.mjs");
const { version } = JSON.parse(await readFile("package.json", "utf8"));
const usage = "Usage: cairn install|upgrade|doctor|uninstall|cleanup|init|memory|plan|work|review|toolcheck|goal|task\n";
const toolcheckUsage = "Usage: cairn toolcheck [--root PATH] [--json] [--install --yes]\n";

function run(script, args, options = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: options.cwd ?? resolve("."),
    encoding: "utf8",
    env: options.env ?? process.env,
    timeout: 5_000,
  });
}

function assertExit(result, expected) {
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, expected.status);
  assert.equal(result.stdout, expected.stdout);
  assert.equal(result.stderr, expected.stderr);
}

test("root help and version exit successfully without dispatching work", () => {
  assertExit(run(rootCli, ["--help"]), { status: 0, stdout: usage, stderr: "" });
  assertExit(run(rootCli, ["help"]), { status: 0, stdout: usage, stderr: "" });
  assertExit(run(rootCli, ["--version"]), { status: 0, stdout: `cairn ${version}\n`, stderr: "" });
  assertExit(run(rootCli, ["version"]), { status: 0, stdout: `cairn ${version}\n`, stderr: "" });
});

test("root rejects unknown commands and reports parser failures without stack traces", () => {
  assertExit(run(rootCli, ["unknown"]), { status: 2, stdout: "", stderr: "Cairn error: unknown command: unknown\n" });

  for (const [args, message] of [
    [["init", "--root"], "--root requires a path"],
    [["init", "--root", ".", "--root=elsewhere"], "--root may only be provided once"],
  ]) {
    const result = run(rootCli, args);
    assertExit(result, { status: 2, stdout: "", stderr: `Cairn error: ${message}\n` });
    assert.doesNotMatch(result.stderr, /\n\s+at |file:\/\/|Node\.js v/);
  }
});

test("toolcheck help and version exit successfully without running checks", async () => {
  const root = await mkdtemp(join(tmpdir(), "cairn-cli-help-"));
  try {
    await writeFile(join(root, "package.json"), "{}\n");
    const env = { ...process.env, PATH: "" };

    assertExit(run(toolcheckCli, ["--help", "--root", root], { env }), { status: 0, stdout: toolcheckUsage, stderr: "" });
    assertExit(run(toolcheckCli, ["--version", "--root", root], { env }), { status: 0, stdout: `cairn ${version}\n`, stderr: "" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("toolcheck rejects unknown, duplicate, and missing-value options", () => {
  for (const [args, message] of [
    [["--unknown"], "unknown option: --unknown"],
    [["unexpected"], "unknown option: unexpected"],
    [["--install", "--install"], "--install may only be provided once"],
    [["--root=one", "--root", "two"], "--root may only be provided once"],
    [["--root"], "--root requires a path"],
    [["--root="], "--root requires a path"],
  ]) {
    assertExit(run(toolcheckCli, args), { status: 2, stdout: "", stderr: `Cairn toolcheck error: ${message}\n` });
  }
});

test("toolcheck emits a stable JSON usage error when JSON was requested", () => {
  const expected = `${JSON.stringify({
    schemaVersion: 1,
    error: {
      code: "CLI_USAGE",
      message: "unknown option: --unknown",
    },
  }, null, 2)}\n`;

  assertExit(run(toolcheckCli, ["--json", "--unknown"]), { status: 2, stdout: expected, stderr: "" });
});

test("toolcheck successful JSON report shape remains unchanged", async () => {
  const root = await mkdtemp(join(tmpdir(), "cairn-cli-json-"));
  try {
    const result = run(toolcheckCli, ["--json", "--root", root]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    assert.deepEqual(JSON.parse(result.stdout), {
      schemaVersion: 1,
      root,
      timeoutMs: 10_000,
      detected: [],
      install: {
        requested: false,
        confirmed: false,
        refused: false,
        refusalReason: null,
      },
      results: [],
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("goal and task status expose the same stable no-state contract", async () => {
  const root = await mkdtemp(join(tmpdir(), "cairn-cli-no-state-"));
  const stateHome = await mkdtemp(join(tmpdir(), "cairn-cli-no-state-home-"));
  try {
    const env = { ...process.env, CAIRN_HOME: stateHome };
    assertExit(run(rootCli, ["goal", "status", "--root", root], { env }), {
      status: 0,
      stdout: "null\n",
      stderr: "",
    });
    assertExit(run(rootCli, ["task", "status", "--root", root], { env }), {
      status: 0,
      stdout: "null\n",
      stderr: "",
    });
    assertExit(run(rootCli, ["task", "status", "--quiet", "--root", root], { env }), {
      status: 0,
      stdout: "null\n",
      stderr: "",
    });
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(stateHome, { recursive: true, force: true });
  }
});

test("task status returns the active task or a requested task", async () => {
  const root = await mkdtemp(join(tmpdir(), "cairn-cli-task-status-"));
  const stateHome = await mkdtemp(join(tmpdir(), "cairn-cli-task-status-home-"));
  try {
    const env = { ...process.env, CAIRN_HOME: stateHome };
    const started = run(rootCli, [
      "goal", "start",
      "--root", root,
      "--goal", "status contract",
      "--plan", "plan-status",
      "--tasks", JSON.stringify([{ id: "first", title: "First" }, { id: "second", title: "Second" }]),
      "--criteria", "status visible",
      "--requiredEvidence", "test",
    ], { env });
    assert.equal(started.status, 0, started.stderr);

    const current = run(rootCli, ["task", "status", "--root", root], { env });
    assert.equal(current.status, 0, current.stderr);
    assert.equal(JSON.parse(current.stdout).id, "first");
    const quietCurrent = run(rootCli, ["task", "status", "--quiet", "--root", root], { env });
    assert.equal(quietCurrent.status, 0, quietCurrent.stderr);
    assert.equal(JSON.parse(quietCurrent.stdout).id, "first");

    const requested = run(rootCli, ["task", "status", "second", "--root", root], { env });
    assert.equal(requested.status, 0, requested.stderr);
    assert.equal(JSON.parse(requested.stdout).id, "second");
    const quietRequested = run(rootCli, ["task", "status", "second", "--quiet", "--root", root], { env });
    assert.equal(quietRequested.status, 0, quietRequested.stderr);
    assert.equal(JSON.parse(quietRequested.stdout).id, "second");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(stateHome, { recursive: true, force: true });
  }
});
