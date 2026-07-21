#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { evaluateStop, isGoalOwnedBySession, readGoalState } from "./cairn-goal.mjs";
import { resolveRepoRoot } from "./cairn-paths.mjs";

const memoryTemplate = `# MEMORY

This file is a short index of persistent repository knowledge.

## Domain Knowledge

- Link detailed notes under \`docs/memory/\`.

## Policy

- Prefer precise repository exploration before implementation.
- Preserve proper nouns, file names, variable names, service names, alert names, MCP tool names, and agent names exactly as written.
- Read only the detailed memory files needed for the current task.
- Write user-visible responses and generated or updated documentation, plans, and memory artifacts in the OS locale unless the user asks for another language.

## Update Rules

- Keep root files short.
- Move detailed domain knowledge to \`docs/memory/<domain>.md\`.
- Record facts with source paths, commands, and observed behavior.
`;

const memoryTemplateKo = `# MEMORY

이 파일은 지속적으로 필요한 저장소 지식의 짧은 색인입니다.

## Domain Knowledge

- 자세한 기록은 \`docs/memory/\` 아래에 연결합니다.

## Policy

- 구현 전에는 저장소를 정확히 탐색합니다.
- 고유명사, 파일 이름, 변수 이름, 서비스 이름, 알림 이름, MCP 도구 이름, 에이전트 이름은 쓰인 그대로 보존합니다.
- 현재 작업에 필요한 상세 메모리 파일만 읽습니다.
- 사용자가 다른 언어를 요청하지 않는 한, 사용자에게 보이는 응답과 생성 또는 갱신하는 문서, 계획, 메모리 산출물은 OS locale 언어로 작성합니다.

## Update Rules

- 루트 파일은 짧게 유지합니다.
- 자세한 도메인 지식은 \`docs/memory/<domain>.md\`로 옮깁니다.
- 사실은 출처 경로, 명령, 관찰된 동작과 함께 기록합니다.
`;

const planTemplate = `# PLAN

This file is a short index of active and completed work plans.

## Active Plans

- Link detailed plans under \`docs/plan/\`.

## Completed Plans

- Move completed topics here with evidence links.

## Planning Rules

- Every agent must start assigned work by reading the project-root \`MEMORY.md\` for domain knowledge and repository policy.
- Plans must be decision-complete before implementation.
- Run complexity triage before applying agent, plugin, or delegated workflow guidance.
- Record the selected Light Path or Heavy Path and the checked Heavy Path signals in \`docs/plan/<topic>.md\`.
- Split implementation into small module tasks.
- Detect repository stack and required LSP/check tools before implementation.
- Record missing required tools and suggested commands. Run only pinned, supported installation steps after explicit user approval.
- Each task normally passes exactly two gates.
  - Module acceptance verification.
  - Surface integration verification.
- Run dry-run or check mode before external-state mutation when available.
- Write user-visible responses and generated or updated documentation, plans, and memory artifacts in the OS locale unless the user asks for another language.
- Use at most two verification passes per task by default.
- If a gate fails, diagnose once, shrink the task or split it into sub-tasks, and rerun both gates.
- After two failed passes, record the blocker in \`docs/plan/<topic>.md\`.
`;

