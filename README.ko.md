# Cairn

Cairn은 Codex, Claude Code, Antigravity를 위한 토큰 효율적인 멀티에이전트 하네스 플러그인입니다.

[English](README.md)

핵심 아이디어는 hooks, 지속 상태, 명시적 계획, 집중 위임, 종료 시점 가드 같은 유용한 에이전트 하네스 동작을 유지하는 것입니다. Cairn은 반복적인 TDD 검증 루프를 기본값으로 삼지 않습니다. 대신 작업을 작은 모듈 작업으로 나누고 두 가지 검증 게이트로 증명합니다.

1. 모듈 수용 검증: 변경된 모듈 계약을 증명합니다.
2. 표면 통합 검증: CLI, HTTP, 브라우저, 파일 산출물 같은 실제 표면을 통해 동작을 증명합니다.

외부 상태를 변경할 수 있는 작업은 실행 전에 가장 가까운 dry-run 또는 check 모드를 기록하고 실행합니다. 검증은 제한됩니다. 기본적으로 각 작업은 두 번의 검증 패스를 가지며, 이후에는 반복 루프를 계속하지 않고 blocker를 기록하거나 작업을 sub-task로 나눕니다.

Cairn은 도구 준비 상태도 작업의 일부로 다룹니다. LSP, typecheck, lint, dry-run, 검증 도구를 저장소 스택 기준으로 확인합니다. 누락 도구는 명시적 승인과 고정된 지원 installer가 모두 있을 때만 설치하고, 그렇지 않으면 blocker로 보고합니다.

## LazyCodex Attribution

Cairn은 LazyCodex(`https://github.com/code-yeongyu/lazycodex`)의 영향을 받았습니다. 영향을 받은 부분은 설치 가능한 에이전트 하네스 구조, Codex hook trust/setup 처리, project memory, planning skills, 실행 가능한 workflow commands, diagnostics, 그리고 local agent surfaces 전반의 skill/agent packaging입니다.

Cairn은 실행 정책에서는 LazyCodex와 다릅니다. LazyCodex의 role-chain execution model이나 open-ended completion loop는 채택하지 않습니다. 대신 Light/Heavy Path triage, main-agent orchestration, 제한된 `explorer`/`worker` 위임, 두 검증 게이트, 명시적 stop condition을 사용합니다.

## Complexity Triage

모든 구현 작업은 agent, plugin, delegated workflow 지침을 적용하기 전에 먼저 complexity triage를 거칩니다. triage는 사용자에게 묻지 않고 저장소 탐색, 예상 변경 범위, 위험 신호를 기준으로 결정합니다.

- Light Path: 기존 아키텍처 레이어 안의 좁은 변경입니다. 기본값이지만, 사용자가 호출한 main agent는 여전히 orchestration을 맡고 subagent 도구가 있으면 구현 편집을 하나의 제한된 `worker`에 위임한 뒤 검증 게이트를 유지합니다.
- Heavy Path: 새 디렉터리/모듈/레이어, 새 도메인 모델/서비스/추상화, 보안/세션/인증, 외부 API/message queue/payment, DB schema/migration, concurrency/transaction/cache 변경, 여러 도메인 리팩터링, 또는 사용자의 extra-care 요청입니다.

선택된 path와 근거는 계획 산출물이 있을 때 `docs/plan/<topic>.md`에 기록합니다. Light Path에서도 두 검증 게이트는 유지됩니다. subagent 도구가 없으면 main agent가 implementation을 직접 인계하고, 그 takeover를 evidence에 기록합니다.

Cairn은 host/user model을 상속하고 reasoning effort만 라우팅합니다. Light 계획·구현·검증은 `medium`, Heavy 계획·검토·구현은 `high`, 최종 검증·검토는 `xhigh`를 요청합니다. 각 task는 requested/effective effort를 기록하며, 새로 dispatch하는 task/worker에만 host가 지원하는 effort option을 전달합니다. 미지원 host/value는 model/global config를 바꾸지 않고 `effective: inherited`로 남깁니다. path가 바뀌면 plan artifact, 저장소 goal task roadmap, native UI plan, effort profile을 함께 동기화하고 완료 profile은 보존하며 미완료 profile은 재계산합니다.

