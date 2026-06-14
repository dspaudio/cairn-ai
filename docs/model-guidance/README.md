# 모델 지침

Cairn은 Claude 계열과 Codex 계열만 모델별 보정 대상으로 둡니다.

목적은 모델별 프롬프트를 길게 늘리는 것이 아니라, 같은 `MEMORY.md`/`PLAN.md` 흐름을 모델 특성에 맞게 안정화하는 것입니다.

## 적용 순서

1. 현재 실행 모델명을 확인합니다. 모델명이 직접 노출되지 않으면 사용자 환경의 기본 모델 설정과 에이전트 role frontmatter를 근거로 추정합니다.
2. Claude 계열이면 `docs/model-guidance/claude.md`를 적용합니다.
3. Codex 계열이면 `docs/model-guidance/codex.md`를 적용합니다.
4. 명확히 분류되지 않으면 공통 규칙만 적용하고, 모델별 보정은 하지 않습니다.

## 공통 규칙

- 루트 `MEMORY.md`와 `PLAN.md`는 색인으로만 유지합니다.
- 상세 판단은 `docs/memory/`, `docs/plan/`, `docs/model-guidance/`에 분리합니다.
- 고유명사, 파일명, 변수명, 서비스명, 알림명, MCP 도구명, 에이전트명은 그대로 보존합니다.
- 빠른 경로와 전체 경로 중 하나를 먼저 선택합니다.
- 모든 구현 조각은 모듈 수용 검증과 표면 통합 검증을 통과해야 합니다.

## 역할별 기본 적용

- `architect`: Claude 계열 우선. 긴 컨텍스트, 정책, 경계 판단에 강점을 사용합니다.
- `planner`: Codex 또는 Claude 모두 가능. Codex 계열일 때는 계획 형식과 중단 조건을 더 명시합니다.
- `builder`: Codex 계열 우선. 파일 편집은 작고 명확한 단위로 제한합니다.
- `reviewer`: Claude 계열 우선. 증거 누락, 계획 불일치, 명명 보존을 확인합니다.
- `worker`: 작업 내용에 따라 선택합니다. 검색/기계적 작업은 Codex 계열, 장문 검토는 Claude 계열을 우선합니다.
