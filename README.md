# Cairn

Cairn은 Codex와 Claude Code에서 함께 쓰는 토큰 절약형 멀티에이전트 하네스 플러그인입니다.

핵심 아이디어는 LazyCodex의 장점인 훅, 지속 상태, 명시적 계획, 에이전트 역할, 중단 시점 가드를 유지하되, 반복적인 TDD 검증 루프를 기본값으로 두지 않는 것입니다. 대신 작업을 작은 모듈 단위로 나누고 두 번의 검증으로 통과시키는 흐름을 사용합니다.

1. 모듈 수용 검증: 변경된 모듈의 계약을 증명합니다.
2. 표면 통합 검증: 실제 CLI, HTTP, 브라우저, 파일 산출물 같은 사용 표면에서 동작을 증명합니다.

## 복잡도 트리아지

모든 사용자 작업은 먼저 복잡도 트리아지를 통과합니다. 트리아지는 사용자에게 묻지 않고 저장소 탐색, 변경 예상 범위, 위험 신호로 결정합니다.

- 빠른 경로: 단일 모듈, 낮은 위험, 명확한 파일 범위, 기존 패턴이 분명한 작업은 `planner → builder` 순서로 처리합니다.
- 전체 경로: 여러 모듈, 데이터/권한/마이그레이션/외부 연동/아키텍처 영향/불명확한 도메인 정책이 있는 작업은 `architect → planner → reviewer → builder → reviewer` 순서로 처리합니다.

선택한 경로와 이유는 `docs/plan/<topic>.md`에 남깁니다. 빠른 경로라도 `builder` 완료 후 두 단계 검증은 유지합니다.

## 모델 지침

Cairn은 Claude 계열과 Codex 계열만 모델별 보정 대상으로 둡니다.

- Claude 계열: `architect`, `planner`, `reviewer` 역할에 우선 적용합니다. 긴 컨텍스트, 정책 해석, 계획/증거 검토에 사용합니다.
- Codex 계열: `builder`, `worker`, 구조가 명확한 `planner` 역할에 우선 적용합니다. 작은 구현 조각, 명확한 파일 편집, 명령 기반 검증에 사용합니다.

자세한 지침은 `docs/model-guidance/README.md`, `docs/model-guidance/claude.md`, `docs/model-guidance/codex.md`에 있습니다.

## 저장소 산출물

하네스는 대상 저장소 루트에 다음 파일을 만들고 유지합니다.

- `MEMORY.md`: 지속 도메인 지식의 짧은 색인.
- `docs/memory/*.md`: 도메인별 상세 지식.
- `docs/model-guidance/*.md`: Claude와 Codex 모델별 보정 지침.
- `PLAN.md`: 활성/완료 작업 주제의 짧은 색인.
- `docs/plan/*.md`: 상세 실행 계획.

루트 파일은 짧게 유지하고 상세 내용은 `docs/` 아래로 분리해, 에이전트가 필요한 컨텍스트만 읽도록 합니다.

## 명령

패키지로 배포된 Cairn은 LazyCodex와 같은 형태로 실행할 수 있습니다.

```sh
bunx cairn-ai@latest install
bunx cairn-ai@latest upgrade
bunx cairn-ai@latest doctor
bunx cairn-ai@latest uninstall
```

전역 설치 후에는 짧은 명령도 사용할 수 있습니다.

```sh
bun add -g cairn-ai
cairn install
cairn upgrade
cairn doctor
cairn uninstall
```

- `cairn install`: Codex marketplace 캐시에 플러그인을 설치하고 훅 신뢰 상태와 Claude Code 미러 파일을 구성합니다.
- `cairn upgrade`: 현재 소스 기준으로 설치본, 훅 신뢰 상태, Claude Code 미러 파일을 갱신합니다.
- `cairn doctor`: Codex 설정, 설치본, 훅 신뢰 상태, Claude Code 미러 파일을 진단합니다.
- `cairn uninstall`: Cairn이 추가한 Codex 설정, 캐시, Claude Code 미러 파일을 제거합니다.
- `cairn-memory`: 도메인 지식을 탐색하고 `MEMORY.md`를 갱신합니다.
- `cairn-plan`: `docs/plan/` 아래에 결정 완료 상태의 계획을 만듭니다.
- `cairn-work`: 현재 `PLAN.md`의 다음 모듈 조각을 두 번의 검증으로 실행합니다.
- `cairn-review`: 계획, 메모리, 증거를 기준으로 완료 조각을 검토합니다.

설치/업그레이드는 `~/.codex/config.toml`을 수정하기 전에 `*.cairn-backup-*` 백업을 만듭니다. 원본 플러그인 manifest는 검증 가능한 상태로 유지하고, 설치된 캐시 복사본에만 `hooks` 필드를 추가해 Codex hook을 활성화합니다.

Codex는 `skills/`와 `commands/`를 사용합니다. Claude Code는 `.claude/` 아래의 미러링된 명령과 에이전트 정의를 사용할 수 있습니다.

## 에이전트 역할

- `architect`: 시스템 경계, 위험, 도메인 정책을 정리합니다.
- `planner`: 탐색된 사실을 결정 완료 상태의 계획으로 변환합니다.
- `builder`: 하나의 작은 모듈 조각을 구현합니다.
- `reviewer`: 동작, 정책, 증거를 검증합니다.
- `worker`: 검색, 작은 편집, QA 같은 집중 작업을 수행합니다.

모든 위임 프롬프트는 TASK, EXPECTED OUTCOME, REQUIRED TOOLS, MUST DO, MUST NOT DO, CONTEXT 여섯 섹션을 사용합니다.

## LazyCodex 분석

요약은 `docs/lazycodex-analysis/summary.md`에 있습니다.
