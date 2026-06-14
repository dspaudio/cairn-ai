---
name: cairn-memory
description: 토큰 효율적인 Codex, Claude Code, Antigravity 에이전트 작업을 위해 저장소 MEMORY.md와 docs/memory 도메인 노트를 만들고 유지합니다.
---

# Cairn Memory

도메인 지식, 저장소 정책, 계획 전 컨텍스트 압축이 필요할 때 사용합니다.

## 목적

루트 `MEMORY.md`는 상세 지식이 아니라 색인입니다. 상세 내용은 `docs/memory/<domain>.md`에 기록합니다.

## 절차

1. `scripts/cairn-state.sh manual`이 있으면 실행합니다. 없으면 `MEMORY.md`, `PLAN.md`, `docs/memory`, `docs/plan`을 직접 보장합니다.
2. 사용자에게 묻기 전에 저장소를 탐색합니다.
3. 사용자 질문 대신 에이전트에게 위임합니다.
   - `architect`: 도메인 경계, 불변식, 정책.
   - `worker`: 정확한 파일 경로, 명령, 스키마, 참조.
   - `reviewer`: 모순과 오래된 사실.
4. 상세 사실은 `docs/memory/<domain>.md`에 씁니다.
5. `MEMORY.md`에는 한 줄 링크와 요약만 둡니다.

## 위임 프롬프트 형식

```text
TASK: <domain>의 지속 도메인 지식을 탐색한다.
EXPECTED OUTCOME: 사실, 출처 경로, 증명 명령을 간결하게 반환한다.
REQUIRED TOOLS: 읽기 전용 파일 검색, LSP/심볼 도구, 명령 확인.
MUST DO: 고유명사를 그대로 보존한다. 로컬 경로를 인용한다. 사실과 추론을 분리한다.
MUST NOT DO: 파일을 편집하지 않는다. 사용자에게 묻지 않는다. 누락된 이름을 추측하지 않는다.
CONTEXT: 현재 작업, 저장소 루트, 기존 MEMORY.md 항목.
```

## 완료 기준

- `MEMORY.md`가 상세 노트를 링크합니다.
- 상세 노트는 범위가 명확하고 출처가 있으며, 원본 파일을 통째로 읽는 것보다 짧습니다.
- 루트 색인에 긴 설명이 중복되지 않습니다.
