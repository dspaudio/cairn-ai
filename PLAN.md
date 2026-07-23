# PLAN

This file is a short index of active and completed work plans.

## Active Plans

- [Cairn 0.2.5 hotfix 릴리스](docs/plan/release-0.2.5.md): 검증된 shared config hotfix를 dev/main에 exact-head 승격하고 동일 main 산출물을 npm 0.2.5로 게시합니다.

## Superseded Plans

- [Cairn 0.2.0 설치본 런타임 릴리스](docs/plan/release-0.2.0-installed-runtime.md): 후속 0.2.1·0.2.2 릴리스로 대체된 미완료 릴리스 계획입니다. 활성 작업으로 취급하지 않습니다.

## Completed Plans

- Move completed topics here with evidence links.
- [Cairn 0.2.5 공용 설정 upgrade hotfix](docs/plan/upgrade-shared-config-ownership.md): 공유 `config.toml`을 mutable merge surface로 전환하고 boundary trivia, concurrent edit, capture crash recovery, actual 0.2.4→0.2.5 upgrade를 128개 전체 검사와 독립 리뷰로 검증했습니다.
- [Cairn 0.2.4 릴리스](docs/plan/release-0.2.4.md): PR #47과 #48을 exact head의 CI 6/6 성공 후 dev/main에 병합하고, exact main tarball을 npm `latest` 0.2.4로 게시해 registry digest와 격리 설치/CLI를 검증했습니다.
- [clean uninstall과 프롬프트 캐시 복원력](docs/plan/clean-uninstall-prompt-cache-resilience.md): 빈 managed cache root 정리와 unmanaged 보존, completed-task evidence 갱신, 7문장 recovery kernel과 exact bounded reference 복원을 구현하고 118개 전체 테스트, package dry-run, 독립 리뷰로 검증했습니다.
- [Cairn 0.2.3 릴리스](docs/plan/release-0.2.3.md): dev/main PR 승격, npm 배포, npm 설치본 재설치와 실제 upgrade smoke 증거를 갱신하고 goal을 명시적으로 완료했습니다.
- [Cairn 하네스 신뢰성 개선](docs/plan/harness-reliability-remediation.md): 상태 lock·검증 결속, custom lifecycle transaction과 교차 버전 rollback, 호스트 호환성, toolcheck·문서 계약을 보강하고 104개 전체 테스트와 64-file package dry-run으로 검증했습니다. 공식 plugin 설치 경로 전환은 제외했습니다.
- [Cairn 0.2.2 릴리스](docs/plan/release-0.2.2.md): PR #39를 `dev`, PR #40을 `main`에 CI 통과 후 병합하고 `cairn-ai@0.2.2`를 npm `latest`로 게시했습니다.
- [토큰 효율 방법론 검토 findings 전체 수정](docs/plan/fix-token-methodology-review-findings.md): inline 값 보존, 직접 실행된 tool-bound evidence와 stale fingerprint, lifecycle 분류 기반 package 검증, 700자 bounded roadmap, 8개 locale·증거 용어·상태 일관성을 실패 테스트부터 수정하고 전체 검사와 package dry-run으로 검증했습니다.
- [토큰 효율과 신뢰성을 함께 보장하는 Cairn 방법론](docs/plan/token-efficient-reliable-harness.md): 테스트 계약 우선·최소 구현·도구 결과 권위·실패 시에만 컨텍스트 확장·신선한 증거 재사용을 하네스에 반영했고, default prompt 2,549자, idle hook 277자, 3-task active hook 434자와 전체 39/39 테스트, 62-file package content 검증으로 확인했습니다.
- [계획 중단에도 goal/task를 보존하는 2단계 계획](docs/plan/goal-before-planning-interruption.md): 초기 계획과 Codex UI plan/goal을 트리아지 전에 생성하고, 증거 기반 저장소 task 전환 뒤에만 UI 단계를 동기화하도록 정책을 정렬했으며 전체 35개 테스트와 package dry-run으로 검증했습니다.
- [Cairn 0.2.1 goal 작업 컨텍스트 릴리스](docs/plan/release-0.2.1-goal-task-context.md): PR #35를 `dev`, PR #36을 `main`에 CI 통과 후 병합하고 `cairn-ai@0.2.1`을 npm `latest`로 게시했습니다.
- [goal 작업 단계와 복귀 컨텍스트](docs/plan/goal-task-roadmap-context.md): 활성 goal의 전체 순서형 task roadmap, 각 상태, 현재 task와 곁가지 질문 뒤 복귀 지침을 영문·한국어 및 실제 tarball 설치 경로에서 검증했습니다.
- [구현 요청의 자동 goal 설정 지침](docs/plan/automatic-goal-on-implementation-request.md): goal 미언급 구현/계속 실행 요청도 `UserPromptSubmit`의 모델 가시 지침으로 goal 생성 권한이 되며, 영문·한국어 hook과 실제 tarball 설치를 포함한 전체 34개 테스트 및 package dry-run으로 검증했습니다.
- [설치본 경로 독립성과 목표 완주 런타임](docs/plan/installed-runtime-goal-completion.md): 현재 lifecycle을 유지하면서 설치본 기준 리소스 locator, 저장소별 영속 목표/task/증거 기록, 범위가 제한된 Stop 게이트, 안전한 toolcheck를 구현했으며 `npm run check`와 실제 tarball 설치 E2E, `npm pack --dry-run`으로 검증했습니다.
- [Release 0.1.11 locale artifacts](docs/plan/release-0.1.11-locale-artifacts.md): PR #29 merged to `dev`, PR #30 merged to `main`, and `cairn-ai@0.1.11` published to npm.
- [Release 0.1.10 subagent lifecycle](docs/plan/release-0.1.10-subagent-lifecycle.md): PR #25 merged to `dev`, PR #26 merged to `main`, and `cairn-ai@0.1.10` published to npm.
- [Cairn subagent close on completion](docs/plan/cairn-subagent-close-on-completion.md): required delegated subagents to provide a final report before leaving, then close/release after evidence capture, then have the orchestrator review the final report and evidence before completion; verified with `node --test test/lifecycle.test.mjs`, `npm run check`, and `npm --cache /private/tmp/cairn-npm-cache pack --dry-run`.
- [Cairn subagent unavailable main fallback](docs/plan/cairn-subagent-unavailable-main-fallback.md): corrected unavailable-subagent fallback to main-agent takeover and made subagent progress reporting conditional on tool channel support; verified with `node --test test/lifecycle.test.mjs`, `npm run check`, and `npm --cache /private/tmp/cairn-npm-cache pack --dry-run`.
- [Cairn orchestrator-worker execution policy](docs/plan/cairn-orchestrator-worker-execution-policy.md): required main-agent orchestration, worker implementation delegation, subagent status reporting, and immediate user relay; verified with `node --test test/lifecycle.test.mjs`, `npm run check`, and `npm --cache /private/tmp/cairn-npm-cache pack --dry-run`.
- [Cairn stop gate plan index recheck](docs/plan/cairn-stop-gate-plan-index-recheck.md): stop hook now rechecks active, completed, and unindexed plan files; verified with `node --test test/lifecycle.test.mjs`, `npm run check`, and `npm --cache /private/tmp/cairn-npm-cache pack --dry-run`.
- [Release 0.1.9 Codex multi-agent settings](docs/plan/release-0.1.9-codex-multi-agent-settings.md): PR #22 merged to main, `cairn-ai@0.1.9` published to npm, and local Cairn installation upgraded.
- [Release 0.1.8 Cairn policy updates](docs/plan/release-0.1.8-cairn-policy-updates.md): PR #19 merged to main, `cairn-ai@0.1.8` published to npm, and local Cairn installation upgraded.
- [Cairn recursive subagent policy](docs/plan/cairn-recursive-subagent-policy.md): allowed recursive bounded sub-task delegation in plugin, skills, commands, workflows, and agent definitions; verified with `npm test`, `npm run check`, and `npm pack --dry-run`.
- [Cairn planner decomposition policy](docs/plan/cairn-planner-decomposition-policy.md): required whole-work planning before task/sub-task classification; verified with `npm test`, `npm run check`, and `npm pack --dry-run`.
- [Cairn task terminology](docs/plan/cairn-task-terminology.md): renamed user-facing module slice terminology to task/sub-task and verified with `npm test`, `npm run check`, and `npm pack --dry-run`.
- [Cairn interruption resume policy](docs/plan/cairn-interruption-resume-policy.md): added side-question resume guidance to plugin/work surfaces and verified with `npm test`, `npm run check`, and `npm pack --dry-run`.
- [Cairn plugin model settings and Heavy Path test gate](docs/plan/cairn-plugin-model-settings-heavy-path-tests.md): removed Claude-only agent model pins, added Heavy Path test evidence stop gate, and verified with `npm test`, `npm run check`, and `npm pack --dry-run`.
- [Cairn verification infrastructure](docs/plan/cairn-verification-infrastructure.md): lifecycle/toolcheck regression tests, fixtures, CI, and packaging dry-run evidence.
- [Release 0.1.7 stop gate](docs/plan/release-0.1.7-stop-gate.md): PR #17 merged to main, `cairn-ai@0.1.7` published to npm, and local Cairn installation upgraded.

## Planning Rules

- Plans must be decision-complete before implementation.
- Split implementation into small module slices.
- Detect repository stack and required LSP/check tools before implementation.
- Install or bootstrap missing required tools before declaring them unavailable.
- Each slice normally passes exactly two gates.
  - Module acceptance verification.
  - Surface integration verification.
- Run dry-run or check mode before external-state mutation when available.
- Use at most two verification passes per slice by default.
- If a gate fails, diagnose once, shrink or split the slice, and rerun both gates.
- After two failed passes, record the blocker in `docs/plan/<topic>.md`.
