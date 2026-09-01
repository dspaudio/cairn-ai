import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import * as goalModule from "../scripts/cairn-goal.mjs";
import {
  goalStatePath,
  readGoalState,
  recordReceipt,
  setTaskStatus,
  startGoal,
  transitionGoal,
} from "../scripts/cairn-goal.mjs";
import { runStateResult } from "../scripts/cairn-state.mjs";

for (const status of ["paused", "blocked"]) {
  test(`SessionStart restores exact owner context without auto-resuming when goal is ${status}`, async () => {
    await withTempRoot(async (root) => {
      // Given: an owner-bound goal that cannot currently proceed.
      await startGoal({
        root,
        goal: "Recover interrupted work",
        planId: "docs/plan/recovery-exact.md",
        ownerSessionId: "owner-session",
        tasks: [{ id: "recover-task", title: "Recover exact state" }],
      });
      if (status === "paused") {
        await transitionGoal({ root, status: "paused" });
      } else {
        await transitionGoal({ root, status: "blocked", blocker: "Waiting for dependency approval" });
      }

      // When: the owning session starts again.
      const result = await runStateResult("session-start", {
        root,
        locale: "en-US",
        payload: { cwd: root, session_id: "owner-session", turn_id: `${status}-turn` },
      });

      // Then: the capsule restores exact state and requires an explicit recovery action.
      const context = result.hookOutput.hookSpecificOutput.additionalContext;
      assert.match(context, /Exact plan: docs\/plan\/recovery-exact\.md\./);
      assert.match(context, /Current task: recover-task \(Recover exact state\), status active\./);
      assert.match(context, new RegExp(`Goal status: ${status}\\.`));
      assert.match(context, new RegExp(`Blocker: ${status === "blocked" ? "Waiting for dependency approval" : "none"}\\.`));
      assert.match(context, /Do not resume automatically.*resume explicitly/i);
      assert.doesNotMatch(context, /load cairn-plan|resume recover-task|resume that exact task/i);
    });
  });
}

for (const status of ["paused", "blocked"]) {
  test(`${status} goals remain opaque to a foreign SessionStart`, async () => {
    await withTempRoot(async (root) => {
      // Given: an owner-bound interrupted goal containing private recovery details.
      await startGoal({
        root,
        goal: "Private interrupted goal",
        planId: "docs/plan/private-recovery.md",
        ownerSessionId: "owner-session",
        tasks: [{ id: "private-task", title: "Private recovery task" }],
      });
      await transitionGoal({
        root,
        status,
        ...(status === "blocked" ? { blocker: "Private blocker" } : {}),
      });

      // When: another session starts in the repository.
      const result = await runStateResult("session-start", {
        root,
        locale: "en-US",
        payload: { cwd: root, session_id: "foreign-session", turn_id: "foreign-turn" },
      });

      // Then: ownership is disclosed without exposing state details.
      const context = result.hookOutput.hookSpecificOutput.additionalContext;
      assert.match(context, /owned by another session/i);
      assert.doesNotMatch(context, /paused|blocked|Private interrupted goal|private-recovery|private-task|Private recovery task|Private blocker/);
    });
  });
}

test("synchronized concurrent legacy migration readers all observe the migrated state", async () => {
  await withTempRoot(async (root) => {
    // Given: only a legacy project-local state file exists.
    const started = await startGoal({
      root,
      goal: "Migrate concurrently",
      planId: "docs/plan/legacy-race.md",
      tasks: [{ id: "legacy-task", title: "Read legacy state" }],
    });
    const legacyPath = join(root, ".cairn", "state.json");
    await mkdir(dirname(legacyPath), { recursive: true });
    await writeFile(legacyPath, await readFile(goalStatePath(root), "utf8"));
    await rm(goalStatePath(root));
    const ready = deferred();
    const release = deferred();
    let arrivals = 0;
    const readers = Array.from({ length: 12 }, async () => {
      arrivals += 1;
      if (arrivals === 12) ready.resolve();
      await release.promise;
      return readGoalState({ root });
    });

    // When: every waiting reader is released against the same legacy state.
    await ready.promise;
    release.resolve();
    const states = await Promise.all(readers);

    // Then: no reader observes a transient null or divergent state.
    assert.equal(states.every((state) => state !== null), true);
    assert.deepEqual(states.map((state) => state.goal.id), Array(12).fill(started.goal.id));
    assert.deepEqual(states.map((state) => state.revision), Array(12).fill(started.revision));
    await assert.rejects(readFile(legacyPath), /ENOENT/);
  });
});

test("goal contract reports advisory completion criteria and deleted terminal persistence truthfully", async () => {
  await withTempRoot(async (root) => {
    // Given: a goal whose advisory criterion is not machine-enforced but whose evidence gates pass.
    assert.deepEqual(goalModule.GOAL_STATE_CONTRACT?.completionCriteria, { behavior: "advisory", enforced: false });
    assert.deepEqual(goalModule.GOAL_STATE_CONTRACT?.terminal, {
      statuses: ["cancelled", "completed"],
      persistence: "deleted",
      readAfterTransition: null,
      transitionResult: "terminal-snapshot",
    });
    await startGoal({
      root,
      goal: "Truthful contract",
      planId: "docs/plan/truthful-contract.md",
      evidencePolicy: "declared",
      completionCriteria: ["A human confirms the release"],
      tasks: [{ id: "contract-task", title: "Exercise contract" }],
    });
    for (const kind of ["moduleAcceptance", "surfaceIntegration"]) {
      await recordReceipt({ root, taskId: "contract-task", kind, command: `verify ${kind}`, exitCode: 0 });
    }
    await setTaskStatus({ root, taskId: "contract-task", status: "completed" });
    await recordReceipt({ root, scope: "goal", kind: "finalReview", command: "verify final review", exitCode: 0 });

    // When: completion is explicitly requested.
    const terminal = await transitionGoal({ root, status: "completed" });

    // Then: criteria remain advisory, the terminal snapshot is returned, and persisted state is deleted.
    assert.equal(terminal.goal.status, "completed");
    assert.deepEqual(terminal.goal.completionCriteria, ["A human confirms the release"]);
    assert.equal(await readGoalState({ root }), null);
  });
});

async function withTempRoot(work) {
  const root = await mkdtemp(join(tmpdir(), "cairn-state-recovery-"));
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

function deferred() {
  let resolvePromise;
  const promise = new Promise((resolve) => { resolvePromise = resolve; });
  return { promise, resolve: resolvePromise };
}
