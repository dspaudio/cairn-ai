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

- Plans must be decision-complete before implementation.
- Split implementation into small module slices.
- Each slice normally passes exactly two gates.
  - Module acceptance verification.
  - Surface integration verification.
- Repeat verification only when a gate fails or risk requires it.
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
      printf '%s\n' "Cairn 컨텍스트: 먼저 MEMORY.md와 PLAN.md를 읽고, 필요한 경우에만 docs/memory 또는 docs/plan 상세 파일을 여세요."
    else
      printf '%s\n' "Cairn context: read MEMORY.md and PLAN.md first, then open docs/memory or docs/plan details only when needed."
    fi
    ;;
  post-tool-use)
    if is_ko; then
      printf '%s\n' "Cairn 점검: 동작이 바뀌었다면 완료 주장 전에 docs/memory 또는 docs/plan 증거를 갱신하세요."
    else
      printf '%s\n' "Cairn check: if behavior changed, update docs/memory or docs/plan evidence before claiming completion."
    fi
    ;;
  stop|subagent-stop)
    if is_ko; then
      printf '%s\n' "Cairn 종료 게이트: 완료에는 관련 docs/plan 파일에 기록된 모듈 수용 증거와 표면 통합 증거가 필요합니다."
    else
      printf '%s\n' "Cairn stop gate: completion requires module acceptance and surface integration evidence in the related docs/plan file."
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
