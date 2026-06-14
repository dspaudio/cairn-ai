#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const memoryTemplate = `# MEMORY

This file is a short index of persistent repository knowledge.

## Domain Knowledge

- Link detailed notes under \`docs/memory/\`.

## Policy

- Prefer precise repository exploration before implementation.
- Preserve proper nouns, file names, variable names, service names, alert names, MCP tool names, and agent names exactly as written.
- Read only the detailed memory files needed for the current task.
- Write user-visible responses and artifacts in the OS locale unless the user asks for another language.

## Update Rules

- Keep root files short.
- Move detailed domain knowledge to \`docs/memory/<domain>.md\`.
- Record facts with source paths, commands, and observed behavior.
`;

const planTemplate = `# PLAN

This file is a short index of active and completed work plans.

## Active Plans

- Link detailed plans under \`docs/plan/\`.

## Completed Plans

- Move completed topics here with evidence links.

## Planning Rules

- Plans must be decision-complete before implementation.
- Split implementation into small module slices.
- Detect repository stack and required LSP/check tools before implementation.
- Install or bootstrap missing required tools before declaring them unavailable.
- Each slice normally passes exactly two gates.
  - Module acceptance verification.
  - Surface integration verification.
- Run dry-run or check mode before external-state mutation when available.
- Use at most two verification passes per slice by default.
- If a gate fails, diagnose once, shrink or split the slice, and rerun both gates.
- After two failed passes, record the blocker in \`docs/plan/<topic>.md\`.
`;

if (isCliEntry()) {
  const event = process.argv[2] ?? "manual";
  console.log(await runState(event));
}

export async function runState(event = "manual", { root = process.env.HARNESS_REPO_ROOT ?? process.cwd(), locale = localeValue() } = {}) {
  const resolvedRoot = resolve(root);
  await mkdir(join(resolvedRoot, "docs", "memory"), { recursive: true });
  await mkdir(join(resolvedRoot, "docs", "plan"), { recursive: true });
  await writeIfMissing(join(resolvedRoot, "MEMORY.md"), memoryTemplate);
  await writeIfMissing(join(resolvedRoot, "PLAN.md"), planTemplate);

  const ko = locale.toLowerCase().startsWith("ko");
  if (event === "session-start" || event === "user-prompt-submit") {
    return ko
      ? "Cairn 컨텍스트: 먼저 MEMORY.md와 PLAN.md를 읽고, 필요한 경우 toolcheck로 LSP/check 도구 준비 상태를 확인하세요."
      : "Cairn context: read MEMORY.md and PLAN.md first, then run toolcheck when LSP/check tool readiness is needed.";
  }
  if (event === "post-tool-use") {
    return ko
      ? "Cairn 점검: 외부 상태 변경에는 dry-run/check 증거가 필요하고, 동작이 바뀌었다면 docs/plan 증거를 갱신하세요."
      : "Cairn check: external-state changes need dry-run/check evidence; if behavior changed, update docs/plan evidence.";
  }
  if (event === "stop" || event === "subagent-stop") {
    return ko
      ? "Cairn 종료 게이트: 완료에는 docs/plan의 dry-run/check, 모듈 수용, 표면 통합 증거가 필요합니다."
      : "Cairn stop gate: completion requires dry-run/check, module acceptance, and surface integration evidence in docs/plan.";
  }
  return ko
    ? "Cairn이 MEMORY.md, PLAN.md, docs/memory, docs/plan을 초기화했습니다."
    : "Cairn initialized MEMORY.md, PLAN.md, docs/memory, and docs/plan.";
}

async function writeIfMissing(path, content) {
  try {
    await readFile(path, "utf8");
  } catch {
    await writeFile(path, content);
  }
}

function localeValue() {
  return [process.env.LC_ALL, process.env.LC_MESSAGES, process.env.LANG]
    .find((value) => typeof value === "string" && value.length > 0) ?? Intl.DateTimeFormat().resolvedOptions().locale;
}

function isCliEntry() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}
