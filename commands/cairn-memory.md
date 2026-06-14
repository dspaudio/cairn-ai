# cairn-memory

`cairn-memory` 스킬을 사용합니다.

사전 조건: `scripts/cairn doctor`가 실패하면 `scripts/cairn install` 또는 `scripts/cairn upgrade`로 설치 상태를 복구합니다.

목표: 사용자에게 discoverable fact를 묻지 않고 저장소 메모리를 만들거나 갱신합니다.

절차:

1. 플러그인 상태 초기화 스크립트를 실행합니다.
2. `MEMORY.md`를 읽습니다.
3. 집중 도구로 저장소 사실을 탐색합니다.
4. 도메인 발견은 `architect`, 정확한 참조는 `worker`, 모순 검사는 `reviewer`에게 위임합니다.
5. 상세 내용은 `docs/memory/<domain>.md`에 씁니다.
6. `MEMORY.md`는 짧은 색인으로 유지합니다.
