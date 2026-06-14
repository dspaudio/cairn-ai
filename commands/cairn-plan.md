# cairn-plan

`cairn-plan` 스킬을 사용합니다.

사전 조건: `scripts/cairn doctor`가 실패하면 `scripts/cairn install` 또는 `scripts/cairn upgrade`로 설치 상태를 복구합니다.

목표: 현재 작업의 결정 완료 계획을 파일로 남깁니다.

절차:

1. `MEMORY.md`와 관련 `docs/memory/*.md`를 읽습니다.
2. 사용자에게 묻기 전에 탐색합니다.
3. 복잡도 트리아지를 수행합니다.
4. 빠른 경로이면 `planner → builder` 순서를 기록합니다.
5. 전체 경로이면 `architect → planner → reviewer → builder → reviewer` 순서를 기록합니다.
6. 선택된 경로에 맞춰 필요한 에이전트에게 위임합니다.
7. `docs/plan/<topic>.md`를 작성합니다.
8. `PLAN.md`에 주제 링크와 상태를 추가합니다.
9. 모든 모듈 조각에 모듈 수용 검증과 표면 통합 검증을 둡니다.
