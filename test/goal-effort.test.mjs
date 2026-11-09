import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  assignTask,
  evaluateStop,
  finishGoal,
  goalStatePath,
  goalStats,
  handleGoalCli,
  readGoalState,
  recordReceipt,
  replanGoal,
  setTaskStatus,
  startGoal,
} from "../scripts/cairn-goal.mjs";
import { runStateResult } from "../scripts/cairn-state.mjs";

const cliScript = resolve("scripts/cairn.mjs");

test("goal assign stores effort, source, and route and infers the source from the effort", async () => {
  await withTempRoot(async (root) => {
    const started = await startHeavyGoal(root);
    assert.deepEqual(pickEffort(started.tasks[0]), { route: "heavy", effort: null, effortSource: null, effortWaiver: null });
    assert.equal(started.tasks[1].route, null);

    let state = await assignTask({ root, taskId: "heavy", agentId: "worker-1", effort: "high" });
    assert.deepEqual(pickEffort(task(state, "heavy")), { route: "heavy", effort: "high", effortSource: "host-option", effortWaiver: null });

    state = await assignTask({ root, taskId: "heavy", agentId: "worker-1", effort: "inherited" });
    assert.equal(task(state, "heavy").effortSource, "inherited");

    state = await assignTask({ root, taskId: "heavy", agentId: "worker-1", effort: "xhigh", effortSource: "not-applied" });
    assert.deepEqual(pickEffort(task(state, "heavy")), { route: "heavy", effort: "xhigh", effortSource: "not-applied", effortWaiver: null });

    state = await assignTask({ root, taskId: "heavy", agentId: "worker-1", effortSource: "not-applied" });
    assert.equal(task(state, "heavy").effort, null);
    assert.equal(task(state, "heavy").effortSource, "not-applied");

    state = await assignTask({ root, taskId: "heavy", agentId: "worker-1", effort: "max", effortSource: "host-option" });
    // Reassigning only the agent keeps the recorded effort and route.
    state = await assignTask({ root, taskId: "heavy", agentId: "worker-2" });
    assert.equal(task(state, "heavy").assignedAgentId, "worker-2");
    assert.deepEqual(pickEffort(task(state, "heavy")), { route: "heavy", effort: "max", effortSource: "host-option", effortWaiver: null });

    state = await assignTask({ root, taskId: "light", agentId: "worker-3", route: "light", effortWaiver: "host has no effort option" });
    assert.deepEqual(pickEffort(task(state, "light")), { route: "light", effort: null, effortSource: null, effortWaiver: "host has no effort option" });
  });
});

test("goal assign rejects invalid effort, source, and route combinations without changing state", async () => {
  await withTempRoot(async (root) => {
    await startHeavyGoal(root);
    const rejected = [
      [{ effort: "inherited", effortSource: "host-option" }, /effort inherited requires effortSource inherited/],
      [{ effort: "inherited", effortSource: "not-applied" }, /effort inherited requires effortSource inherited/],
      [{ effortSource: "host-option" }, /--effort-source requires --effort unless it is not-applied/],
      [{ effortSource: "inherited" }, /--effort-source requires --effort unless it is not-applied/],
      [{ effort: "extreme" }, /effort must be one of/],
      [{ effort: "high", effortSource: "guessed" }, /effortSource must be one of/],
      [{ route: "medium" }, /route must be one of: light, heavy/],
      [{ effortWaiver: "  " }, /effortWaiver must be a non-empty string/],
    ];
    for (const [options, pattern] of rejected) {
      await assert.rejects(assignTask({ root, taskId: "heavy", agentId: "worker-1", ...options }), pattern);
    }
    const state = await readGoalState({ root });
    assert.equal(task(state, "heavy").assignedAgentId, null);
    assert.deepEqual(pickEffort(task(state, "heavy")), { route: "heavy", effort: null, effortSource: null, effortWaiver: null });
  });
});

test("an assigned Heavy task cannot complete without an applied effort unless a waiver reason is recorded", async () => {
  for (const [label, options] of [
    ["missing", {}],
    ["not-applied", { effort: "high", effortSource: "not-applied" }],
    ["inherited", { effort: "inherited" }],
  ]) {
    await withTempRoot(async (root) => {
      await startHeavyGoal(root);
      await assignTask({ root, taskId: "heavy", agentId: "worker-1", ...options });
      await recordTaskEvidence(root, "heavy");
      await assert.rejects(
        setTaskStatus({ root, taskId: "heavy", status: "completed" }),
        /Heavy task heavy assigned to worker-1 has no applied effort.*goal assign heavy --effort .* --effort-source host-option.*--allow-inherited-effort <reason>/,
        label,
      );
      assert.equal(task(await readGoalState({ root }), "heavy").status, "active", label);
      await assert.rejects(setTaskStatus({ root, taskId: "heavy", status: "blocked", blocker: "x", effortWaiver: "reason" }), /applies only when completing/);
      const completed = await setTaskStatus({ root, taskId: "heavy", status: "completed", effortWaiver: "host exposes no per-agent effort" });
      assert.equal(task(completed, "heavy").status, "completed", label);
      assert.equal(task(completed, "heavy").effortWaiver, "host exposes no per-agent effort", label);
    });
  }
});

