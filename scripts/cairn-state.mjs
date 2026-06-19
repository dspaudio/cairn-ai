#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
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
- Install or bootstrap missing required tools before declaring them unavailable.
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
- 필요한 도구가 없으면 사용할 수 없다고 판단하기 전에 설치 또는 부트스트랩을 시도합니다.
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
  const result = await runStateResult(event);
  console.log(result.message);
  if (result.status !== 0) process.exitCode = result.status;
}

export async function runState(event = "manual", { root = process.env.HARNESS_REPO_ROOT ?? process.cwd(), locale = localeValue() } = {}) {
  return (await runStateResult(event, { root, locale })).message;
}

export async function runStateResult(event = "manual", { root = process.env.HARNESS_REPO_ROOT ?? process.cwd(), locale = localeValue() } = {}) {
  const resolvedRoot = resolve(root);
  const ko = locale.toLowerCase().startsWith("ko");
  await mkdir(join(resolvedRoot, "docs", "memory"), { recursive: true });
  await mkdir(join(resolvedRoot, "docs", "plan"), { recursive: true });
  await writeIfMissing(join(resolvedRoot, "MEMORY.md"), ko ? memoryTemplateKo : memoryTemplate);
  await writeIfMissing(join(resolvedRoot, "PLAN.md"), ko ? planTemplateKo : planTemplate);

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
    const pending = await pendingPlanItems(resolvedRoot);
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

async function pendingPlanItems(root) {
  const planPath = join(root, "PLAN.md");
  const plan = await readFile(planPath, "utf8");
  const activePlans = markdownLinksToPlanFiles(section(plan, "Active Plans"));
  const completedPlans = markdownLinksToPlanFiles(section(plan, "Completed Plans"));
  const indexedPlans = new Map();
  for (const relativePath of activePlans) indexedPlans.set(relativePath, "active");
  for (const relativePath of completedPlans) {
    if (!indexedPlans.has(relativePath)) indexedPlans.set(relativePath, "completed");
  }
  for (const relativePath of await docsPlanFiles(root)) {
    if (!indexedPlans.has(relativePath)) indexedPlans.set(relativePath, "unindexed");
  }
  const pending = [];

  for (const [relativePath, indexState] of indexedPlans) {
    const path = resolve(root, relativePath);
    const pathFromRoot = relative(root, path);
    if (pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot)) continue;
    const text = await readPlanFile(path);
    if (text === null) {
      pending.push({ path: relativePath, indexIssues: [`${indexState} plan file is missing`], unchecked: [], emptyEvidence: [] });
      continue;
    }
    const indexIssues = indexState === "unindexed" ? ["not linked in PLAN.md Active Plans or Completed Plans"] : [];
    const unchecked = [...text.matchAll(/^\s*-\s+\[\s\]\s+(.+)$/gm)].map((match) => match[1].trim());
    const emptyEvidence = emptyEvidenceItems(text);
    const missingHeavyPathTests = heavyPathMissingTests(text);
    if (indexIssues.length > 0 || unchecked.length > 0 || emptyEvidence.length > 0 || missingHeavyPathTests.length > 0) {
      pending.push({ path: relativePath, indexIssues, unchecked, emptyEvidence, missingHeavyPathTests });
    }
  }

  return pending;
}

async function docsPlanFiles(root) {
  const entries = await readdir(join(root, "docs", "plan"), { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => `docs/plan/${entry.name}`)
    .sort();
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

function heavyPathMissingTests(text) {
  if (!/^\s*-\s+Selected path:\s*Heavy Path\.?\s*$/im.test(text)) return [];
  const evidence = section(text, "Evidence");
  const hasExplicitTestEvidence = [
    /^\s*-\s+(Tests?|Test execution|Automated tests):\s*\S.+$/im,
    /^\s*-\s+Module acceptance:\s+.*\b(npm test|node --test|pytest|phpunit|go test|cargo test|mvn test|gradle test|swift test|xcodebuild test)\b/im,
  ].some((pattern) => pattern.test(evidence));
  return hasExplicitTestEvidence ? [] : ["Heavy Path test evidence is missing"];
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
    return `Cairn 종료 게이트: ${subject}를 차단했습니다. 미완료 작업이 남아 있습니다. PLAN.md의 Active Plans를 다시 읽고 다음 미완료 task를 계속 진행하세요: ${itemText}${suffix}`;
  }
  const subject = event === "subagent-stop" ? "subagent completion signal" : "completion signal";
  return `Cairn stop gate: blocked ${subject}. Incomplete work remains. Re-read PLAN.md Active Plans and continue the next incomplete task: ${itemText}${suffix}`;
}

function formatPendingItem(item) {
  const reasons = [
    ...(item.indexIssues ?? []).map((label) => `index: ${label}`),
    ...item.unchecked.map((label) => `unchecked: ${label}`),
    ...item.emptyEvidence.map((label) => `empty evidence: ${label}`),
    ...(item.missingHeavyPathTests ?? []).map((label) => `missing tests: ${label}`),
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
