import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  PLAN_ID_MAX_LENGTH,
  RECOVERY_REFERENCE_MAX_LENGTH,
  TASK_ID_MAX_LENGTH,
  goalStatePath,
  readGoalState,
  recordReceipt,
  setTaskStatus,
  startGoal,
  transitionGoal,
} from "../scripts/cairn-goal.mjs";
import { runStateResult } from "../scripts/cairn-state.mjs";
import { message } from "../scripts/cairn.mjs";

const cliScript = resolve("scripts/cairn.mjs");

test("recurring Codex instructions are a small stable recovery kernel", async () => {
  const manifest = JSON.parse(await readFile(".codex-plugin/plugin.json", "utf8"));
  const prompt = manifest.interface.defaultPrompt.join("\n");

  assert.equal(manifest.interface.defaultPrompt.length, 7);
  assert.ok(prompt.length <= 1600, `defaultPrompt is ${prompt.length} characters; budget is 1600`);
  assert.match(prompt, /root MEMORY\.md.*when it exists.*continue without repository memory/i);
  assert.match(prompt, /phase skill.*cairn-plan.*cairn-work.*cairn-review/i);
  assert.match(prompt, /active plan.*current-task references/i);
  assert.match(prompt, /compaction, restart, handoff, or delegation/i);
  assert.match(prompt, /missing MEMORY\.md never blocks work/i);
  assert.match(prompt, /missing, failed, skipped, stale, or placeholder evidence never completes work/i);
  assert.match(prompt, /external-state changes.*dry-run\/check/i);
  assert.match(prompt, /side questions.*resume the current task/i);
  assert.doesNotMatch(prompt, /update_plan|create_goal|package lifecycle|--ignore-scripts|progress-reporting channel/i);
});

test("hook context is a compact phase capsule without dropping recovery state", async () => {
  await withTempRoot(async (root) => {
    const idle = await runStateResult("user-prompt-submit", {
      root,
      locale: "en-US",
      payload: { cwd: root, session_id: "budget-session", prompt: "Implement the fix" },
    });
    const idleContext = idle.hookOutput.hookSpecificOutput.additionalContext;
    assert.ok(idleContext.length <= 620, `idle hook is ${idleContext.length} characters; budget is 620`);
    assert.match(idleContext, /^Cairn kernel: root MEMORY\.md is optional/);
    assert.match(idleContext, /non-trivial implementation.*planned-work continuation.*load cairn-plan/i);
    assert.match(idleContext, /known-target Git\/GitHub operations stay plan\/goal-free/i);
    assert.match(idleContext, /code edits.*conflict resolution.*destructive recovery.*release\/deploy.*design/i);
    assert.match(idleContext, /consultation.*plan-only/i);
    assert.match(idleContext, /stop only if active state.*missing, unreadable, or inconsistent/i);

    await startGoal({
      root,
      goal: "Keep the reliable roadmap while reducing repeated context",
      planId: "docs/plan/token-budget.md",
      ownerSessionId: "budget-session",
      tasks: [
        { id: "triage", title: "Measure context and finalize the plan" },
        { id: "implement", title: "Implement the bounded change" },
        { id: "verify", title: "Verify tool evidence" },
      ],
    });
    const active = await runStateResult("user-prompt-submit", {
      root,
      locale: "en-US",
      payload: { cwd: root, session_id: "budget-session", prompt: "What is the status?" },
    });
    const activeContext = active.hookOutput.hookSpecificOutput.additionalContext;
    assert.ok(activeContext.length <= 700, `active hook is ${activeContext.length} characters; budget is 700`);
    assert.match(activeContext, /^Cairn kernel: root MEMORY\.md is optional/);
    assert.match(activeContext, /load cairn-work/i);
    assert.match(activeContext, /docs\/plan\/token-budget\.md/);
    assert.match(activeContext, /1\. triage \[active\]/);
    assert.match(activeContext, /2\. implement \[pending\]/);
    assert.match(activeContext, /current.*triage/i);
    assert.match(activeContext, /side question.*resume.*triage/i);
    assert.match(activeContext, /stop only if active state.*missing, unreadable, or inconsistent/i);
  });
});

