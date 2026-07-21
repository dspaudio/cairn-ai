import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  assignTask,
  evaluateStop,
  goalStatePath,
  readGoalState,
  recordReceipt,
  setTaskStatus,
  startGoal,
  transitionGoal,
} from "../scripts/cairn-goal.mjs";
import { runStateResult } from "../scripts/cairn-state.mjs";

const stateScript = resolve("scripts/cairn-state.mjs");
const cliScript = resolve("scripts/cairn.mjs");

test("goal start persists a versioned, bound state atomically", async () => {
  await withTempRoot(async (root) => {
    const state = await startGoal({
      root,
      goal: "Ship the runtime fix",
      planId: "docs/plan/runtime.md",
      tasks: [{ id: "runtime", title: "Implement runtime" }, { id: "verify", title: "Run verification" }],
      completionCriteria: ["All tasks have successful receipts"],
    });

    assert.equal(state.schemaVersion, 1);
    assert.equal(state.goal.status, "active");
    assert.equal(state.tasks[0].status, "active");
    assert.equal(state.tasks[1].status, "pending");
    const text = await readFile(goalStatePath(root), "utf8");
    assert.deepEqual(JSON.parse(text), state);
    const leftovers = await readdir(join(root, ".cairn"));
    assert.equal(leftovers.filter((name) => name.endsWith(".tmp")).length, 0);
  });
});

test("main CLI forwards the goal namespace to the installed runtime command", async () => {
  await withTempRoot(async (root) => {
    const cli = spawnSync(process.execPath, [
      cliScript,
      "goal",
      "start",
      "--root", root,
      "--goal", "CLI goal",
      "--plan", "docs/plan/cli.md",
      "--tasks", "CLI task",
      "--session", "cli-session",
    ], { encoding: "utf8" });
    assert.equal(cli.status, 0, cli.stderr);
    const state = await readGoalState({ root });
    assert.equal(state.goal.title, "CLI goal");
    assert.equal(state.goal.ownerSessionId, "cli-session");
  });
});

test("top-level task CLI accepts action and task id shorthand", async () => {
  await withTempRoot(async (root) => {
    await startGoal({
      root,
      goal: "Task shorthand",
      planId: "docs/plan/task-shorthand.md",
      tasks: [{ id: "only", title: "Only task" }],
    });
    for (const kind of ["moduleAcceptance", "surfaceIntegration"]) {
      await recordReceipt({ root, taskId: "only", kind, command: `verify ${kind}`, exitCode: 0 });
    }

    const cli = spawnSync(process.execPath, [cliScript, "task", "complete", "only", "--root", root], { encoding: "utf8" });
    assert.equal(cli.status, 0, cli.stderr);
    const state = await readGoalState({ root });
    assert.equal(state.tasks[0].status, "completed");
  });
});

test("receipt CLI accepts the kebab-case exit-code option", async () => {
  await withTempRoot(async (root) => {
    await startGoal({
      root,
      goal: "Receipt CLI",
      planId: "docs/plan/receipt-cli.md",
      tasks: [{ id: "receipt", title: "Record receipt" }],
    });

    const cli = spawnSync(process.execPath, [
      cliScript,
      "goal", "receipt",
      "--root", root,
      "--task", "receipt",
      "--kind", "moduleAcceptance",
      "--command", "npm test",
      "--exit-code", "0",
    ], { encoding: "utf8" });

    assert.equal(cli.status, 0, cli.stderr);
    const state = await readGoalState({ root });
    assert.equal(state.receipts[0].exitCode, 0);
    assert.equal(state.receipts[0].kind, "moduleAcceptance");
  });
});

test("receipts fail closed and task completion advances only after successful bound evidence", async () => {
  await withTempRoot(async (root) => {
    const initial = await createTwoTaskGoal(root);
    await assert.rejects(
      setTaskStatus({ root, taskId: "first", status: "completed" }),
      /successful, bound receipt/,
    );
    await assert.rejects(
      recordReceipt({ root, taskId: "first", kind: "moduleAcceptance", command: "npm test", exitCode: 1 }),
      /exitCode must be 0/,
    );
    await assert.rejects(
      recordReceipt({ root, taskId: "first", kind: "moduleAcceptance", command: "tests skipped", exitCode: 0 }),
      /cannot be skipped/,
    );
    await assert.rejects(
      recordReceipt({ root, taskId: "first", kind: "moduleAcceptance", command: "npm test", exitCode: 0, goalId: "wrong" }),
      /goalId does not match/,
    );

    await recordReceipt({ root, taskId: "first", kind: "moduleAcceptance", command: "npm test", exitCode: 0, goalId: initial.goal.id, planId: initial.goal.planId });
    await recordReceipt({ root, taskId: "first", kind: "surfaceIntegration", command: "npm pack --dry-run", exitCode: 0 });
    const afterFirst = await setTaskStatus({ root, taskId: "first", status: "completed" });
    assert.equal(afterFirst.tasks.find((task) => task.id === "second").status, "active");
    await assert.rejects(
      setTaskStatus({ root, taskId: "first", status: "pending" }),
      /Cannot transition task first from completed to pending/,
    );

    await recordReceipt({ root, taskId: "second", kind: "moduleAcceptance", command: "npm test", exitCode: 0 });
    await recordReceipt({ root, taskId: "second", kind: "surfaceIntegration", command: "npm run check", exitCode: 0 });
    await setTaskStatus({ root, taskId: "second", status: "completed" });
    await assert.rejects(
      transitionGoal({ root, status: "completed" }),
      /finalReview/,
    );
    await recordReceipt({ root, scope: "goal", kind: "finalReview", command: "npm run check", exitCode: 0 });
    const completed = await transitionGoal({ root, status: "completed" });
    assert.equal(completed.goal.status, "completed");
  });
});

