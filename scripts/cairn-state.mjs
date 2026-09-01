#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { contextResult, foreignSessionContextResult, prependContext } from "./cairn-state-context.mjs";
import { continuationReason, stopAllowedMessage, stopHookOutput } from "./cairn-state-hook.mjs";
import { initializeProject } from "./cairn-state-init.mjs";
import { evaluateStop, isGoalOwnedBySession, reconcileWorktreeState } from "./cairn-goal.mjs";
import { resolveRepoRoot } from "./cairn-paths.mjs";

const recoverableGoalStatuses = new Set(["active", "paused", "blocked"]);

if (isCliEntry()) {
  const event = process.argv[2] ?? "manual";
  const payload = await readHookInput();
  const result = await runStateResult(event, { payload });
  if (isHookEvent(event)) {
    console.log(JSON.stringify(result.hookOutput ?? {}));
  } else {
    console.log(result.message);
  }
  if (result.status !== 0) process.exitCode = result.status;
}

export async function runState(event = "manual", options = {}) {
  return (await runStateResult(event, options)).message;
}

export async function runStateResult(event = "manual", {
  root,
  locale = localeValue(),
  payload,
} = {}) {
  const resolvedRoot = resolveRoot(root, payload);
  const ko = locale.toLowerCase().startsWith("ko");

  if (event === "manual" || event === "init") {
    await initializeProject(resolvedRoot, ko);
    return {
      status: 0,
      message: ko
        ? "Cairn이 MEMORY.md, PLAN.md, docs/memory, docs/plan을 초기화했습니다."
        : "Cairn initialized MEMORY.md, PLAN.md, docs/memory, and docs/plan.",
    };
  }

  if (event === "session-start" || event === "user-prompt-submit") {
    const reconciled = await reconcileWorktreeState({ root: resolvedRoot });
    const state = reconciled.state;
    if (recoverableGoalStatuses.has(state?.goal?.status) && !isGoalOwnedBySession(state, payload?.session_id)) {
      return foreignSessionContextResult({ ko, event });
    }
    const result = contextResult({ ko, state, event });
    if (!reconciled.removed) return result;
    const notice = ko
      ? "Cairn worktree 점검: 현재 worktree에 속하지 않는 stale Cairn 상태를 제거했습니다."
      : "Cairn worktree check: removed stale Cairn state that did not belong to this worktree.";
    return prependContext(result, notice);
  }

  if (event === "post-tool-use") {
    const message = ko
      ? "Cairn 점검: 외부 상태 변경에는 dry-run/check 증거 기록이 필요합니다. 활성 목표가 있다면 현재 task에 성공 증거를 기록하세요."
      : "Cairn check: external-state changes need dry-run/check evidence. When a goal is active, record successful evidence for its current task.";
    return {
      status: 0,
      message,
      hookOutput: {
        hookSpecificOutput: {
          hookEventName: "PostToolUse",
          additionalContext: message,
        },
      },
    };
  }

  if (event === "stop" || event === "subagent-stop") {
    const { state } = await reconcileWorktreeState({ root: resolvedRoot });
    if (!isGoalOwnedBySession(state, payload?.session_id)) return { status: 0, message: "", hookOutput: {} };
    const gate = evaluateStop(state, {
      subagent: event === "subagent-stop",
      agentId: payload?.agent_id,
    });
    const hookOutput = stopHookOutput(gate, payload);
    return {
      status: 0,
      message: gate.block ? continuationReason(gate.reason, payload) : stopAllowedMessage({ ko, state, event }),
      hookOutput,
    };
  }

  return {
    status: 0,
    message: ko ? "Cairn: 지원하지 않는 상태 이벤트를 건너뛰었습니다." : "Cairn: skipped an unsupported state event.",
  };
}

function resolveRoot(root, payload) {
  return resolveRepoRoot({
    explicitRoot: root ?? null,
    hookCwd: payload?.cwd ?? null,
  });
}

async function readHookInput() {
  if (process.stdin.isTTY) return undefined;
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  if (input.trim().length === 0) return undefined;
  try {
    const value = JSON.parse(input);
    return value && typeof value === "object" ? value : undefined;
  } catch {
    return undefined;
  }
}

function isHookEvent(event) {
  return ["session-start", "user-prompt-submit", "post-tool-use", "stop", "subagent-stop"].includes(event);
}

function localeValue() {
  return [process.env.LC_ALL, process.env.LC_MESSAGES, process.env.LANG]
    .find((value) => typeof value === "string" && value.length > 0) ?? Intl.DateTimeFormat().resolvedOptions().locale;
}

function isCliEntry() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  }
}
