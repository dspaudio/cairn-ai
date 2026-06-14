# cairn-review

`cairn-review` 스킬을 사용합니다.

사전 조건: `scripts/cairn doctor`가 실패하면 `scripts/cairn install` 또는 `scripts/cairn upgrade`로 설치 상태를 복구합니다.

목표: 완료 작업을 계획, 메모리, 정책, 증거 기준으로 검토합니다.

절차:

1. 계획 조각과 메모리 입력을 읽습니다.
2. 변경 파일과 증거를 확인합니다.
3. 독립 검토를 `reviewer`, `worker`, 필요 시 `architect`에게 위임합니다.
4. 발견 사항을 먼저 보고합니다.
5. `docs/plan/<topic>.md`에 리뷰 증거를 기록합니다.
