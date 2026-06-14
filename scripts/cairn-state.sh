#!/bin/sh
set -eu

event="${1:-manual}"
root="${HARNESS_REPO_ROOT:-$(pwd)}"

mkdir -p "$root/docs/memory" "$root/docs/plan"

memory="$root/MEMORY.md"
plan="$root/PLAN.md"

if [ ! -f "$memory" ]; then
  cat > "$memory" <<'EOF'
# MEMORY

이 파일은 지속 저장소 지식의 짧은 색인입니다.

## 도메인 지식

- 상세 노트는 `docs/memory/` 아래에 링크합니다.

## 정책

- 구현 전에 정밀한 탐색을 우선합니다.
- 고유명사, 파일명, 변수명, 서비스명, 알림명, MCP 도구명, 에이전트명은 그대로 보존합니다.
- 현재 작업에 필요한 상세 메모리 파일만 읽습니다.

## 갱신 규칙

- 루트 파일은 짧게 유지합니다.
- 상세 도메인 지식은 `docs/memory/<domain>.md`로 옮깁니다.
- 사실은 출처 경로, 명령, 관찰된 동작과 함께 기록합니다.
EOF
fi

if [ ! -f "$plan" ]; then
  cat > "$plan" <<'EOF'
# PLAN

이 파일은 활성/완료 작업 계획의 짧은 색인입니다.

## 활성 계획

- 상세 계획은 `docs/plan/` 아래에 링크합니다.

## 완료 계획

- 완료 주제는 증거 링크와 함께 이곳으로 옮깁니다.

## 계획 규칙

- 계획은 구현 전에 결정 완료 상태여야 합니다.
- 구현은 작은 모듈 조각으로 나눕니다.
- 각 조각은 기본적으로 정확히 두 게이트를 통과해야 합니다.
  - 모듈 수용 검증.
  - 표면 통합 검증.
- 게이트가 실패했거나 위험상 필요한 경우에만 검증을 반복합니다.
EOF
fi

case "$event" in
  session-start|user-prompt-submit)
    printf '%s\n' "Cairn 컨텍스트: 먼저 MEMORY.md와 PLAN.md를 읽고, 필요한 경우에만 docs/memory 또는 docs/plan 상세 파일을 여세요."
    ;;
  post-tool-use)
    printf '%s\n' "Cairn 점검: 동작이 바뀌었다면 완료 주장 전에 docs/memory 또는 docs/plan 증거를 갱신하세요."
    ;;
  stop|subagent-stop)
    printf '%s\n' "Cairn 종료 게이트: 완료에는 관련 docs/plan 파일에 기록된 모듈 수용 증거와 표면 통합 증거가 필요합니다."
    ;;
  *)
    printf '%s\n' "Cairn이 MEMORY.md, PLAN.md, docs/memory, docs/plan을 초기화했습니다."
    ;;
esac