test("hook capsules are deterministic for the same state and restore review phase", async () => {
  await withTempRoot(async (root) => {
    await startGoal({
      root,
      goal: "Deterministic recovery",
      planId: "docs/plan/deterministic.md",
      ownerSessionId: "deterministic-session",
      evidencePolicy: "declared",
      tasks: [{ id: "only", title: "Only task" }],
    });

    const first = await runStateResult("user-prompt-submit", {
      root,
      locale: "en-US",
      payload: { cwd: root, session_id: "deterministic-session", turn_id: "turn-1", prompt: "First prompt" },
    });
    const second = await runStateResult("user-prompt-submit", {
      root,
      locale: "en-US",
      payload: { cwd: root, session_id: "deterministic-session", turn_id: "turn-2", prompt: "Different prompt" },
    });
    assert.equal(
      first.hookOutput.hookSpecificOutput.additionalContext,
      second.hookOutput.hookSpecificOutput.additionalContext,
    );

    await recordReceipt({ root, taskId: "only", kind: "moduleAcceptance", command: "node --test", exitCode: 0 });
    await recordReceipt({ root, taskId: "only", kind: "surfaceIntegration", command: "npm run check", exitCode: 0 });
    await setTaskStatus({ root, taskId: "only", status: "completed" });
    const review = await runStateResult("session-start", {
      root,
      locale: "en-US",
      payload: { cwd: root, session_id: "deterministic-session", turn_id: "turn-3" },
    });
    const reviewContext = review.hookOutput.hookSpecificOutput.additionalContext;
    assert.match(reviewContext, /^Cairn kernel: root MEMORY\.md is optional/);
    assert.match(reviewContext, /load cairn-review/i);
    assert.match(reviewContext, /docs\/plan\/deterministic\.md/);
    assert.match(reviewContext, /stop only if active state.*missing, unreadable, or inconsistent/i);
  });
});

test("foreign sessions receive only a generic fail-closed capsule", async () => {
  await withTempRoot(async (root) => {
    await startGoal({
      root,
      goal: "Secret owner goal",
      planId: "docs/plan/secret-owner.md",
      ownerSessionId: "owner-session",
      tasks: [{ id: "secret-task", title: "Secret task title" }],
    });

    for (const event of ["session-start", "user-prompt-submit"]) {
      const foreign = await runStateResult(event, {
        root,
        locale: "en-US",
        payload: { cwd: root, session_id: "foreign-session", turn_id: "foreign-turn", prompt: "Continue" },
      });
      const context = foreign.hookOutput.hookSpecificOutput.additionalContext;
      assert.match(context, /^Cairn kernel: root MEMORY\.md is optional/);
      assert.match(context, /owned by another session/i);
      assert.match(context, /inspect.*goal status/i);
      assert.match(context, /do not start, edit, delegate, or complete/i);
      assert.doesNotMatch(context, /Secret owner goal|secret-owner|secret-task|Secret task title/);
    }

    for (const event of ["stop", "subagent-stop"]) {
      const stop = await runStateResult(event, {
        root,
        locale: "en-US",
        payload: { cwd: root, session_id: "foreign-session", turn_id: "foreign-turn", agent_id: "foreign-agent" },
      });
      assert.deepEqual(stop.hookOutput, {}, `${event} must not block work owned by another session`);
    }

    await transitionGoal({ root, status: "cancelled" });
    assert.equal(await readGoalState({ root }), null);
    for (const event of ["session-start", "user-prompt-submit"]) {
      const terminal = await runStateResult(event, {
        root,
        locale: "en-US",
        payload: { cwd: root, session_id: "foreign-session", turn_id: "terminal-turn", prompt: "Start new work" },
      });
      const context = terminal.hookOutput.hookSpecificOutput.additionalContext;
      assert.match(context, /^Cairn kernel: root MEMORY\.md is optional/);
      assert.match(context, /load cairn-plan/i);
      assert.doesNotMatch(context, /owned by another session|Secret owner goal|secret-owner|secret-task|Secret task title/i);
    }
  });
});

