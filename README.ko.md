# Cairn

Cairn은 Codex, Claude Code, Antigravity를 위한 토큰 효율적인 멀티에이전트 하네스 플러그인입니다.

[English](README.md)

핵심 아이디어는 hooks, 지속 상태, 명시적 계획, 집중 위임, 종료 시점 가드 같은 유용한 에이전트 하네스 동작을 유지하는 것입니다. Cairn은 반복적인 TDD 검증 루프를 기본값으로 삼지 않습니다. 대신 작업을 작은 모듈 조각으로 나누고 두 가지 검증 게이트로 증명합니다.

1. 모듈 수용 검증: 변경된 모듈 계약을 증명합니다.
2. 표면 통합 검증: CLI, HTTP, 브라우저, 파일 산출물 같은 실제 표면을 통해 동작을 증명합니다.

외부 상태를 변경할 수 있는 조각은 실행 전에 가장 가까운 dry-run 또는 check 모드를 기록하고 실행합니다. 검증은 제한됩니다. 기본적으로 각 조각은 두 번의 검증 패스를 가지며, 이후에는 반복 루프를 계속하지 않고 blocker를 기록하거나 조각을 더 작게 나눕니다.

Cairn은 도구 준비 상태도 작업의 일부로 다룹니다. LSP, typecheck, lint, dry-run, 검증 도구를 저장소 스택 기준으로 확인하고, 필수 도구가 없으면 fallback을 받아들이기 전에 프로젝트 로컬 또는 저장소 네이티브 설치를 시도합니다.

## LazyCodex Attribution

Cairn은 LazyCodex(`https://github.com/code-yeongyu/lazycodex`)의 영향을 받았습니다. 영향을 받은 부분은 설치 가능한 에이전트 하네스 구조, Codex hook trust/setup 처리, project memory, planning skills, 실행 가능한 workflow commands, diagnostics, 그리고 local agent surfaces 전반의 skill/agent packaging입니다.

Cairn은 실행 정책에서는 LazyCodex와 다릅니다. LazyCodex의 role-chain execution model이나 open-ended completion loop는 채택하지 않습니다. 대신 Light/Heavy Path triage, 제한된 `explorer`/`worker` 위임, 두 검증 게이트, 명시적 stop condition을 사용합니다.

## Complexity Triage

모든 구현 작업은 agent, plugin, delegated workflow 지침을 적용하기 전에 먼저 complexity triage를 거칩니다. triage는 사용자에게 묻지 않고 저장소 탐색, 예상 변경 범위, 위험 신호를 기준으로 결정합니다.

- Light Path: 기존 아키텍처 레이어 안의 좁은 변경입니다. 기본값이며, 직접 구현하거나 하나의 제한된 `worker`를 사용한 뒤 검증 게이트를 유지합니다.
- Heavy Path: 새 디렉터리/모듈/레이어, 새 도메인 모델/서비스/추상화, 보안/세션/인증, 외부 API/message queue/payment, DB schema/migration, concurrency/transaction/cache 변경, 여러 도메인 리팩터링, 또는 사용자의 extra-care 요청입니다.

선택된 path와 근거는 계획 산출물이 있을 때 `docs/plan/<topic>.md`에 기록합니다. Light Path에서도 두 검증 게이트는 유지됩니다.

## Tool Readiness

`cairn toolcheck`는 현재 저장소에서 JavaScript, TypeScript, Python, PHP, Java, Kotlin, Swift, Go, Rust 스택을 감지하고, 해당 LSP와 검증 도구를 확인합니다.

```sh
cairn toolcheck
cairn toolcheck --install
```

- `toolcheck`는 감지된 스택과 누락 도구를 보고합니다.
- `toolcheck --install`은 package manager dev dependency, Composer dev dependency, `uv`, Java LSP bootstrap, `go install`, `rustup component add` 같은 가장 가까운 프로젝트 로컬 또는 저장소 네이티브 설치 경로를 시도합니다.
- Cairn 계획은 감지된 스택, 필요한 도구, 설치 명령, blocker를 기록합니다.
- LSP server가 없다는 사실만으로 정밀한 코드베이스 탐색을 건너뛸 수 없습니다. 설치 또는 동등한 symbol-aware fallback을 먼저 시도해야 합니다.

## Dry-Run And Loop Policy

- 마이그레이션과 데이터베이스 변경은 write/apply 명령 전에 `--pretend`, dry-run, schema diff, rollback 가능성 검사, 또는 가장 가까운 저장소 네이티브 방식을 사용합니다.
- 패키지, 릴리스, 인프라, 배포, 코드 생성, 포매팅 작업은 가능한 경우 상태 변경 전에 check, plan, diff, validate, dry-run 모드를 사용합니다.
- dry-run이 없으면 계획에 그 사실을 기록하고 가장 작고 되돌릴 수 있는 명령 또는 테스트 산출물을 선택합니다.
- 검증 게이트가 실패하면 Cairn은 한 번 진단하고 조각을 줄이거나 나눈 뒤 두 게이트를 다시 실행합니다.
- 같은 조각에서 두 번의 검증 패스가 실패하면 반복 루프를 계속하지 않고 `docs/plan/<topic>.md`에 blocker를 기록합니다.

## Model Guidance

Cairn은 Claude-family와 Codex-family 모델에만 모델별 조정을 적용합니다.

