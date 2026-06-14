# cairn-work

`cairn-work` 스킬을 사용합니다.

사전 조건: `scripts/cairn doctor`가 실패하면 `scripts/cairn install` 또는 `scripts/cairn upgrade`로 설치 상태를 복구합니다.

목표: `PLAN.md`의 다음 미완료 모듈 조각을 실행합니다.

절차:

1. `PLAN.md`, 상세 계획, `MEMORY.md`, 관련 메모리 노트를 읽습니다.
2. 하나의 작은 모듈 조각을 선택합니다.
3. 계획에 기록된 복잡도 트리아지와 선택 경로를 확인합니다.
4. 빠른 경로이면 `planner → builder` 순서로 진행합니다.
5. 전체 경로이면 `architect → planner → reviewer → builder → reviewer` 순서를 지킵니다.
6. 구현을 `builder` 또는 `worker`에게 위임합니다.
7. 모듈 수용 검증을 다시 실행합니다.
8. 표면 통합 검증을 다시 실행합니다.
9. `docs/plan/<topic>.md`에 증거를 기록하고 `PLAN.md`를 갱신합니다.
