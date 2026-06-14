# cairn-plan

`cairn-plan` 스킬을 사용합니다.

목표: 현재 작업의 결정 완료 계획을 파일로 남깁니다.

절차:

1. `MEMORY.md`와 관련 `docs/memory/*.md`를 읽습니다.
2. 현재 실행 모델 또는 배정 모델이 Claude 계열이면 `docs/model-guidance/claude.md`, Codex 계열이면 `docs/model-guidance/codex.md`를 읽습니다.
3. 사용자에게 묻기 전에 탐색합니다.
4. 복잡도 트리아지를 수행합니다.
5. 빠른 경로이면 `planner -> builder` 순서를 기록합니다.
6. 전체 경로이면 `architect -> planner -> reviewer -> builder -> reviewer` 순서를 기록합니다.
7. 선택된 경로와 모델 지침에 맞춰 필요한 에이전트에게 위임합니다.
8. `docs/plan/<topic>.md`를 작성합니다.
9. `PLAN.md`에 주제 링크와 상태를 추가합니다.
10. 모든 모듈 조각에 모듈 수용 검증과 표면 통합 검증을 둡니다.
