---
name: cairn-review
description: 완료된 Cairn 조각을 MEMORY.md, PLAN.md, 도메인 정책, 두 단계 증거에 맞춰 검토합니다.
---

# Cairn Review

Cairn으로 의미 있는 구현을 마친 뒤 사용합니다.

## 목적

리뷰는 또 다른 구현 루프가 아닙니다. 완료 조각이 계획을 만족하는지, 메모리와 계획 산출물이 다음 에이전트에게 유용한지 확인합니다.

## 절차

1. `docs/plan/<topic>.md`의 완료 조각을 읽습니다.
2. `MEMORY.md`와 관련 `docs/memory/*.md`를 읽습니다.
3. 변경 파일과 증거 경로를 확인합니다.
4. 독립 검토를 위임합니다.
   - `reviewer`: 계획 준수와 도메인 정책.
   - `worker`: 검증 명령 재실행.
   - `architect`: 필요한 경우 경계나 아키텍처 회귀.
5. 발견 사항을 먼저 보고합니다. 문제가 없으면 명확히 말하고 잔여 위험을 적습니다.

## Reviewer 프롬프트 형식

```text
TASK: <slice-id> 조각의 정확성, 범위, 증거를 검토한다.
EXPECTED OUTCOME: 심각도순 발견 사항 또는 명시적인 무결함 결과.
REQUIRED TOOLS: 읽기 전용 diff 확인, 검증 명령 실행, plan/memory 읽기.
MUST DO: 모듈 증거와 표면 증거를 모두 확인한다. 고유명사를 그대로 보존한다.
MUST NOT DO: 파일을 편집하지 않는다. 사용자에게 묻지 않는다. 빠진 증거를 승인하지 않는다.
CONTEXT: docs/plan/<topic>.md, MEMORY.md, 관련 docs/memory 노트, 변경 파일.
```

## 완료 기준

- 발견 사항이 해결됐거나 잔여 위험으로 기록됐습니다.
- `docs/plan/<topic>.md`에 리뷰 증거가 있습니다.
- 다음 에이전트가 전체 대화를 다시 읽지 않아도 검증 내용을 이해할 수 있습니다.