subagent 도구가 progress-reporting channel을 제공하면 subagent는 작업 시작, 방향 결정/확인, 주기적 진행, 완료 시점에 orchestrator에게 상태를 보고합니다. orchestrator는 받은 status event를 즉시 사용자에게 전달합니다. mid-run reporting channel이 없으면 orchestrator는 할당, 대기, 최종 완료처럼 관측 가능한 event를 사용자에게 전달합니다.

위임받은 subagent는 작업을 마치면 퇴근 전에 final report를 남깁니다. orchestrator가 final report와 evidence를 회수한 뒤 완료된 subagent를 close/release합니다. 그 다음 orchestrator가 final report와 evidence를 검토한 뒤 작업 완료 여부를 판단합니다.

## Tool Readiness

`cairn toolcheck`는 현재 저장소에서 JavaScript, TypeScript, Python, PHP, Java, Kotlin, Swift, Go, Rust 스택을 감지하고, 해당 LSP와 검증 도구를 확인합니다.

```sh
cairn toolcheck --root .
# 명시적 승인을 받은 경우에만:
cairn toolcheck --install --yes --root .
```

- `toolcheck`는 감지된 스택과 누락 도구를 보고합니다.
- 기본 검사는 읽기 전용이고 timeout으로 제한되며, 저장소 로컬 wrapper를 단순 탐지를 위해 실행하지 않습니다.
- `toolcheck --install`은 사용자의 명시적 승인과 `--yes`를 모두 요구합니다. 버전이 고정되지 않았거나 checksum이 없는 installer는 `latest`를 내려받는 대신 canonical `installer-unavailable` 거부 결과로 보고합니다.
- Cairn 계획은 감지된 스택, 필요한 도구, 설치 명령, blocker를 기록합니다.
- LSP server가 없다는 사실만으로 정밀한 코드베이스 탐색을 건너뛸 수 없습니다. 설치 또는 동등한 symbol-aware fallback을 먼저 시도해야 합니다.

## Dry-Run And Loop Policy

- 마이그레이션과 데이터베이스 변경은 write/apply 명령 전에 `--pretend`, dry-run, schema diff, rollback 가능성 검사, 또는 가장 가까운 저장소 네이티브 방식을 사용합니다.
- 패키지, 릴리스, 인프라, 배포, 코드 생성, 포매팅 작업은 가능한 경우 상태 변경 전에 check, plan, diff, validate, dry-run 모드를 사용합니다.
- dry-run이 없으면 계획에 그 사실을 기록하고 가장 작고 되돌릴 수 있는 명령 또는 테스트 산출물을 선택합니다.
- 검증 게이트가 실패하면 Cairn은 한 번 진단하고 작업을 줄이거나 sub-task로 나눈 뒤 두 게이트를 다시 실행합니다.
- 같은 작업에서 두 번의 검증 패스가 실패하면 반복 루프를 계속하지 않고 `docs/plan/<topic>.md`에 blocker를 기록합니다.

## Model Guidance

Cairn은 Claude-family와 Codex-family 모델에만 모델별 조정을 적용합니다.

- Claude-family: 긴 컨텍스트, 정책 해석, 계획/증거 검토에 유용합니다.
- Codex-family: 작은 구현 작업, 명시적 파일 편집, command 기반 검증, 제한된 `worker` 작업에 유용합니다.

자세한 가이드는 설치된 플러그인에 있으며 `cairn://docs/model-guidance/README.md`, `cairn://docs/model-guidance/claude.md`, `cairn://docs/model-guidance/codex.md`로 참조합니다.

## Repository Artifacts

하네스는 대상 저장소 루트에 다음 파일을 생성하고 유지합니다.

