---
name: cairn-work
description: docs/plan 모듈 조각을 작은 범위의 builder 위임과 두 단계 검증으로 실행합니다.
---

# Cairn Work

`cairn-plan`으로 만든 계획을 구현할 때 사용합니다.

## 목적

한 번에 하나의 모듈 조각만 실행합니다. 반복 red-green 루프가 아니라, 작은 조각을 두 개의 강한 검증으로 증명합니다.

## 절차

1. `PLAN.md`, 선택한 `docs/plan/<topic>.md`, `MEMORY.md`, 관련 메모리 노트를 읽습니다.
2. 첫 번째 미완료 모듈 조각을 선택합니다.
3. 계획의 선택 경로를 확인합니다.
4. 빠른 경로이면 `planner → builder` 순서를 유지하고 바로 `builder`에게 위임합니다.
5. 전체 경로이면 `architect → planner → reviewer → builder → reviewer` 순서를 유지합니다. 구현 전 `reviewer`는 계획 공백을 확인하고, 구현 후 `reviewer`는 증거와 회귀를 확인합니다.
6. 정확한 파일과 제약을 포함해 `builder` 또는 `worker`에게 구현을 위임합니다.
7. `builder`는 변경 파일, 모듈 수용 명령과 결과, 표면 통합 명령 또는 QA 산출물, 정리 내역을 반환해야 합니다.
8. 두 검증을 직접 다시 실행합니다.
9. 조각 완료 표시 전에 계획 파일에 증거를 기록합니다.

## Builder 프롬프트 형식

```text
TASK: <topic>의 <slice-id> 조각을 구현한다.
EXPECTED OUTCOME: 조각 계약을 만족하는 최소 코드/문서 변경.
REQUIRED TOOLS: 범위가 지정된 파일 편집, 기존 테스트/빌드 명령, 표면 QA 명령.
MUST DO: MEMORY.md 정책을 따른다. 나열된 파일 범위 안에서 작업한다. 모듈 증거와 표면 증거를 제공한다.
MUST NOT DO: 사용자에게 묻지 않는다. 관련 없는 코드를 리팩터링하지 않는다. 증거 없이 완료를 주장하지 않는다.
CONTEXT: docs/plan/<topic>.md 조각, 관련 docs/memory 노트, 정확한 파일, 검증 명령.
```

## 두 단계 검증

- 모듈 수용: 모듈 계약을 증명하는 targeted unit, typecheck, lint, parser, schema, command.
- 표면 통합: 실제 표면에서 동작을 증명하는 HTTP, browser, CLI, tmux, desktop, parsed artifact.

## 완료 기준

- 현재 턴에서 두 검증이 모두 통과했습니다.
- 계획에 기록된 선택 경로의 필수 역할 순서를 지켰습니다.
- 증거가 `docs/plan/<topic>.md`에 기록됐습니다.
- 증거가 생긴 뒤에만 `PLAN.md` 상태가 갱신됐습니다.