test("automatic context hooks do not initialize an uninitialized repository", async () => {
  await withTempRoot(async (root) => {
    const session = await runStateResult("session-start", { root, locale: "en-US", payload: { cwd: root, session_id: "s1", turn_id: "t1" } });
    const prompt = await runStateResult("user-prompt-submit", { root, locale: "en-US", payload: { cwd: root, session_id: "s1", turn_id: "t1", prompt: "Implement the requested fix" } });
    assert.match(session.message, /read the project-root MEMORY/);
    assert.match(prompt.message, /read the project-root MEMORY/);
    assert.equal(session.hookOutput.hookSpecificOutput.hookEventName, "SessionStart");
    assert.equal(prompt.hookOutput.hookSpecificOutput.hookEventName, "UserPromptSubmit");
    assert.match(prompt.hookOutput.hookSpecificOutput.additionalContext, /request itself as authorization/i);
    assert.match(prompt.hookOutput.hookSpecificOutput.additionalContext, /even when the user does not mention a goal/i);
    assert.match(prompt.hookOutput.hookSpecificOutput.additionalContext, /decision-complete plan.*before implementation/i);
    assert.match(prompt.hookOutput.hookSpecificOutput.additionalContext, /consultation, explanation, or plan-only requests/i);
    const promptKo = await runStateResult("user-prompt-submit", { root, locale: "ko-KR", payload: { cwd: root, session_id: "s1", turn_id: "t2", prompt: "요청한 수정을 구현해줘" } });
    assert.match(promptKo.hookOutput.hookSpecificOutput.additionalContext, /사용자가 goal을 언급하지 않아도 이 요청 자체를 권한/);
    assert.match(promptKo.hookOutput.hookSpecificOutput.additionalContext, /상담·설명·계획 전용 요청에는 goal을 만들지 마세요/);
    await assert.rejects(access(join(root, "MEMORY.md")));
    await assert.rejects(access(join(root, ".cairn")));
  });
});

test("session-owned goals are isolated from other hook sessions", async () => {
  await withTempRoot(async (root) => {
    await startGoal({
      root,
      goal: "Session isolated goal",
      planId: "docs/plan/session.md",
      ownerSessionId: "session-owner",
      tasks: [{ id: "owned", title: "Owned task" }],
    });
    const owner = await runStateResult("session-start", { root, locale: "en-US", payload: { cwd: root, session_id: "session-owner", turn_id: "t1" } });
    assert.equal(owner.hookOutput.hookSpecificOutput.hookEventName, "SessionStart");
    const cli = spawnSync(process.execPath, [stateScript, "session-start"], {
      cwd: root,
      input: JSON.stringify({ cwd: root, session_id: "session-owner", turn_id: "t1" }),
      encoding: "utf8",
    });
    assert.equal(cli.status, 0, cli.stderr);
    assert.equal(JSON.parse(cli.stdout).hookSpecificOutput.hookEventName, "SessionStart");

    for (const event of ["session-start", "user-prompt-submit", "stop"]) {
      const foreign = await runStateResult(event, { root, locale: "en-US", payload: { cwd: root, session_id: "session-foreign", turn_id: "t2" } });
      assert.deepEqual(foreign.hookOutput, {}, `${event} must not expose or block an owner-bound goal`);
    }
  });
});

test("active goal context includes the ordered task roadmap and side-question return point", async () => {
  await withTempRoot(async (root) => {
    await startGoal({
      root,
      goal: "Roadmap goal",
      planId: "docs/plan/roadmap.md",
      ownerSessionId: "roadmap-session",
      tasks: [
        { id: "inspect", title: "Inspect the issue" },
        { id: "implement", title: "Implement the fix" },
        { id: "verify", title: "Verify the result" },
      ],
    });

    const prompt = await runStateResult("user-prompt-submit", {
      root,
      locale: "en-US",
      payload: { cwd: root, session_id: "roadmap-session", turn_id: "t1", prompt: "What is the status?" },
    });
    const context = prompt.hookOutput.hookSpecificOutput.additionalContext;
    assert.match(context, /Work steps:\n1\. inspect \[active\] Inspect the issue/);
    assert.match(context, /2\. implement \[pending\] Implement the fix/);
    assert.match(context, /3\. verify \[pending\] Verify the result/);
    assert.match(context, /After answering a side question, return to current task inspect/);

    const promptKo = await runStateResult("user-prompt-submit", {
      root,
      locale: "ko-KR",
      payload: { cwd: root, session_id: "roadmap-session", turn_id: "t2", prompt: "잠깐 상태를 알려줘" },
    });
    const contextKo = promptKo.hookOutput.hookSpecificOutput.additionalContext;
    assert.match(contextKo, /작업 단계:\n1\. inspect \[active\] Inspect the issue/);
    assert.match(contextKo, /곁가지 질문에 답한 뒤.*현재 task inspect로 돌아와/);
  });
});