test("active hook stays bounded for long goals and large roadmaps", async () => {
  await withTempRoot(async (root) => {
    const exactPlanId = "p".repeat(RECOVERY_REFERENCE_MAX_LENGTH - TASK_ID_MAX_LENGTH);
    const exactTaskId = "t".repeat(TASK_ID_MAX_LENGTH);
    await startGoal({
      root,
      goal: "G".repeat(600),
      planId: exactPlanId,
      ownerSessionId: "large-roadmap-session",
      tasks: Array.from({ length: 20 }, (_, index) => ({
        id: index === 0 ? exactTaskId : `task-${index + 1}`,
        title: `Long task ${index + 1} ${"t".repeat(200)}`,
      })),
    });

    const active = await runStateResult("user-prompt-submit", {
      root,
      locale: "en-US",
      payload: { cwd: root, session_id: "large-roadmap-session", prompt: "Continue" },
    });
    const context = active.hookOutput.hookSpecificOutput.additionalContext;
    assert.ok(context.length <= 700, `large active hook is ${context.length} characters; budget is 700`);
    assert.match(context, /20/);
    assert.match(context, /omitted/i);
    assert.ok(context.includes(exactPlanId), "active hook must preserve the exact plan reference");
    assert.ok(context.includes(`Exact task: ${exactTaskId}.`), "active hook must preserve the exact current task id");
    assert.match(context, /Resume that exact task after side questions/i);
  });
});

test("goal state bounds exact recovery references and rejects oversized legacy state", async () => {
  await withTempRoot(async (root) => {
    await assert.rejects(
      startGoal({ root, goal: "Long plan", planId: "p".repeat(PLAN_ID_MAX_LENGTH + 1), tasks: [{ id: "task", title: "Task" }] }),
      /planId must be at most 128 characters/,
    );
    await assert.rejects(
      startGoal({ root, goal: "Long task", planId: "plan", tasks: [{ id: "t".repeat(TASK_ID_MAX_LENGTH + 1), title: "Task" }] }),
      /tasks\[0\]\.id must be at most 64 characters/,
    );
    await assert.rejects(
      startGoal({
        root,
        goal: "Combined limit",
        planId: "p".repeat(RECOVERY_REFERENCE_MAX_LENGTH - TASK_ID_MAX_LENGTH + 1),
        tasks: [{ id: "t".repeat(TASK_ID_MAX_LENGTH), title: "Task" }],
      }),
      /planId and taskId must total at most 160 characters/,
    );

    const baseline = await startGoal({ root, goal: "Legacy bound", planId: "plan", tasks: [{ id: "task", title: "Task" }] });
    const legacy = structuredClone(baseline);
    legacy.schemaVersion = 1;
    delete legacy.goal.evidencePolicy;
    legacy.goal.planId = "p".repeat(PLAN_ID_MAX_LENGTH + 1);
    await writeFile(goalStatePath(root), `${JSON.stringify(legacy, null, 2)}\n`);
    await assert.rejects(readGoalState({ root }), /goal\.planId must be at most 128 characters/);

    const paddedPlan = structuredClone(baseline);
    paddedPlan.goal.planId = ` ${"p".repeat(96)}${" ".repeat(900)}`;
    await writeFile(goalStatePath(root), `${JSON.stringify(paddedPlan, null, 2)}\n`);
    await assert.rejects(readGoalState({ root }), /goal\.planId must not have leading or trailing whitespace/);

    const paddedTask = structuredClone(baseline);
    paddedTask.tasks[0].id = ` ${"t".repeat(64)} `;
    await writeFile(goalStatePath(root), `${JSON.stringify(paddedTask, null, 2)}\n`);
    await assert.rejects(readGoalState({ root }), /task\.id must not have leading or trailing whitespace/);

    const paddedCombined = structuredClone(baseline);
    paddedCombined.goal.planId = `${"p".repeat(96)} `;
    paddedCombined.tasks[0].id = `${"t".repeat(64)} `;
    await writeFile(goalStatePath(root), `${JSON.stringify(paddedCombined, null, 2)}\n`);
    await assert.rejects(readGoalState({ root }), /must not have leading or trailing whitespace/);
  });
});

