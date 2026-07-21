import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readGoalState, startGoal } from "../scripts/cairn-goal.mjs";
import { runStateResult } from "../scripts/cairn-state.mjs";
import { message } from "../scripts/cairn.mjs";

const cliScript = resolve("scripts/cairn.mjs");

test("recurring Codex instructions stay inside the token proxy budget", async () => {
  const manifest = JSON.parse(await readFile(".codex-plugin/plugin.json", "utf8"));
  const prompt = manifest.interface.defaultPrompt.join("\n");

  assert.ok(prompt.length <= 3600, `defaultPrompt is ${prompt.length} characters; budget is 3600`);
  assert.match(prompt, /design executable tests.*before implementation/i);
  assert.match(prompt, /tool exit codes? and (?:machine )?summaries/i);
  assert.match(prompt, /expand context only for failing tests/i);
});

test("hook context is a compact phase capsule without dropping recovery state", async () => {
  await withTempRoot(async (root) => {
    const idle = await runStateResult("user-prompt-submit", {
      root,
      locale: "en-US",
      payload: { cwd: root, session_id: "budget-session", prompt: "Implement the fix" },
    });
    const idleContext = idle.hookOutput.hookSpecificOutput.additionalContext;
    assert.ok(idleContext.length <= 420, `idle hook is ${idleContext.length} characters; budget is 420`);
    assert.match(idleContext, /initial.*triage plan/i);
    assert.match(idleContext, /update_plan.*create_goal/i);
    assert.match(idleContext, /consultation.*plan-only/i);

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
    assert.match(activeContext, /1\. triage \[active\]/);
    assert.match(activeContext, /2\. implement \[pending\]/);
    assert.match(activeContext, /current.*triage/i);
    assert.match(activeContext, /side question.*resume.*triage/i);
    assert.doesNotMatch(activeContext, /request itself as authorization|initial repository plan/i);
  });
});

test("active hook stays bounded for long goals and large roadmaps", async () => {
  await withTempRoot(async (root) => {
    await startGoal({
      root,
      goal: "G".repeat(600),
      planId: "docs/plan/large-roadmap.md",
      ownerSessionId: "large-roadmap-session",
      tasks: Array.from({ length: 20 }, (_, index) => ({
        id: `task-${index + 1}-${"i".repeat(80)}`,
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
    assert.match(context, /task-1/);
    assert.match(context, /omitted/i);
    assert.match(context, /resume task-1/i);
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
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