test("Heavy completion passes with host-option effort or an assign waiver and ignores Light and unassigned tasks", async () => {
  await withTempRoot(async (root) => {
    await startHeavyGoal(root);
    await assignTask({ root, taskId: "heavy", agentId: "worker-1", effort: "xhigh", effortSource: "host-option" });
    await recordTaskEvidence(root, "heavy");
    await setTaskStatus({ root, taskId: "heavy", status: "completed" });
    // Light task assigned without effort completes as before.
    await assignTask({ root, taskId: "light", agentId: "worker-2" });
    await recordTaskEvidence(root, "light");
    const state = await setTaskStatus({ root, taskId: "light", status: "completed" });
    assert.equal(task(state, "light").status, "completed");
  });
  await withTempRoot(async (root) => {
    await startHeavyGoal(root);
    await assignTask({ root, taskId: "heavy", agentId: "worker-1", effort: "inherited", effortWaiver: "Codex worker inherits session effort" });
    await recordTaskEvidence(root, "heavy");
    await setTaskStatus({ root, taskId: "heavy", status: "completed" });
  });
  await withTempRoot(async (root) => {
    // The main agent performs an unassigned Heavy task directly.
    await startHeavyGoal(root);
    await recordTaskEvidence(root, "heavy");
    await setTaskStatus({ root, taskId: "heavy", status: "completed" });
  });
});

test("goal finish applies the Heavy effort check when it completes the active task", async () => {
  await withTempRoot(async (root) => {
    await startGoal({
      root,
      goal: "Finish a Heavy task",
      planId: "docs/plan/effort-finish.md",
      evidencePolicy: "declared",
      tasks: [{ id: "heavy", title: "Heavy task", route: "heavy" }],
    });
    await assignTask({ root, taskId: "heavy", agentId: "worker-1", effort: "high", effortSource: "not-applied" });
    await recordTaskEvidence(root, "heavy");
    await assert.rejects(finishGoal({ root, argv: [process.execPath, "-e", "process.exit(0)"] }), /Heavy task heavy .* no applied effort/);
    assert.equal(task(await readGoalState({ root }), "heavy").status, "active");
  });
});

test("goal stats lists task route and effort records", async () => {
  await withTempRoot(async (root) => {
    await startHeavyGoal(root);
    await assignTask({ root, taskId: "heavy", agentId: "worker-1", effort: "inherited", effortWaiver: "no host option" });
    const stats = goalStats(await readGoalState({ root }), root);
    assert.deepEqual(stats.tasks, [
      { id: "heavy", status: "active", route: "heavy", effort: "inherited", effortSource: "inherited", effortWaiver: "no host option" },
      { id: "light", status: "pending", route: null, effort: null, effortSource: null },
    ]);
  });
});

test("Stop and SubagentStop warn when an assigned active task has no recorded effort source", async () => {
  await withTempRoot(async (root) => {
    await startHeavyGoal(root);
    let state = await readGoalState({ root });
    assert.doesNotMatch(evaluateStop(state).reason, /Effort unrecorded/);

    await assignTask({ root, taskId: "heavy", agentId: "worker-1" });
    state = await readGoalState({ root });
    assert.match(evaluateStop(state).reason, / Effort unrecorded for assigned task heavy: record goal assign --effort\/--effort-source\.$/);
    assert.match(evaluateStop(state, { subagent: true, agentId: "worker-1" }).reason, /Effort unrecorded for assigned task heavy/);
    const hook = await runStateResult("subagent-stop", { root, locale: "en-US", payload: { cwd: root, agent_id: "worker-1", turn_id: "t1" } });
    assert.match(hook.hookOutput.reason, /Effort unrecorded for assigned task heavy/);

    await assignTask({ root, taskId: "heavy", agentId: "worker-1", effort: "high" });
    state = await readGoalState({ root });
    assert.doesNotMatch(evaluateStop(state).reason, /Effort unrecorded/);
    assert.doesNotMatch(evaluateStop(state, { subagent: true, agentId: "worker-1" }).reason, /Effort unrecorded/);
  });
});

test("goal state without effort fields stays valid and keeps completing tasks", async () => {
  await withTempRoot(async (root) => {
    await startHeavyGoal(root);
    const path = goalStatePath(root);
    const legacy = JSON.parse(await readFile(path, "utf8"));
    for (const item of legacy.tasks) {
      delete item.route;
      delete item.effort;
      delete item.effortSource;
      delete item.effortWaiver;
    }
    await writeFile(path, `${JSON.stringify(legacy, null, 2)}\n`);
    const loaded = await readGoalState({ root });
    assert.equal("effort" in task(loaded, "heavy"), false);
    assert.deepEqual(goalStats(loaded, root).tasks[0], { id: "heavy", status: "active", route: null, effort: null, effortSource: null });
    await assignTask({ root, taskId: "heavy", agentId: "worker-1" });
    await recordTaskEvidence(root, "heavy");
    const completed = await setTaskStatus({ root, taskId: "heavy", status: "completed" });
    assert.equal(task(completed, "heavy").status, "completed");

    const invalid = JSON.parse(await readFile(path, "utf8"));
    invalid.tasks[1].effort = "inherited";
    invalid.tasks[1].effortSource = "host-option";
    await writeFile(path, `${JSON.stringify(invalid, null, 2)}\n`);
    await assert.rejects(readGoalState({ root }), /effort inherited requires effortSource inherited/);
  });
});

