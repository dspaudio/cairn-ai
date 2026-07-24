#!/bin/sh
set -eu

event="${1:-manual}"
root="${HARNESS_REPO_ROOT:-$(pwd)}"
locale="${LC_ALL:-${LC_MESSAGES:-${LANG:-en}}}"

mkdir -p "$root/docs/memory" "$root/docs/plan"

memory="$root/MEMORY.md"
plan="$root/PLAN.md"

is_ko() {
  case "$locale" in
    ko*|KO*) return 0 ;;
    *) return 1 ;;
  esac
}

if [ ! -f "$memory" ]; then
  if is_ko; then
  cat > "$memory" <<'EOF'
# MEMORY

이 파일은 지속적으로 필요한 저장소 지식의 짧은 색인입니다.

## Domain Knowledge

- 자세한 기록은 `docs/memory/` 아래에 연결합니다.

## Policy

- 구현 전에는 저장소를 정확히 탐색합니다.
- 고유명사, 파일 이름, 변수 이름, 서비스 이름, 알림 이름, MCP 도구 이름, 에이전트 이름은 쓰인 그대로 보존합니다.
- 현재 작업에 필요한 상세 메모리 파일만 읽습니다.
- 사용자가 다른 언어를 요청하지 않는 한, 사용자에게 보이는 응답과 생성 또는 갱신하는 문서, 계획, 메모리 산출물은 OS locale 언어로 작성합니다.

## Update Rules

- 루트 파일은 짧게 유지합니다.
- 자세한 도메인 지식은 `docs/memory/<domain>.md`로 옮깁니다.
- 사실은 출처 경로, 명령, 관찰된 동작과 함께 기록합니다.
EOF
  else
  cat > "$memory" <<'EOF'
# MEMORY

This file is a short index of persistent repository knowledge.

## Domain Knowledge

- Link detailed notes under `docs/memory/`.

## Policy

- Prefer precise repository exploration before implementation.
- Preserve proper nouns, file names, variable names, service names, alert names, MCP tool names, and agent names exactly as written.
- Read only the detailed memory files needed for the current task.
- Write user-visible responses and generated or updated documentation, plans, and memory artifacts in the OS locale unless the user asks for another language.

## Update Rules

- Keep root files short.
- Move detailed domain knowledge to `docs/memory/<domain>.md`.
- Record facts with source paths, commands, and observed behavior.
EOF
  fi
fi

if [ ! -f "$plan" ]; then
  if is_ko; then
  cat > "$plan" <<'EOF'
# PLAN

이 파일은 진행 중이거나 완료된 작업 계획의 짧은 색인입니다.

## Active Plans

- 상세 계획은 `docs/plan/` 아래에 연결합니다.

## Completed Plans

- 완료된 주제는 증거 링크와 함께 이곳으로 옮깁니다.

## Planning Rules

- 프로젝트 루트 `MEMORY.md`가 있으면 먼저 읽고, 없으면 저장소 메모리 없이 계속 진행합니다.
- 비단순 구현 또는 계획된 작업 재개는 먼저 `triage-plan`이 active인 계획을 쓰거나 복원하고 탐색 전에 동기화합니다. 대상이 확정된 Git/GitHub 운영은 코드 수정·충돌 해결·파괴적 복구·릴리스/배포·설계가 필요하지 않으면 plan/goal 없이 실행합니다.
- 계획은 구현 전에 의사결정이 완료된 상태여야 합니다.
- 에이전트, 플러그인, 위임 워크플로 지침을 적용하기 전에 복잡도 트리아지를 실행합니다.
- 선택한 Light Path 또는 Heavy Path와 확인한 Heavy Path 신호를 `docs/plan/<topic>.md`에 기록합니다.
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
- 두 번 실패한 뒤에는 blocker를 `docs/plan/<topic>.md`에 기록합니다.
EOF
  else
  cat > "$plan" <<'EOF'
# PLAN

This file is a short index of active and completed work plans.

## Active Plans

- Link detailed plans under `docs/plan/`.

## Completed Plans

- Move completed topics here with evidence links.

## Planning Rules

- Read project-root `MEMORY.md` first when it exists; if it is absent, continue without repository memory.
- For non-trivial implementation or continuation of planned work, first write or restore a plan with `triage-plan` active and synchronize it before exploration. Known-target Git/GitHub operations stay plan/goal-free unless they require code edits, conflict resolution, destructive recovery, release/deploy, or design.
- Plans must be decision-complete before implementation.
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
- After two failed passes, record the blocker in `docs/plan/<topic>.md`.
EOF
  fi
fi

case "$event" in
  session-start|user-prompt-submit)
    if is_ko; then
      printf '%s\n' "Cairn 컨텍스트: 프로젝트 루트 MEMORY.md가 있으면 읽고, 없으면 저장소 메모리 없이 계속 진행합니다."
    else
      printf '%s\n' "Cairn context: read project-root MEMORY.md first when present; if absent, continue without repository memory."
    fi
    ;;
  post-tool-use)
    if is_ko; then
      printf '%s\n' "Cairn 점검: 외부 상태 변경에는 dry-run/check 증거가 필요하고, 동작이 바뀌었다면 docs/plan 증거를 갱신하세요."
    else
      printf '%s\n' "Cairn check: external-state changes need dry-run/check evidence; if behavior changed, update docs/plan evidence."
    fi
    ;;
  stop|subagent-stop)
    if is_ko; then
      printf '%s\n' "Cairn 종료 게이트: 완료에는 docs/plan의 dry-run/check, 모듈 수용, 표면 통합 증거가 필요합니다."
    else
      printf '%s\n' "Cairn stop gate: completion requires dry-run/check, module acceptance, and surface integration evidence in docs/plan."
    fi
    ;;
  *)
    if is_ko; then
      printf '%s\n' "Cairn이 MEMORY.md, PLAN.md, docs/memory, docs/plan을 초기화했습니다."
    else
      printf '%s\n' "Cairn initialized MEMORY.md, PLAN.md, docs/memory, and docs/plan."
    fi
    ;;
esac
