# LazyCodex 분석

## 참고 입력

- 사용자 제공 이미지: `LazyCodex / OmO - "끝까지 묻는" 에이전트 하네스의 원리`.
- 로컬 소스 참고: `/Users/wknam/workspace/oh-my-openagent/packages/omo-codex/plugin`.

## 관찰한 LazyCodex 구조

LazyCodex는 oh-my-openagent의 개념을 Codex 플러그인 표면으로 옮긴 계층입니다. 로컬 OMO 플러그인은 다음 구성을 노출합니다.

- `UserPromptSubmit` 훅: 프로젝트 규칙과 ultrawork 트리거 주입.
- `PostToolUse` 훅: comment checker, LSP diagnostics, 프로젝트 규칙 매칭.
- `PostCompact` 훅: 컨텍스트 압축 후 규칙 캐시 재구성.
- `Stop`, `SubagentStop` 훅: 성급한 종료 차단과 작업 지속.
- `ulw-plan`, `start-work`, `ulw-loop`, `review-work`, `debugging`, `programming` 같은 스킬.

사용자 이미지도 같은 루프를 설명합니다. 프롬프트 트리거, 컨텍스트 주입, 에이전트 작업, 종료 시점 체크리스트, 증거 확보 후 완료 선언 순서입니다.

## 유지할 강점

- 모델 컨텍스트 밖의 지속 상태.
- 압축 이후에도 규칙과 상태를 다시 주입하는 훅.
- 명확한 에이전트 역할.
- 부분 완료를 막는 종료 시점 가드.
- 낙관적 보고가 아니라 증거 기반 완료.

## 토큰 소모 원인

높은 토큰 비용은 red-green TDD, 광범위 QA, 반복적인 stop continuation을 모든 작업에 강제하는 데서 발생합니다. 고위험 변경에는 유용하지만 모든 모듈 조각에 적용하면 과합니다.

## Cairn 적용 방향

Cairn은 지속 상태와 가드는 유지하되 실행 방식을 바꿉니다.

- 첫 번째 단계: 정밀한 코드베이스 탐색으로 압축된 도메인 메모리를 작성합니다.
- 두 번째 단계: 계획이 작업을 작은 모듈 조각과 명명된 계약으로 분리합니다.
- 각 조각은 기본적으로 두 검증만 통과합니다.
  - 모듈 수용 검증.
  - 표면 통합 검증.
- 반복 루프는 기본값이 아니라 실패 시에만 수행합니다.

결과적으로 같은 조각을 반복 검증하는 대신, 탐색 품질, 도메인 정책, 계획 명확성에 토큰을 사용합니다.
