import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  assignTask,
  evaluateStop,
  goalStatePath,
  readGoalState,
  recordReceipt,
  replanGoal,
  setTaskStatus,
  startGoal,
  transitionGoal,
  verifyAndRecord,
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

    assert.equal(state.schemaVersion, 2);
    assert.equal(state.goal.evidencePolicy, "tool-bound");
    assert.equal(state.goal.status, "active");
    assert.equal(state.tasks[0].status, "active");
    assert.equal(state.tasks[1].status, "pending");
    const text = await readFile(goalStatePath(root), "utf8");
    assert.deepEqual(JSON.parse(text), state);
    const leftovers = await readdir(join(root, ".cairn"));
    assert.equal(leftovers.filter((name) => name.endsWith(".tmp")).length, 0);
  });
});

test("goal replan preserves completed work and replaces the incomplete roadmap", async () => {
  await withTempRoot(async (root) => {
    await startGoal({
      root,
      goal: "Reclassify the route",
      planId: "docs/plan/reclassify.md",
      evidencePolicy: "declared",
      tasks: [
        { id: "triage", title: "Triage" },
        { id: "light-implement", title: "Light implementation" },
        { id: "verify", title: "Verify" },
      ],
    });
    for (const kind of ["moduleAcceptance", "surfaceIntegration"]) {
      await recordReceipt({ root, taskId: "triage", kind, command: `verify triage ${kind}`, exitCode: 0 });
    }
    await setTaskStatus({ root, taskId: "triage", status: "completed" });
    await recordReceipt({ root, taskId: "light-implement", kind: "moduleAcceptance", command: "old light evidence", exitCode: 0 });
    await recordReceipt({ root, scope: "goal", kind: "finalReview", command: "old goal evidence", exitCode: 0 });

    const replanned = await replanGoal({
      root,
      tasks: [
        { id: "heavy-review", title: "Review the Heavy plan", requiredEvidence: ["planReview"] },
        { id: "heavy-implement", title: "Implement the Heavy plan" },
        { id: "verify", title: "Verify the Heavy plan" },
      ],
    });

    assert.deepEqual(replanned.tasks.map(({ id, status }) => ({ id, status })), [
      { id: "triage", status: "completed" },
      { id: "heavy-review", status: "active" },
      { id: "heavy-implement", status: "pending" },
      { id: "verify", status: "pending" },
    ]);
    assert.deepEqual(replanned.tasks[1].requiredEvidence, ["planReview"]);
    assert.ok(replanned.receipts.every((receipt) => receipt.taskId === "triage"));
    await assert.rejects(replanGoal({ root, tasks: [] }), /at least one incomplete task/i);
    await assert.rejects(replanGoal({ root, tasks: [{ id: "triage", title: "Duplicate completed task" }] }), /completed task id/i);
  });
});

test("goal replan CLI replaces the incomplete roadmap", async () => {
  await withTempRoot(async (root) => {
    await startGoal({
      root,
      goal: "CLI replan",
      planId: "docs/plan/cli-replan.md",
      tasks: [{ id: "light", title: "Light task" }],
    });

    const cli = spawnSync(process.execPath, [
      cliScript,
      "goal", "replan",
      "--root", root,
      "--tasks", JSON.stringify([
        { id: "review", title: "Heavy review", requiredEvidence: ["planReview"] },
        { id: "implement", title: "Heavy implementation" },
      ]),
    ], { encoding: "utf8" });

    assert.equal(cli.status, 0, cli.stderr);
    const state = JSON.parse(cli.stdout);
    assert.deepEqual(state.tasks.map((task) => task.id), ["review", "implement"]);
    assert.equal(state.tasks[0].status, "active");
  });
});

