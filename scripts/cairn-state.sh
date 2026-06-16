#!/bin/sh
set -eu

event="${1:-manual}"
root="${HARNESS_REPO_ROOT:-$(pwd)}"
locale="${LC_ALL:-${LC_MESSAGES:-${LANG:-en}}}"

mkdir -p "$root/docs/memory" "$root/docs/plan"

memory="$root/MEMORY.md"
plan="$root/PLAN.md"

if [ ! -f "$memory" ]; then
  cat > "$memory" <<'EOF'
# MEMORY

This file is a short index of persistent repository knowledge.

## Domain Knowledge

- Link detailed notes under `docs/memory/`.

## Policy

- Prefer precise repository exploration before implementation.
- Preserve proper nouns, file names, variable names, service names, alert names, MCP tool names, and agent names exactly as written.
- Read only the detailed memory files needed for the current task.
- Write user-visible responses and artifacts in the OS locale unless the user asks for another language.

## Update Rules

- Keep root files short.
- Move detailed domain knowledge to `docs/memory/<domain>.md`.
- Record facts with source paths, commands, and observed behavior.
EOF
fi

if [ ! -f "$plan" ]; then
  cat > "$plan" <<'EOF'
# PLAN

This file is a short index of active and completed work plans.

## Active Plans

- Link detailed plans under `docs/plan/`.

## Completed Plans

- Move completed topics here with evidence links.

## Planning Rules

- Every agent must start assigned work by reading the project-root `MEMORY.md` for domain knowledge and repository policy.
- Plans must be decision-complete before implementation.
- Split implementation into small module tasks.
- Detect repository stack and required LSP/check tools before implementation.
- Install or bootstrap missing required tools before declaring them unavailable.
- Each task normally passes exactly two gates.
  - Module acceptance verification.
  - Surface integration verification.
- Run dry-run or check mode before external-state mutation when available.
- Use at most two verification passes per task by default.
- If a gate fails, diagnose once, shrink the task or split it into sub-tasks, and rerun both gates.
- After two failed passes, record the blocker in `docs/plan/<topic>.md`.
EOF
fi

is_ko() {
  case "$locale" in
    ko*|KO*) return 0 ;;
    *) return 1 ;;
  esac
}

case "$event" in
  session-start|user-prompt-submit)
    if is_ko; then
      printf '%s\n' "Cairn 컨텍스트: 모든 에이전트는 작업 시작 시 도메인 지식과 정책 색인인 프로젝트 루트 MEMORY.md를 먼저 읽어야 합니다."
    else
      printf '%s\n' "Cairn context: every agent must start by reading the project-root MEMORY.md for domain knowledge and repository policy."
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