- `MEMORY.md`: 지속 도메인 지식의 짧은 색인.
- `docs/memory/*.md`: 도메인별 상세 지식.
- `PLAN.md`: 활성/완료 작업 주제의 짧은 색인.
- `docs/plan/*.md`: 상세 실행 계획.
- `.cairn/state.json`: 중단 재개와 범위가 제한된 종료 게이트에 쓰는 git-ignored 버전드 goal/task/증거 기록 상태.

런타임 script, template, command, agent, model guidance는 설치된 플러그인 루트에 유지합니다. 각 표면의 locator가 같은 설치본을 가리키므로 대상 저장소에 Cairn 내부 파일을 복사하지 않습니다.

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

- `cairn install`: custom marketplace source, versioned Codex runtime cache, Cairn-owned config section, Claude Code mirror, 현재 Antigravity IDE/CLI skill 표면을 transaction으로 설치합니다.
- `cairn upgrade`: ownership manifest의 installed digest와 현재 값이 같은 항목만 교체하며, staged validation과 역순 rollback을 적용합니다.
- `cairn doctor`: ownership manifest, managed digest, 유효 Codex feature, 실제 plugin installed/enabled/version, mirror/runtime locator를 수정 없이 진단합니다.
- `cairn uninstall`: 수정되지 않은 ownership manifest 항목만 제거·복원한 뒤 빈 managed cache scaffold를 정리합니다. modified/unmanaged target과 그 상위 디렉터리는 보존하고 commit 전 실패는 rollback합니다.
- `cairn toolcheck`: 저장소 스택과 필요한 LSP·검증 도구를 확인하며, 승인된 지원 installer만 실행합니다.
- `cairn goal ...`: 저장소의 영속 goal을 시작·조회·일시정지·재개·차단·취소·완료합니다. 기본 tool-bound 정책은 `goal verify -- <argv>`가 명령을 직접 실행해 성공 증거를 기록합니다. `goal receipt`는 기존 선언 증거를 가져오는 호환 명령입니다.
- `cairn-memory`: 도메인 지식을 탐색하고 `MEMORY.md`를 갱신합니다.
- `cairn-plan`: `docs/plan/` 아래에 decision-complete plan을 만듭니다.
- `cairn-work`: 현재 `PLAN.md`의 다음 모듈 작업을 실행하고 두 검증 게이트를 확보합니다.
- `cairn-review`: 계획, memory, 증거를 기준으로 완료된 작업을 검토합니다.

모든 `UserPromptSubmit`에서 Cairn은 구현 또는 계속 실행 요청 자체가 goal 생성 권한이며 사용자가 “goal”을 직접 말할 필요가 없다는 모델 가시 지침을 주입합니다. 에이전트는 먼저 트리아지를 active task로 둔 초기 저장소 계획을 작성하고, 탐색·트리아지 전에 가능한 경우 Codex `update_plan`과 `create_goal`로 같은 roadmap을 UI에 표시한 뒤 저장소 Cairn goal을 시작합니다. 트리아지 결과로 두 계획을 decision-complete 구현 계획으로 갱신한 뒤에만 구현합니다. 활성 goal은 전체 순서형 roadmap, 각 상태, 현재 task를 hook 컨텍스트에 유지하므로 곁가지 질문 뒤 원래 작업으로 돌아갈 수 있습니다. 상담·설명·계획 전용 요청은 goal 없이 처리합니다.

토큰 효율 실행에서는 구현보다 먼저 요구사항·불변식·경계·실패 모드로 집중 실행 test contract를 설계하는 데 추론을 배분합니다. 구현에는 실패 계약과 제한된 파일 범위만 전달하고 통과에 필요한 최소 변경을 요구합니다. 성공 여부는 도구 exit code와 기계적 요약으로 판정하며 성공 출력은 축약하고 실패할 때만 컨텍스트를 확장합니다. package 검증 전 lifecycle script를 검사하고 기본적으로 정상 `npm pack --dry-run`을 실행합니다. content-producing 또는 미분류 script에는 `--ignore-scripts`를 사용하면 안 되며, script가 없거나 content-neutral임을 입증했고 전체 검사 증거가 여전히 유효할 때만 사용할 수 있습니다. 성공한 상태 변경은 `--quiet`를 지원하므로 커지는 goal JSON이 대화 토큰을 소모하지 않습니다.

