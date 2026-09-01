import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { assertNoSymlinkComponents, safeMkdir, safeWriteFile } from "./cairn-safe-fs.mjs";

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

- Read project-root \`MEMORY.md\` first when it exists; if it is absent, continue without repository memory.
- For non-trivial implementation or continuation of planned work, first write or restore a plan with \`triage-plan\` active and synchronize it before exploration. Known-target Git/GitHub operations stay plan/goal-free unless they require code edits, conflict resolution, destructive recovery, release/deploy, or design.
- Plans must be decision-complete before implementation.
- Run complexity triage before applying agent, plugin, or delegated workflow guidance.
- Record the selected Light Path or Heavy Path and the checked Heavy Path signals in \`docs/plan/<topic>.md\`.
- Record request, planning, and code checkpoints. When the route changes before editing, synchronize the plan artifact, repository goal task roadmap through \`goal replan\`, and native UI plan. After editing starts, a new Heavy Path signal promotes Light Path to Heavy Path; stop further edits, mark affected evidence stale, synchronize all three roadmaps, and repeat the code checkpoint.
- Keep models inherited. Record requested/effective reasoning effort per task: Light planning/implementation/verification=\`medium\`; Heavy planning/review/implementation=\`high\`; final verification/review=\`xhigh\`. A route change also synchronizes the reasoning effort profile, preserving completed profiles and recalculating incomplete profiles. Unsupported host/value means effective=\`inherited\` with no model/global config change.
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

- 프로젝트 루트 \`MEMORY.md\`가 있으면 먼저 읽고, 없으면 저장소 메모리 없이 계속 진행합니다.
- 비단순 구현 또는 계획된 작업 재개는 먼저 \`triage-plan\`이 active인 계획을 쓰거나 복원하고 탐색 전에 동기화합니다. 대상이 확정된 Git/GitHub 운영은 코드 수정·충돌 해결·파괴적 복구·릴리스/배포·설계가 필요하지 않으면 plan/goal 없이 실행합니다.
- 계획은 구현 전에 의사결정이 완료된 상태여야 합니다.
- 에이전트, 플러그인, 위임 워크플로 지침을 적용하기 전에 복잡도 트리아지를 실행합니다.
- 선택한 Light Path 또는 Heavy Path와 확인한 Heavy Path 신호를 \`docs/plan/<topic>.md\`에 기록합니다.
- 요청, 계획, 코드 체크포인트를 기록합니다. 편집 전에 경로가 바뀌면 plan artifact, 저장소 goal task roadmap, native UI plan을 동기화합니다. 편집 뒤 새 Heavy Path 신호가 나오면 추가 편집을 중단하고 관련 증거를 stale로 표시한 뒤 세 roadmap과 코드 체크포인트를 다시 맞춥니다.
- 모델은 상속하고 task별 requested/effective reasoning effort를 기록합니다. Light 계획/구현/검증은 \`medium\`, Heavy 계획/검토/구현은 \`high\`, 최종 검증/검토는 \`xhigh\`입니다. 경로 변경 시 reasoning effort profile도 동기화하고 완료 profile은 보존하며 미완료 profile은 재계산합니다. 미지원 host/value는 model/global config 변경 없이 effective=\`inherited\`입니다.
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

export async function initializeProject(root, ko) {
  await safeMkdir(root, "docs/memory");
  await safeMkdir(root, "docs/plan");
  await writeIfMissing(root, join(root, "MEMORY.md"), ko ? memoryTemplateKo : memoryTemplate);
  await writeIfMissing(root, join(root, "PLAN.md"), ko ? planTemplateKo : planTemplate);
}

async function writeIfMissing(root, path, content) {
  await assertNoSymlinkComponents(root, path);
  try {
    await readFile(path, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    try {
      await safeWriteFile(root, path, content, { encoding: "utf8", flag: "wx" });
    } catch (writeError) {
      if (writeError?.code !== "EEXIST") throw writeError;
      await assertNoSymlinkComponents(root, path, { allowMissing: false });
    }
  }
}