test("hook cwd resolves a nested directory to the repository goal root", async () => {
  await withTempRoot(async (root) => {
    const nested = join(root, "packages", "app");
    await mkdir(join(root, ".git"), { recursive: true });
    await mkdir(nested, { recursive: true });
    await startGoal({
      root,
      goal: "Nested hook goal",
      planId: "docs/plan/nested.md",
      ownerSessionId: "nested-session",
      tasks: [{ id: "nested", title: "Nested task" }],
    });

    const stop = await runStateResult("stop", {
      locale: "en-US",
      payload: { cwd: nested, session_id: "nested-session", turn_id: "nested-turn" },
    });
    assert.equal(stop.hookOutput.decision, "block");
    assert.match(stop.hookOutput.reason, /Nested task/);
    await assert.rejects(access(join(nested, ".cairn")));
  });
});

test("blocked transitions require a reason and state revisions advance", async () => {
  await withTempRoot(async (root) => {
    const started = await createTwoTaskGoal(root);
    await assert.rejects(transitionGoal({ root, status: "blocked" }), /blocker must be a non-empty string/);
    const blocked = await transitionGoal({ root, status: "blocked", blocker: "Waiting for user approval" });
    assert.equal(blocked.goal.blocker, "Waiting for user approval");
    assert.equal(blocked.revision, started.revision + 1);
    await assert.rejects(
      setTaskStatus({ root, taskId: "first", status: "blocked" }),
      /blocker must be a non-empty string/,
    );
  });
});

test("Stop returns the Codex continuation JSON only for an active current task", async () => {
  await withTempRoot(async (root) => {
    const active = await createTwoTaskGoal(root);
    const blocked = await runStateResult("stop", { root, locale: "en-US", payload: { cwd: root, session_id: "s1", turn_id: "t1" } });
    assert.equal(blocked.status, 0);
    assert.equal(blocked.hookOutput.decision, "block");
    assert.match(blocked.hookOutput.reason, /first/);

    const cli = spawnSync(process.execPath, [stateScript, "stop"], {
      cwd: root,
      input: JSON.stringify({ cwd: root, session_id: "s1", turn_id: "t1", stop_hook_active: true }),
      encoding: "utf8",
    });
    assert.equal(cli.status, 0, cli.stderr);
    const output = JSON.parse(cli.stdout);
    assert.deepEqual(Object.keys(output).sort(), ["continue", "systemMessage"]);
    assert.equal(output.continue, true);
    assert.match(output.systemMessage, /already continued/);

    await transitionGoal({ root, status: "paused" });
    const paused = await runStateResult("stop", { root, locale: "en-US", payload: { cwd: root } });
    assert.deepEqual(paused.hookOutput, { continue: true });
    assert.equal(active.goal.status, "active");
  });
});

test("SubagentStop only blocks the current task assigned to the stopping agent", async () => {
  await withTempRoot(async (root) => {
    await createTwoTaskGoal(root);
    await assignTask({ root, taskId: "first", agentId: "agent-current" });
    await assignTask({ root, taskId: "second", agentId: "agent-other" });

    const unrelated = await runStateResult("subagent-stop", { root, locale: "en-US", payload: { cwd: root, agent_id: "agent-other", turn_id: "t1" } });
    assert.deepEqual(unrelated.hookOutput, { continue: true });

    const assigned = await runStateResult("subagent-stop", { root, locale: "en-US", payload: { cwd: root, agent_id: "agent-current", turn_id: "t1", stop_hook_active: false } });
    assert.equal(assigned.hookOutput.decision, "block");
    assert.match(assigned.hookOutput.reason, /only this assigned task/);

    const continued = await runStateResult("subagent-stop", { root, locale: "en-US", payload: { cwd: root, agent_id: "agent-current", turn_id: "t1", stop_hook_active: true } });
    assert.equal(continued.hookOutput.continue, true);
    assert.match(continued.hookOutput.systemMessage, /already continued/);

    const state = await readGoalState({ root });
    const current = state.tasks.find((task) => task.id === "first");
    assert.equal(evaluateStop(state, { subagent: true, agentId: "agent-current" }).block, true);
    assert.equal(current.assignedAgentId, "agent-current");
  });
});

async function createTwoTaskGoal(root) {
  return startGoal({
    root,
    goal: "Complete goal state coverage",
    planId: "docs/plan/goal-state.md",
    tasks: [{ id: "first", title: "First task" }, { id: "second", title: "Second task" }],
  });
}

async function withTempRoot(work) {
  const root = await mkdtemp(join(tmpdir(), "cairn-goal-state-"));
  try {
    await work(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