test("goal replan accepts a task route and resets effort records", async () => {
  await withTempRoot(async (root) => {
    await startHeavyGoal(root);
    await assert.rejects(replanGoal({ root, tasks: [{ id: "next", title: "Next", route: "huge" }] }), /route must be one of/);
    const state = await replanGoal({ root, tasks: [{ id: "next", title: "Next", route: "heavy", effort: "high", effortSource: "host-option" }] });
    assert.deepEqual(pickEffort(task(state, "next")), { route: "heavy", effort: null, effortSource: null, effortWaiver: null });
  });
});

test("goal CLI parses effort options, warns on stderr for Heavy tasks, and keeps stdout JSON", async () => {
  await withTempRoot(async (root) => {
    await startHeavyGoal(root);
    const out = [];
    const err = [];
    const io = { stdout: (line) => out.push(line), stderr: (line) => err.push(line) };
    await handleGoalCli(["goal", "assign", "heavy", "worker-1", "--root", root, "--effort", "high"], io);
    assert.deepEqual(pickEffort(task(JSON.parse(out.at(-1)), "heavy")), { route: "heavy", effort: "high", effortSource: "host-option", effortWaiver: null });
    assert.deepEqual(err, []);

    await handleGoalCli(["goal", "assign", "--task", "heavy", "--agent", "worker-1", "--root", root, "--effort=xhigh", "--effort-source", "not-applied"], io);
    assert.equal(err.length, 1);
    assert.match(err[0], /^Cairn warning: Heavy task heavy is assigned without an applied effort \(effort xhigh, source not-applied\)/);

    await handleGoalCli(["goal", "assign", "light", "worker-2", "--root", root, "--route", "light"], io);
    assert.equal(err.length, 1, "Light tasks do not warn");
    await assert.rejects(handleGoalCli(["goal", "assign", "heavy", "--root", root, "--effort-source", "host-option"], io), /requires --effort/);

    await recordTaskEvidence(root, "heavy");
    await assert.rejects(handleGoalCli(["goal", "task", "complete", "heavy", "--root", root], io), /no applied effort/);
    await handleGoalCli(["goal", "task", "complete", "heavy", "--root", root, "--allow-inherited-effort", "host rejected the effort option"], io);
    assert.equal(task(JSON.parse(out.at(-1)), "heavy").effortWaiver, "host rejected the effort option");

    const stats = spawnSync(process.execPath, [cliScript, "goal", "stats", "--root", root], { encoding: "utf8", env: process.env });
    assert.equal(stats.status, 0, stats.stderr);
    assert.equal(JSON.parse(stats.stdout).tasks[0].effortWaiver, "host rejected the effort option");
  });
  await withTempRoot(async (root) => {
    await startHeavyGoal(root);
    const assigned = spawnSync(process.execPath, [cliScript, "goal", "assign", "heavy", "worker-1", "--root", root], { encoding: "utf8", env: process.env });
    assert.equal(assigned.status, 0, assigned.stderr);
    assert.equal(task(JSON.parse(assigned.stdout), "heavy").assignedAgentId, "worker-1");
    assert.match(assigned.stderr, /Cairn warning: Heavy task heavy is assigned without an applied effort \(effort none, source none\)/);
  });
});

async function startHeavyGoal(root) {
  return startGoal({
    root,
    goal: "Enforce dispatch effort",
    planId: "docs/plan/effort.md",
    evidencePolicy: "declared",
    tasks: [{ id: "heavy", title: "Heavy task", route: "heavy" }, { id: "light", title: "Light task" }],
  });
}

async function recordTaskEvidence(root, taskId) {
  for (const kind of ["moduleAcceptance", "surfaceIntegration"]) {
    await recordReceipt({ root, taskId, kind, command: `verify ${taskId} ${kind}`, exitCode: 0 });
  }
}

function task(state, id) {
  return state.tasks.find((item) => item.id === id);
}

function pickEffort(item) {
  return { route: item.route, effort: item.effort, effortSource: item.effortSource, effortWaiver: item.effortWaiver };
}

async function withTempRoot(work) {
  const root = await mkdtemp(join(tmpdir(), "cairn-goal-effort-"));
  const stateHome = `${root}-home`;
  const previousCairnHome = process.env.CAIRN_HOME;
  process.env.CAIRN_HOME = stateHome;
  try {
    await work(root);
  } finally {
    if (previousCairnHome === undefined) delete process.env.CAIRN_HOME;
    else process.env.CAIRN_HOME = previousCairnHome;
    await rm(root, { recursive: true, force: true });
    await rm(stateHome, { recursive: true, force: true });
  }
}