- Claude-family: 긴 컨텍스트, 정책 해석, 계획/증거 검토에 유용합니다.
- Codex-family: 작은 구현 조각, 명시적 파일 편집, command 기반 검증, 제한된 `worker` 작업에 유용합니다.

자세한 가이드는 `docs/model-guidance/README.md`, `docs/model-guidance/claude.md`, `docs/model-guidance/codex.md`에 있습니다.

## Repository Artifacts

하네스는 대상 저장소 루트에 다음 파일을 생성하고 유지합니다.

- `MEMORY.md`: 지속 도메인 지식의 짧은 색인.
- `docs/memory/*.md`: 도메인별 상세 지식.
- `docs/model-guidance/*.md`: Claude와 Codex 모델 조정 가이드.
- `PLAN.md`: 활성/완료 작업 주제의 짧은 색인.
- `docs/plan/*.md`: 상세 실행 계획.

루트 파일은 짧게 유지하고 상세 내용은 `docs/` 아래로 이동해, 에이전트가 필요한 컨텍스트만 읽도록 합니다.

## Commands

게시된 패키지는 `bunx` 또는 전역 설치된 `cairn` 명령으로 실행할 수 있습니다.

```sh
bunx cairn-ai@latest install
bunx cairn-ai@latest upgrade
bunx cairn-ai@latest doctor
bunx cairn-ai@latest uninstall
bunx cairn-ai@latest toolcheck
```

전역 설치 후에는 짧은 명령도 사용할 수 있습니다.

```sh
bun add -g cairn-ai
cairn install
cairn upgrade
cairn doctor
cairn uninstall
cairn toolcheck
```

- `cairn install`: Codex marketplace cache에 플러그인을 설치하고 hook trust state, Claude Code mirror 파일, Antigravity skills/workflows를 설정합니다.
- `cairn upgrade`: 현재 소스에서 설치, hook trust state, Claude Code mirror 파일, Antigravity skills/workflows를 갱신합니다.
- `cairn doctor`: Codex 설정, 설치, hook trust state, Claude Code mirror 파일, Antigravity mirror 파일을 진단합니다.
- `cairn uninstall`: Cairn이 추가한 Codex 설정, cache, Claude Code mirror 파일, Antigravity mirror 파일을 제거합니다.
- `cairn toolcheck`: 저장소 스택을 감지하고 필요한 LSP와 검증 도구를 확인하거나 설치합니다.
- `cairn-memory`: 도메인 지식을 탐색하고 `MEMORY.md`를 갱신합니다.
- `cairn-plan`: `docs/plan/` 아래에 decision-complete plan을 만듭니다.
- `cairn-work`: 현재 `PLAN.md`의 다음 모듈 조각을 실행하고 두 검증 게이트를 확보합니다.
- `cairn-review`: 계획, memory, 증거를 기준으로 완료된 조각을 검토합니다.

`install`과 `upgrade`는 `~/.codex/config.toml`을 수정하기 전에 `*.cairn-backup-*` 백업을 만듭니다. 소스 플러그인 manifest는 validator-friendly 상태를 유지하고, 설치된 cache copy에만 Codex hook 활성화를 위한 `hooks` field가 추가됩니다.

Codex는 `skills/`와 `commands/`를 사용합니다. Claude Code는 `.claude/` 아래의 mirror command와 agent definition을 사용합니다. Antigravity는 `.agents/workflows`와 global skills mirror를 사용합니다.

## Antigravity Compatibility

Antigravity는 `/workflow-name`으로 호출되는 `SKILL.md` 기반 Agent Skills와 Workflows를 지원합니다. Cairn은 해당 표면에 다음 경로를 설치합니다.

- Antigravity IDE: `~/.agents/skills/cairn-*`, `~/.agents/workflows/cairn-*.md`.
- Antigravity CLI: `~/.gemini/antigravity-cli/skills/cairn-*`, `~/.gemini/antigravity-cli/workflows/cairn-*.md`.

Codex 전용 hooks는 Antigravity로 포팅하지 않습니다. 대신 같은 planning, memory, complexity triage, two-gate verification 절차가 Skills와 Workflows를 통해 실행됩니다. 경로를 바꾸려면 `ANTIGRAVITY_HOME` 또는 `ANTIGRAVITY_CLI_HOME`을 설정하세요.

## Locale Policy

Cairn의 재사용 지침은 전역 사용을 위해 영어로 작성됩니다. 사용자에게 보이는 출력은 사용자가 다른 언어를 명시하지 않는 한 설정된 OS locale을 따릅니다. CLI는 `en`, `ko`, `ja`, `zh`, `es`, `fr`, `de`, `pt`의 일반 메시지를 현지화하고, 지원하지 않는 locale은 영어로 fallback합니다. Codex hook `statusMessage` 텍스트는 정적 영어로 유지하고, hook command output은 영어 또는 한국어입니다.

## Delegation

- `explorer`: 가능한 경우 read-only codebase discovery, impact analysis, pattern search, read-only verification을 처리합니다.
- `worker`: 명확한 file ownership이 있는 제한된 implementation 또는 verification task를 처리합니다.
- Main session: 다음 단계가 즉시 결과에 의존하는 urgent blocking work를 로컬에서 처리합니다.

모든 delegation prompt는 TASK, EXPECTED OUTCOME, REQUIRED TOOLS, MUST DO, MUST NOT DO, CONTEXT 여섯 섹션을 사용합니다.