const planTemplateKo = `# PLAN

이 파일은 진행 중이거나 완료된 작업 계획의 짧은 색인입니다.

## Active Plans

- 상세 계획은 \`docs/plan/\` 아래에 연결합니다.

## Completed Plans

- 완료된 주제는 증거 링크와 함께 이곳으로 옮깁니다.

## Planning Rules

- 모든 에이전트는 배정된 작업을 시작할 때 도메인 지식과 저장소 정책을 위해 프로젝트 루트 \`MEMORY.md\`를 먼저 읽어야 합니다.
- 계획은 구현 전에 의사결정이 완료된 상태여야 합니다.
- 에이전트, 플러그인, 위임 워크플로 지침을 적용하기 전에 복잡도 트리아지를 실행합니다.
- 선택한 Light Path 또는 Heavy Path와 확인한 Heavy Path 신호를 \`docs/plan/<topic>.md\`에 기록합니다.
- 구현은 작은 모듈 작업으로 나눕니다.
- 구현 전에 저장소 스택과 필요한 LSP/check 도구를 감지합니다.
- 필요한 도구가 없으면 누락 상태와 제안 명령을 기록합니다. 명시적 사용자 승인 뒤에만 고정된 지원 설치 단계를 실행합니다.
- 각 작업은 보통 정확히 두 게이트를 통과합니다.
  - 모듈 수용 검증.
  - 표면 통합 검증.
- 외부 상태 변경 전에는 가능한 경우 dry-run 또는 check mode를 실행합니다.
- 사용자가 다른 언어를 요청하지 않는 한, 사용자에게 보이는 응답과 생성 또는 갱신하는 문서, 계획, 메모리 산출물은 OS locale 언어로 작성합니다.
- 기본적으로 작업당 검증은 최대 두 번만 수행합니다.
- 게이트가 실패하면 한 번 진단하고, 작업을 줄이거나 sub-task로 나눈 뒤 두 게이트를 다시 실행합니다.
- 두 번 실패한 뒤에는 blocker를 \`docs/plan/<topic>.md\`에 기록합니다.
`;

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
    const state = await readGoalState({ root: resolvedRoot });
    if (!isGoalOwnedBySession(state, payload?.session_id)) return { status: 0, message: "", hookOutput: {} };
    return contextResult({ ko, state, event });
  }

  if (event === "post-tool-use") {
    return {
      status: 0,
      message: ko
        ? "Cairn 점검: 외부 상태 변경에는 dry-run/check receipt가 필요합니다. 활성 목표가 있다면 현재 task에 성공 receipt를 기록하세요."
        : "Cairn check: external-state changes need a dry-run/check receipt. When a goal is active, record a successful receipt for its current task.",
      hookOutput: {},
    };
  }

  if (event === "stop" || event === "subagent-stop") {
    const state = await readGoalState({ root: resolvedRoot });
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

async function initializeProject(root, ko) {
  await mkdir(join(root, "docs", "memory"), { recursive: true });
  await mkdir(join(root, "docs", "plan"), { recursive: true });
  await writeIfMissing(join(root, "MEMORY.md"), ko ? memoryTemplateKo : memoryTemplate);
  await writeIfMissing(join(root, "PLAN.md"), ko ? planTemplateKo : planTemplate);
}

async function writeIfMissing(path, content) {
  try {
    await readFile(path, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    await writeFile(path, content);
  }
}

function contextResult({ ko, state, event }) {
  const base = ko
    ? "Cairn 컨텍스트: 작업 전 프로젝트 루트 MEMORY.md를 읽으세요."
    : "Cairn context: read the project-root MEMORY.md before working.";
  if (!state || state.goal.status !== "active") return { status: 0, message: base, hookOutput: {} };
  const task = state.tasks.find((item) => item.status === "active") ?? state.tasks.find((item) => item.status === "pending");
  if (!task) {
    const message = `${base} ${activeGoalCompletionMessage(ko, state)}`;
    return {
      status: 0,
      message,
      hookOutput: {
        hookSpecificOutput: {
          hookEventName: event === "session-start" ? "SessionStart" : "UserPromptSubmit",
          additionalContext: message,
        },
      },
    };
  }
  const continuation = ko
    ? `활성 목표 "${state.goal.title}"의 현재 task는 ${task.id} (${task.title})입니다. 완료 전 성공 receipt를 기록하세요.`
    : `Active goal "${state.goal.title}" current task: ${task.id} (${task.title}). Record a successful receipt before completing it.`;
  return {
    status: 0,
    message: `${base} ${continuation}`,
    hookOutput: {
      hookSpecificOutput: {
        hookEventName: event === "session-start" ? "SessionStart" : "UserPromptSubmit",
        additionalContext: `${base} ${continuation}`,
      },
    },
  };
}

function continuationReason(reason, payload) {
  const continuation = payload?.stop_hook_active ? " This turn was already continued; the active goal remains persisted for the next session." : "";
  return `${reason}${continuation}`;
}

function stopHookOutput(gate, payload) {
  if (!gate.block) return { continue: true };
  const reason = continuationReason(gate.reason, payload);
  if (payload?.stop_hook_active) {
    return { continue: true, systemMessage: reason };
  }
  return { decision: "block", reason };
}

function stopAllowedMessage({ ko, state, event }) {
  if (state?.goal?.status) {
    return ko
      ? `Cairn 종료 게이트: 목표 상태가 ${state.goal.status}이므로 종료를 허용합니다.`
      : `Cairn stop gate: goal status is ${state.goal.status}; allowing stop.`;
  }
  return ko
    ? `${event === "subagent-stop" ? "서브에이전트" : "작업"} 종료 게이트: 활성 Cairn 목표가 없어 종료를 허용합니다.`
    : `${event === "subagent-stop" ? "Subagent" : "Turn"} stop gate: no active Cairn goal; allowing stop.`;
}

function activeGoalCompletionMessage(ko, state) {
  return ko
    ? `활성 목표 "${state.goal.title}"의 모든 task가 완료되었습니다. 완료 기준을 확인하고 명시적으로 complete 상태로 전이하세요.`
    : `All tasks for active goal "${state.goal.title}" are complete. Verify criteria and explicitly transition the goal to completed.`;
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