`install`과 `upgrade`는 custom marketplace lifecycle을 유지하며 `codex plugin add`를 호출하지 않습니다. candidate를 staging에서 검증한 뒤 commit하고, 모든 managed destination과 digest를 ownership manifest에 기록하며 실패 시 완료된 phase를 역순 rollback합니다. 수정되지 않은 지원 legacy 설치만 release-integrity 검증 뒤 인수하고, 수정되거나 알 수 없는 artifact는 보존한 채 거부합니다. Cairn-owned TOML section만 편집하고 public feature/agent 설정은 강제하지 않습니다. lifecycle command는 교체 대상 cache copy가 아니라 게시/전역 package에서 실행해야 합니다.

Clean uninstall은 모든 managed scaffold가 비었을 때만 recursive 삭제 없이 빈 디렉터리 제거로 Cairn marketplace cache root를 정리합니다. 소스 저장소와 저장소의 `MEMORY.md`/`PLAN.md`/`.cairn` 상태, 전역 `cairn-ai` package, package-manager download cache, legacy backup, 현재 ownership manifest 밖의 legacy shared setting은 지우지 않으며 별도의 명시적 정리 판단이 필요합니다.

Codex는 `skills/`와 `commands/`를 사용합니다. Claude Code는 `.claude/` 아래의 mirror command와 agent definition을 사용합니다. Antigravity는 `.agents/workflows`와 global skills mirror를 사용합니다.

## Antigravity Compatibility

Antigravity는 `/workflow-name`으로 호출되는 `SKILL.md` 기반 Agent Skills와 Workflows를 지원합니다. Cairn은 해당 표면에 다음 경로를 설치합니다.

- Antigravity IDE: `~/.gemini/config/skills/cairn-*/SKILL.md`.
- Antigravity CLI: flat `~/.gemini/antigravity-cli/skills/cairn-*.md` skill 파일.

Codex 전용 hooks는 Antigravity로 포팅하지 않습니다. 대신 같은 planning, memory, complexity triage, two-gate verification 절차가 Skills와 Workflows를 통해 실행됩니다. 경로를 바꾸려면 `ANTIGRAVITY_HOME` 또는 `ANTIGRAVITY_CLI_HOME`을 설정하세요.

## Locale Policy

Cairn의 재사용 지침은 전역 사용을 위해 영어로 작성됩니다. 사용자에게 보이는 출력과 생성 또는 갱신되는 문서, 계획, 메모리 산출물은 사용자가 다른 언어를 명시하지 않는 한 설정된 OS locale을 따릅니다. 여기에는 `MEMORY.md`, `PLAN.md`, `docs/memory`, `docs/plan` 내용이 포함됩니다. CLI는 `en`, `ko`, `ja`, `zh`, `es`, `fr`, `de`, `pt`의 일반 메시지를 현지화하고, 지원하지 않는 locale은 영어로 fallback합니다. Codex hook `statusMessage` 텍스트는 정적 영어로 유지하고, hook command output은 영어 또는 한국어입니다.

## Delegation

- `explorer`: 가능한 경우 read-only codebase discovery, impact analysis, pattern search, read-only verification을 처리합니다.
- `worker`: 명확한 file ownership이 있는 실제 implementation edit 또는 verification task를 처리합니다.
- Main session: orchestrate, verify, evidence 기록을 맡으며, 다음 단계가 즉시 결과에 의존하는 urgent non-implementation blocking work만 로컬에서 처리합니다. 다만 subagent 도구가 없으면 main agent가 implementation을 직접 인계합니다.

모든 delegation prompt는 TASK, EXPECTED OUTCOME, REQUIRED TOOLS, MUST DO, MUST NOT DO, CONTEXT 여섯 섹션을 사용합니다.