test("goal CLI quiet mode preserves state and suppresses successful JSON", async () => {
  await withTempRoot(async (root) => {
    const started = spawnSync(process.execPath, [
      cliScript,
      "goal", "start",
      "--quiet",
      "--root", root,
      "--goal", "Quiet state mutation",
      "--plan", "docs/plan/quiet.md",
      "--tasks", "Quiet task",
    ], { cwd: root, encoding: "utf8" });

    assert.equal(started.status, 0, started.stderr);
    assert.equal(started.stdout, "");
    assert.equal((await readGoalState({ root })).goal.title, "Quiet state mutation");

    const status = spawnSync(process.execPath, [cliScript, "goal", "status", "--root", root, "--quiet"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(status.status, 0, status.stderr);
    assert.equal(JSON.parse(status.stdout).goal.title, "Quiet state mutation");
  });
});

test("work guidance spends reasoning on tests and trusts bounded tool evidence", async () => {
  const work = await readFile("skills/cairn-work/SKILL.md", "utf8");

  assert.match(work, /test contract first/i);
  assert.match(work, /requirements, invariants, boundaries, and failure modes/i);
  assert.match(work, /minimum implementation/i);
  assert.match(work, /tool exit code.*authoritative/i);
  assert.match(work, /expand.*only.*failing test/i);
  assert.match(work, /inspect.*package.*lifecycle/i);
  assert.match(work, /content-producing.*(?:must not|never).*--ignore-scripts/is);
  assert.match(work, /content-neutral.*--ignore-scripts/is);
  assert.match(work, /stale evidence/i);
  assert.match(work, /goal verify.*--/i);
  assert.match(work, /model.*inherit/i);
  assert.match(work, /requested.*effective.*reasoning effort/is);
  assert.match(work, /Light.*medium.*Heavy.*high.*xhigh/is);
  assert.match(work, /completed.*profiles?.*preserv/is);
  assert.match(work, /incomplete.*profiles?.*(?:recalculate|replace)/is);
});

test("agents and phase guidance restore required references and fail closed", async () => {
  const surfaces = await Promise.all([
    "agents/explorer.md",
    "agents/worker.md",
    "skills/cairn-plan/SKILL.md",
    "skills/cairn-work/SKILL.md",
    "skills/cairn-review/SKILL.md",
    "docs/model-guidance/README.md",
    "docs/model-guidance/codex.md",
  ].map(async (path) => [path, await readFile(path, "utf8")]));

  for (const [path, content] of surfaces) {
    assert.match(content, /MEMORY\.md.*(?:phase skill|cairn-(?:plan|work|review)).*active plan.*(?:current-task|current task|completed\/current-task).*model guidance/is, `${path} recovery order`);
    assert.match(content, /missing, unreadable, or inconsistent/is, `${path} missing-reference guard`);
    assert.match(content, /(?:do not|fail closed)/i, `${path} fail-closed action`);
  }

  const allGuidance = surfaces.map(([, content]) => content).join("\n");
  assert.doesNotMatch(allGuidance, /requiredReferences|readReceipt|read_receipt/);
});

test("every supported locale exposes the token-efficient work contract", () => {
  for (const locale of ["en-US", "ko-KR", "ja-JP", "zh-CN", "es-ES", "fr-FR", "de-DE", "pt-BR"]) {
    const work = message("work", locale);
    assert.match(work, /test contract/i, `${locale} test contract`);
    assert.match(work, /tool exit code/i, `${locale} tool result authority`);
    assert.match(work, /content-producing/i, `${locale} lifecycle safety`);
    assert.match(work, /--ignore-scripts/i, `${locale} conditional script skip`);
  }
});

test("supported readmes document safe token-efficient verification and completed plans report completion", async () => {
  for (const path of ["README.md", "README.ko.md", "README.ja.md", "README.zh.md", "README.es.md", "README.fr.md", "README.de.md", "README.pt.md"]) {
    const readme = await readFile(path, "utf8");
    assert.match(readme, /test contract/i, `${path} test contract`);
    assert.match(readme, /content-producing/i, `${path} lifecycle classification`);
    assert.match(readme, /--ignore-scripts/i, `${path} safe package rule`);
  }

  const completedPlan = await readFile("docs/plan/token-efficient-reliable-harness.md", "utf8");
  assert.match(completedPlan, /현재 단계: 완료/);
});

async function withTempRoot(run) {
  const root = await mkdtemp(join(tmpdir(), "cairn-token-efficiency-"));
  const stateHome = `${root}-home`;
  const previousCairnHome = process.env.CAIRN_HOME;
  process.env.CAIRN_HOME = stateHome;
  try {
    await run(root);
  } finally {
    if (previousCairnHome === undefined) delete process.env.CAIRN_HOME;
    else process.env.CAIRN_HOME = previousCairnHome;
    await rm(root, { recursive: true, force: true });
    await rm(stateHome, { recursive: true, force: true });
  }
}
