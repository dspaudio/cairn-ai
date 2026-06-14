# cairn-memory

`cairn-memory` 스킬을 사용합니다.

목표: 사용자에게 discoverable fact를 묻지 않고 저장소 메모리를 만들거나 갱신합니다.

절차:

1. `MEMORY.md`, `PLAN.md`, `docs/memory`, `docs/plan` 상태를 보장합니다.
2. `MEMORY.md`를 읽습니다.
3. 집중 도구로 저장소 사실을 탐색합니다.
4. 도메인 발견은 `architect`, 정확한 참조는 `worker`, 모순 검사는 `reviewer` 역할로 위임합니다.
5. 상세 내용은 `docs/memory/<domain>.md`에 씁니다.
6. `MEMORY.md`는 짧은 색인으로 유지합니다.