test("schema v1 state migrates to tool-bound schema v2 without losing declared evidence", async () => {
  await withTempRoot(async (root) => {
    const now = new Date().toISOString();
    await mkdir(join(root, ".cairn"), { recursive: true });
    await writeFile(goalStatePath(root), `${JSON.stringify({
      schemaVersion: 1,
      revision: 3,
      goal: {
        id: "goal-v1",
        title: "Migrate old state",
        planId: "docs/plan/v1.md",
        status: "active",
        completionCriteria: [],
        requiredEvidence: ["finalReview"],
        ownerSessionId: null,
        blocker: null,
        createdAt: now,
        updatedAt: now,
      },
      tasks: [{
        id: "legacy",
        title: "Legacy task",
        status: "active",
        assignedAgentId: null,
        requiredEvidence: ["moduleAcceptance", "surfaceIntegration"],
        blocker: null,
        createdAt: now,
        updatedAt: now,
      }],
      receipts: [{
        id: "receipt-v1",
        scope: "task",
        kind: "moduleAcceptance",
        taskId: "legacy",
        goalId: "goal-v1",
        planId: "docs/plan/v1.md",
        command: "node --test",
        exitCode: 0,
        timestamp: now,
        source: "tool",
      }],
    }, null, 2)}\n`);

    const migrated = await readGoalState({ root });
    assert.equal(migrated.schemaVersion, 2);
    assert.equal(migrated.goal.evidencePolicy, "tool-bound");
    assert.equal(migrated.receipts[0].source, "declared");
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

test("goal CLI preserves inline option values while parsing quiet as boolean", async () => {
  await withTempRoot(async (root) => {
    const cli = spawnSync(process.execPath, [
      cliScript,
      "goal", "start",
      `--root=${root}`,
      "--goal=Inline CLI goal=a=b",
      "--plan=docs/plan/inline.md",
      "--tasks=Inline task",
      "--session=inline-session",
      "--quiet=false",
    ], { encoding: "utf8" });

    assert.equal(cli.status, 0, cli.stderr);
    const state = JSON.parse(cli.stdout);
    assert.equal(state.goal.title, "Inline CLI goal=a=b");
    assert.equal(state.goal.planId, "docs/plan/inline.md");
    assert.equal(state.goal.ownerSessionId, "inline-session");
  });
});

test("top-level task CLI accepts action and task id shorthand", async () => {
  await withTempRoot(async (root) => {
    await startGoal({
      root,
      goal: "Task shorthand",
      planId: "docs/plan/task-shorthand.md",
      evidencePolicy: "declared",
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
      evidencePolicy: "declared",
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

test("tool-bound goals execute verification, reject declared and stale evidence, and keep failures unrecorded", async () => {
  await withTempRoot(async (root) => {
    const watched = join(root, "watched.txt");
    await writeFile(watched, "v1\n");
    const started = spawnSync(process.execPath, [
      cliScript,
      "goal", "start",
      "--quiet",
      "--root", root,
      "--goal", "Tool-bound evidence",
      "--plan", "docs/plan/tool-bound.md",
      "--tasks", JSON.stringify([{
        id: "verify",
        title: "Verify with the tool",
        requiredEvidence: ["moduleAcceptance", "surfaceIntegration"],
      }]),
    ], { encoding: "utf8" });
    assert.equal(started.status, 0, started.stderr);

    await assert.rejects(
      recordReceipt({
        root,
        taskId: "verify",
        kind: "moduleAcceptance",
        command: "fabricated tool evidence",
        exitCode: 0,
        source: "tool",
      }),
      /only goal verify/i,
    );

    const preflightMarker = join(root, "must-not-run.txt");
    const invalidTarget = spawnSync(process.execPath, [
      cliScript,
      "goal", "verify",
      "--quiet",
      "--root", root,
      "--task", "missing-task",
      "--kind", "moduleAcceptance",
      "--watch", watched,
      "--",
      process.execPath,
      "-e",
      `require("node:fs").writeFileSync(${JSON.stringify(preflightMarker)}, "ran")`,
    ], { encoding: "utf8" });
    assert.notEqual(invalidTarget.status, 0);
    assert.match(invalidTarget.stderr, /unknown task/i);
    await assert.rejects(access(preflightMarker));

    const declared = spawnSync(process.execPath, [
      cliScript,
      "goal", "receipt",
      "--quiet",
      "--root", root,
      "--task", "verify",
      "--kind", "moduleAcceptance",
      "--command", "node --test (never executed)",
      "--exit-code", "0",
    ], { encoding: "utf8" });
    assert.equal(declared.status, 0, declared.stderr);
    const declaredCompletion = spawnSync(process.execPath, [
      cliScript, "goal", "task", "--root", root, "--task", "verify", "--status", "completed",
    ], { encoding: "utf8" });
    assert.notEqual(declaredCompletion.status, 0);
    assert.match(declaredCompletion.stderr, /tool-bound evidence/i);

    const failed = runVerify(root, "moduleAcceptance", watched, "process.exit(7)");
    assert.notEqual(failed.status, 0);
    assert.match(failed.stderr, /verification failed.*exit 7/is);
    assert.equal((await readGoalState({ root })).receipts.filter((item) => item.source === "tool").length, 0);

    for (const kind of ["moduleAcceptance", "surfaceIntegration"]) {
      const verified = runVerify(root, kind, watched, "console.log('verified')");
      assert.equal(verified.status, 0, verified.stderr);
      assert.equal(verified.stdout, "");
    }
    const verifiedState = await readGoalState({ root });
    const toolEvidence = verifiedState.receipts.filter((item) => item.source === "tool");
    assert.equal(toolEvidence.length, 2);
    assert.deepEqual(toolEvidence[0].argv.slice(0, 2), [process.execPath, "-e"]);
    assert.match(toolEvidence[0].outputDigest, /^sha256:[a-f0-9]{64}$/);
    assert.match(toolEvidence[0].workspaceFingerprint, /^sha256:[a-f0-9]{64}$/);
    assert.match(toolEvidence[0].summary, /verification passed.*outputBytes/i);
    assert.ok(toolEvidence[0].summary.length < 120);

    const exactArgv = spawnSync(process.execPath, [
      cliScript,
      "goal", "verify",
      "--quiet",
      "--root", root,
      "--task", "verify",
      "--kind", "surfaceIntegration",
      "--watch", watched,
      "--",
      process.execPath,
      "-e",
      "process.exit(0)",
      "",
      "  spaced  ",
    ], { encoding: "utf8" });
    assert.equal(exactArgv.status, 0, exactArgv.stderr);
    assert.deepEqual((await readGoalState({ root })).receipts.at(-1).argv.slice(-2), ["", "  spaced  "]);

    await writeFile(watched, "v2\n");
    const staleCompletion = spawnSync(process.execPath, [
      cliScript, "goal", "task", "--root", root, "--task", "verify", "--status", "completed",
    ], { encoding: "utf8" });
    assert.notEqual(staleCompletion.status, 0);
    assert.match(staleCompletion.stderr, /stale evidence/i);

    for (const kind of ["moduleAcceptance", "surfaceIntegration"]) {
      const refreshed = runVerify(root, kind, watched, "console.log('refreshed')");
      assert.equal(refreshed.status, 0, refreshed.stderr);
    }
    const completed = spawnSync(process.execPath, [
      cliScript, "goal", "task", "--quiet", "--root", root, "--task", "verify", "--status", "completed",
    ], { encoding: "utf8" });
    assert.equal(completed.status, 0, completed.stderr);

    await writeFile(watched, "v3\n");
    for (const kind of ["moduleAcceptance", "surfaceIntegration"]) {
      const refreshedAfterCompletion = runVerify(root, kind, watched, "console.log('refreshed after completion')");
      assert.equal(refreshedAfterCompletion.status, 0, refreshedAfterCompletion.stderr);
    }
    const refreshedCompletedState = await readGoalState({ root });
    assert.equal(refreshedCompletedState.tasks[0].status, "completed");
    assert.equal(refreshedCompletedState.receipts.filter((item) => item.source === "tool").length, 7);
  });
});

test("completed tasks can refresh stale tool evidence without reopening status or assignment", async () => {
  await withTempRoot(async (root) => {
    await writeFile(join(root, "watched.txt"), "v1\n");
    await startGoal({
      root,
      goal: "Refresh completed evidence",
      planId: "docs/plan/refresh.md",
      tasks: [{ id: "refresh", title: "Refresh evidence" }],
    });
    await assignTask({ root, taskId: "refresh", agentId: "worker-1" });
    for (const kind of ["moduleAcceptance", "surfaceIntegration"]) {
      await verifyAndRecord({ root, taskId: "refresh", kind, watchPaths: ["watched.txt"], argv: [process.execPath, "-e", "process.exit(0)"] });
    }
    await setTaskStatus({ root, taskId: "refresh", status: "completed" });
    await writeFile(join(root, "watched.txt"), "v2\n");

    const refreshed = await verifyAndRecord({
      root,
      taskId: "refresh",
      kind: "moduleAcceptance",
      watchPaths: ["watched.txt"],
      argv: [process.execPath, "-e", "console.log('refreshed')"],
    });
    const task = refreshed.state.tasks.find((item) => item.id === "refresh");
    assert.equal(task.status, "completed");
    assert.equal(task.assignedAgentId, "worker-1");
    assert.equal(refreshed.evidence.kind, "moduleAcceptance");
    await assert.rejects(setTaskStatus({ root, taskId: "refresh", status: "active" }), /Cannot transition task/);
  });
});

test("verification rejects pending, blocked, and terminal targets before running tools", async () => {
  await withTempRoot(async (root) => {
    await startGoal({
      root,
      goal: "Reject invalid verification targets",
      planId: "docs/plan/reject.md",
      evidencePolicy: "declared",
      tasks: [{ id: "active", title: "Active" }, { id: "pending", title: "Pending" }],
    });
    let ran = false;
    const runner = () => { ran = true; return { status: 0, stdout: "", stderr: "" }; };
    await assert.rejects(
      verifyAndRecord({ root, taskId: "pending", kind: "moduleAcceptance", argv: ["unused"], runner }),
      /must be active or completed/,
    );
    await setTaskStatus({ root, taskId: "active", status: "blocked", blocker: "waiting" });
    await assert.rejects(
      verifyAndRecord({ root, taskId: "active", kind: "moduleAcceptance", argv: ["unused"], runner }),
      /must be active or completed/,
    );
    assert.equal(ran, false);
  });

  await withTempRoot(async (root) => {
    await startGoal({
      root,
      goal: "Terminal verification",
      planId: "docs/plan/terminal.md",
      evidencePolicy: "declared",
      tasks: [{ id: "only", title: "Only" }],
    });
    for (const kind of ["moduleAcceptance", "surfaceIntegration"]) {
      await recordReceipt({ root, taskId: "only", kind, command: `verify ${kind}`, exitCode: 0 });
    }
    await setTaskStatus({ root, taskId: "only", status: "completed" });
    await recordReceipt({ root, scope: "goal", kind: "finalReview", command: "review", exitCode: 0 });
    await transitionGoal({ root, status: "completed" });
    await assert.rejects(
      verifyAndRecord({ root, taskId: "only", kind: "moduleAcceptance", argv: [process.execPath, "-e", "process.exit(0)"] }),
      /completed goal/,
    );
  });
});

test("verification fails closed when goal, task, assignment, or watched files race", async () => {
  const cases = [
    ["goal identity", (state) => { state.goal.id = "goal-replaced-during-verification"; }],
    ["plan identity", (state) => { state.goal.planId = "docs/plan/replaced.md"; }],
    ["task status", (state) => { state.tasks[0].status = "blocked"; state.tasks[0].blocker = "raced"; }],
    ["task assignment", (state) => { state.tasks[0].assignedAgentId = "raced-agent"; }],
  ];
  for (const [name, mutate] of cases) {
    await withTempRoot(async (root) => {
      await startGoal({ root, goal: `Race ${name}`, planId: "docs/plan/race.md", tasks: [{ id: "race", title: "Race" }] });
      const runner = () => {
        const path = goalStatePath(root);
        const state = JSON.parse(readFileSync(path, "utf8"));
        mutate(state);
        writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`);
        return { status: 0, stdout: "ok", stderr: "" };
      };
      await assert.rejects(
        verifyAndRecord({ root, taskId: "race", kind: "moduleAcceptance", argv: ["race"], runner }),
        /changed during verification/,
        name,
      );
      assert.equal((await readGoalState({ root })).receipts.length, 0);
    });
  }

  await withTempRoot(async (root) => {
    await writeFile(join(root, "watched.txt"), "v1\n");
    await startGoal({ root, goal: "Watch race", planId: "docs/plan/watch.md", tasks: [{ id: "race", title: "Race" }] });
    const runner = () => {
      writeFileSync(join(root, "watched.txt"), "v2\n");
      return { status: 0, stdout: "ok", stderr: "" };
    };
    await assert.rejects(
      verifyAndRecord({ root, taskId: "race", kind: "moduleAcceptance", watchPaths: ["watched.txt"], argv: ["race"], runner }),
      /Watched workspace changed/,
    );
    assert.equal((await readGoalState({ root })).receipts.length, 0);
  });
});

test("receipts fail closed and task completion advances only after successful bound evidence", async () => {
  await withTempRoot(async (root) => {
    const initial = await createTwoTaskGoal(root);
    await assert.rejects(
      setTaskStatus({ root, taskId: "first", status: "completed" }),
      /successful, bound evidence record/,
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
    assert.match(session.message, /read (?:the project-)?root MEMORY/);
    assert.match(prompt.message, /read (?:the project-)?root MEMORY/);
    assert.equal(session.hookOutput.hookSpecificOutput.hookEventName, "SessionStart");
    assert.equal(prompt.hookOutput.hookSpecificOutput.hookEventName, "UserPromptSubmit");
    assert.match(prompt.hookOutput.hookSpecificOutput.additionalContext, /implementation\/continue.*load cairn-plan/i);
    assert.match(prompt.hookOutput.hookSpecificOutput.additionalContext, /restore or create the active plan and current task/i);
    assert.match(prompt.hookOutput.hookSpecificOutput.additionalContext, /consultation, explanation, and plan-only requests goal-free/i);
    assert.match(prompt.hookOutput.hookSpecificOutput.additionalContext, /missing, unreadable, or inconsistent.*do not edit, delegate, or complete/i);
    const promptKo = await runStateResult("user-prompt-submit", { root, locale: "ko-KR", payload: { cwd: root, session_id: "s1", turn_id: "t2", prompt: "요청한 수정을 구현해줘" } });
    assert.match(promptKo.hookOutput.hookSpecificOutput.additionalContext, /구현\/계속 실행이면 cairn-plan을 로드/);
    assert.match(promptKo.hookOutput.hookSpecificOutput.additionalContext, /active plan과 current task를 복원하거나 생성/);
    assert.match(promptKo.hookOutput.hookSpecificOutput.additionalContext, /상담·설명·계획 전용은 goal 없이/);
    assert.match(promptKo.hookOutput.hookSpecificOutput.additionalContext, /없거나 읽을 수 없거나 일치하지 않으면 수정·위임·완료하지/);
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
      tasks: [{ id: "secret-task-id", title: "Secret task title" }],
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

    for (const event of ["session-start", "user-prompt-submit"]) {
      const foreign = await runStateResult(event, { root, locale: "en-US", payload: { cwd: root, session_id: "session-foreign", turn_id: "t2" } });
      const context = foreign.hookOutput.hookSpecificOutput.additionalContext;
      assert.match(context, /owned by another session/i);
      assert.match(context, /do not start, edit, delegate, or complete/i);
      assert.doesNotMatch(context, /Session isolated goal|docs\/plan\/session\.md|secret-task-id|Secret task title/);
    }
    for (const event of ["stop", "subagent-stop"]) {
      const foreign = await runStateResult(event, { root, locale: "en-US", payload: { cwd: root, session_id: "session-foreign", turn_id: "t2" } });
      assert.deepEqual(foreign.hookOutput, {}, `${event} must not block an owner-bound goal`);
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
    assert.match(context, /After a side question, resume inspect/);

    const promptKo = await runStateResult("user-prompt-submit", {
      root,
      locale: "ko-KR",
      payload: { cwd: root, session_id: "roadmap-session", turn_id: "t2", prompt: "잠깐 상태를 알려줘" },
    });
    const contextKo = promptKo.hookOutput.hookSpecificOutput.additionalContext;
    assert.match(contextKo, /작업 단계:\n1\. inspect \[active\] Inspect the issue/);
    assert.match(contextKo, /곁가지 질문 뒤.*inspect를 재개/);
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

test("active context resumes a blocked task instead of reporting all tasks complete", async () => {
  await withTempRoot(async (root) => {
    await startGoal({
      root,
      goal: "Resume blocked work",
      planId: "docs/plan/blocked-context.md",
      tasks: [{ id: "blocked-task", title: "Resolve the blocker" }],
    });
    await setTaskStatus({ root, taskId: "blocked-task", status: "blocked", blocker: "Waiting on a dependency" });
    await transitionGoal({ root, status: "active" });

    const prompt = await runStateResult("user-prompt-submit", {
      root,
      locale: "en-US",
      payload: { cwd: root, prompt: "Continue" },
    });
    const context = prompt.hookOutput.hookSpecificOutput.additionalContext;
    assert.match(context, /Current: blocked-task.*Resolve the blocker/);
    assert.doesNotMatch(context, /All tasks.*complete/i);
  });
});

test("Stop returns the Codex continuation JSON only for an active current task", async () => {
  await withTempRoot(async (root) => {
    const active = await createTwoTaskGoal(root);
    const blocked = await runStateResult("stop", { root, locale: "en-US", payload: { cwd: root, session_id: "s1", turn_id: "t1" } });
    assert.equal(blocked.status, 0);
    assert.equal(blocked.hookOutput.decision, "block");
    assert.match(blocked.hookOutput.reason, /first/);
    assert.match(blocked.hookOutput.reason, /evidence record/i);
    assert.doesNotMatch(blocked.hookOutput.reason, /receipt/i);

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
    assert.match(assigned.hookOutput.reason, /evidence record/i);
    assert.doesNotMatch(assigned.hookOutput.reason, /receipt/i);

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
    evidencePolicy: "declared",
    tasks: [{ id: "first", title: "First task" }, { id: "second", title: "Second task" }],
  });
}

function runVerify(root, kind, watched, source) {
  return spawnSync(process.execPath, [
    cliScript,
    "goal", "verify",
    "--quiet",
    "--root", root,
    "--task", "verify",
    "--kind", kind,
    "--watch", watched,
    "--",
    process.execPath,
    "-e",
    source,
  ], { encoding: "utf8" });
}

async function withTempRoot(work) {
  const root = await mkdtemp(join(tmpdir(), "cairn-goal-state-"));
  try {
    await work(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
