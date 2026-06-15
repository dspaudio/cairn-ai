#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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

- Every agent must start assigned work by reading the project-root \`MEMORY.md\` for domain knowledge and repository policy.
- Plans must be decision-complete before implementation.
- Run complexity triage before applying agent, plugin, or delegated workflow guidance.
- Record the selected Light Path or Heavy Path and the checked Heavy Path signals in \`docs/plan/<topic>.md\`.
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
  const result = await runStateResult(event);
  console.log(result.message);
  if (result.status !== 0) process.exitCode = result.status;
}

export async function runState(event = "manual", { root = process.env.HARNESS_REPO_ROOT ?? process.cwd(), locale = localeValue() } = {}) {
  return (await runStateResult(event, { root, locale })).message;
}

export async function runStateResult(event = "manual", { root = process.env.HARNESS_REPO_ROOT ?? process.cwd(), locale = localeValue() } = {}) {
  const resolvedRoot = resolve(root);
  await mkdir(join(resolvedRoot, "docs", "memory"), { recursive: true });
  await mkdir(join(resolvedRoot, "docs", "plan"), { recursive: true });
  await writeIfMissing(join(resolvedRoot, "MEMORY.md"), memoryTemplate);
  await writeIfMissing(join(resolvedRoot, "PLAN.md"), planTemplate);

  const ko = locale.toLowerCase().startsWith("ko");
  if (event === "session-start" || event === "user-prompt-submit") {
    return {
      status: 0,
      message: ko
        ? "Cairn 컨텍스트: 모든 에이전트는 작업 시작 시 도메인 지식과 정책 색인인 프로젝트 루트 MEMORY.md를 먼저 읽어야 합니다."
        : "Cairn context: every agent must start by reading the project-root MEMORY.md for domain knowledge and repository policy.",
    };
  }
  if (event === "post-tool-use") {
    return {
      status: 0,
      message: ko
        ? "Cairn 점검: 외부 상태 변경에는 dry-run/check 증거가 필요하고, 동작이 바뀌었다면 docs/plan 증거를 갱신하세요."
        : "Cairn check: external-state changes need dry-run/check evidence; if behavior changed, update docs/plan evidence.",
    };
  }
  if (event === "stop" || event === "subagent-stop") {
    const pending = await pendingActivePlanItems(resolvedRoot);
    if (pending.length > 0) {
      return {
        status: 1,
        message: stopBlockedMessage({ event, ko, pending }),
      };
    }
    return ko
      ? { status: 0, message: "Cairn 종료 게이트: 완료에는 docs/plan의 dry-run/check, 모듈 수용, 표면 통합 증거가 필요합니다." }
      : { status: 0, message: "Cairn stop gate: completion requires dry-run/check, module acceptance, and surface integration evidence in docs/plan." };
  }
  return {
    status: 0,
    message: ko
      ? "Cairn이 MEMORY.md, PLAN.md, docs/memory, docs/plan을 초기화했습니다."
      : "Cairn initialized MEMORY.md, PLAN.md, docs/memory, and docs/plan.",
  };
}

async function writeIfMissing(path, content) {
  try {
    await readFile(path, "utf8");
  } catch {
    await writeFile(path, content);
  }
}

async function pendingActivePlanItems(root) {
  const planPath = join(root, "PLAN.md");
  const plan = await readFile(planPath, "utf8");
  const activePlans = markdownLinksToPlanFiles(section(plan, "Active Plans"));
  const pending = [];

  for (const relativePath of activePlans) {
    const path = resolve(root, relativePath);
    const pathFromRoot = relative(root, path);
    if (pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot)) continue;
    const text = await readPlanFile(path);
    if (text === null) {
      pending.push({ path: relativePath, unchecked: ["active plan file is missing"], emptyEvidence: [] });
      continue;
    }
    const unchecked = [...text.matchAll(/^\s*-\s+\[\s\]\s+(.+)$/gm)].map((match) => match[1].trim());
    const emptyEvidence = emptyEvidenceItems(text);
    if (unchecked.length > 0 || emptyEvidence.length > 0) {
      pending.push({ path: relativePath, unchecked, emptyEvidence });
    }
  }

  return pending;
}

async function readPlanFile(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function markdownLinksToPlanFiles(text) {
  const paths = new Set();
  const patterns = [
    /\((docs\/plan\/[^)#\s]+\.md)\)/g,
    /`(docs\/plan\/[^`]+\.md)`/g,
    /\b(docs\/plan\/[^\s)`]+\.md)\b/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const path = match[1].replace(/[.,;:]+$/, "");
      if (!path.includes("<topic>")) paths.add(path);
    }
  }
  return [...paths];
}

function emptyEvidenceItems(text) {
  const evidence = section(text, "Evidence");
  if (evidence.length === 0) return [];
  const empty = [];
  for (const match of evidence.matchAll(/^\s*-\s+([^:\n]+):\s*$/gm)) empty.push(match[1].trim());
  return empty;
}

function section(text, title) {
  const pattern = new RegExp(`^##\\s+${escapeRegExp(title)}\\s*$([\\s\\S]*?)(?=^##\\s+|(?![\\s\\S]))`, "m");
  return text.match(pattern)?.[1]?.trim() ?? "";
}

function stopBlockedMessage({ event, ko, pending }) {
  const itemText = pending.slice(0, 3).map(formatPendingItem).join("; ");
  const suffix = pending.length > 3 ? `; +${pending.length - 3} more` : "";
  if (ko) {
    const subject = event === "subagent-stop" ? "서브에이전트 완료 신호" : "완료 신호";
    return `Cairn 종료 게이트: ${subject}를 차단했습니다. 미완료 작업이 남아 있습니다. PLAN.md의 Active Plans를 다시 읽고 다음 미완료 slice를 계속 진행하세요: ${itemText}${suffix}`;
  }
  const subject = event === "subagent-stop" ? "subagent completion signal" : "completion signal";
  return `Cairn stop gate: blocked ${subject}. Incomplete work remains. Re-read PLAN.md Active Plans and continue the next incomplete slice: ${itemText}${suffix}`;
}

function formatPendingItem(item) {
  const reasons = [
    ...item.unchecked.map((label) => `unchecked: ${label}`),
    ...item.emptyEvidence.map((label) => `empty evidence: ${label}`),
  ];
  return `${item.path} (${reasons.slice(0, 3).join(", ")})`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
