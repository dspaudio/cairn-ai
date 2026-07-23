# Plan: Cairn 0.2.5 hotfix 릴리스

## Plan Phase

- Initial: decision-complete for `triage-plan`; not implementation-ready.
- Finalized: decision-complete for release execution.

## Goal

검증 완료된 mutable shared config hotfix를 원격 branch에 push하고, exact head를 `dev`와 `main` PR로 순차 승격한 뒤 동일 main 산출물을 npm `cairn-ai@0.2.5` latest로 게시합니다.

- Plan ID: `docs/plan/release-0.2.5.md`
- Safety: 현재 사용자 Cairn 설치와 `~/.codex/config.toml`은 읽거나 변경하지 않습니다.
- Required goal evidence: `finalReview`.

## Whole Work

1. `triage-plan`: branch/commit, clean worktree, gh/npm 인증, version/registry 상태, CI 계약과 dry-run 근거를 확인해 릴리스 계획을 확정합니다.
2. `dev-pr`: hotfix branch를 push하고 exact head의 CI 성공 뒤 `dev` PR을 병합합니다.
3. `main-pr`: exact dev head를 `main` PR로 승격하고 CI 성공 뒤 병합합니다.
4. `npm-publish`: exact main tree에서 tarball을 생성·검증하고 npm 0.2.5를 게시해 registry digest와 격리 install/CLI를 확인합니다.
5. `release-complete`: 브랜치·PR·CI·npm 증거를 검토하고 계획과 goal을 완료합니다.

## Initial Investigation Scope

- 현재 branch/HEAD/worktree 및 origin/dev/main 관계.
- GitHub CLI 인증과 open PR/CI 상태.
- npm 인증, 현재 latest/version 존재 여부, lifecycle scripts와 pack/publish dry-run.
- 기존 0.2.4 릴리스 계획의 exact-head 및 동일 tarball 게시 계약.

## Triage Result

- Current branch/head: `codex/hotfix-0.2.5-shared-config-upgrade` at `feccfc07b5a660aaa9fd6f3d2211f7d65216530b`, based on `origin/dev` `8930e9539f73092c81f10ef15f09067794d6bca2`.
- Worktree: release plan/index만 uncommitted입니다. 두 파일을 별도 release-plan commit으로 포함한 새 exact head를 CI/merge 기준으로 사용합니다.
- Remote after fresh fetch: `origin/dev=8930e9539f73092c81f10ef15f09067794d6bca2`, `origin/main=89dfedf063c49e2fc644685e4aca12c975929c40`.
- GitHub: `dspaudio/cairn-ai`, default `main`, escalated network context의 `gh auth status` 성공, open PR 없음. CI는 macOS/Ubuntu/Windows × Node 18/current 6 jobs입니다.
- npm: account `wonkyoo.nam`, `latest=0.2.4`, `cairn-ai@0.2.5` E404. System npm 12는 사용하지 않고 검증된 npm 10.9.8 `/private/tmp/cairn-npm-runtime/node_modules/npm/bin/npm-cli.js`를 고정합니다.
- Package gates: npm 10.9.8 normal-script `pack --dry-run`과 `publish --dry-run` 모두 129/129 tests, 64-file package, SHA-1 `08cfef271e70553ae8c94726f4c8a9671848c87a`, integrity `sha512-O/cvRuqRhPTRBjxriMKcy2sJSvUhFI/gpgCkgSOtsDbcggzALX1fobceUqLkEP34WUNXOGDhItDrxfcptvYQOw==`로 통과했습니다.

## Complexity Triage

- Selected path: Heavy Path.
- Rationale: GitHub push/PR/merge와 npm registry publish라는 외부 상태 변경을 exact SHA와 package digest에 묶어 순차 실행해야 합니다.
- Heavy Path signals found: external API/registry mutation, multi-branch promotion, irreversible package-version publish.
- Checked but not found: 새 코드 구현, auth 정책 변경, DB/migration, queue/payment, 새 architecture layer. Hotfix 구현 자체는 이미 검증·commit됐습니다.
- Roles: main orchestrator가 외부 mutation과 evidence를 수행하고, read-only preflight agent가 branch/version/CI/npm gate를 독립 확인했습니다. 최종 reviewer가 merge SHA·registry digest·smoke를 재검토합니다.

## Execution Contracts

### Task 0: triage-plan

- Status: completed after bound evidence.
- Checks: toolcheck/version/auth/registry/remote state, npm 10.9.8 pack and publish dry-run.

### Task 1: dev-pr

- Status: pending.
- Contract: release-plan commit 뒤 `git diff --check`, clean status, `git push --dry-run`을 재실행하고 branch를 push합니다. base `dev` ready PR을 만들고 exact PR head의 CI 6/6 성공 후 merge 직전 head를 재조회해 `--match-head-commit`으로 고정 병합합니다.
- Failure boundary: head 변경, CI 실패/누락, base drift가 있으면 병합하지 않습니다.

### Task 2: main-pr

- Status: pending.
- Contract: fresh fetch한 exact `origin/dev`를 head로 `dev`→`main` ready PR을 만들고, exact head CI 6/6 후 `--match-head-commit`으로 병합합니다.
- Failure boundary: dev에 unrelated 추가 변경이 들어오거나 head/CI가 달라지면 중단합니다.

### Task 3: npm-publish

- Status: pending.
- Contract: main merge 후 freshly fetched `origin/main` exact SHA의 clean detached worktree를 만들고 npm 10.9.8로 worktree 밖 tarball을 한 번 생성합니다. 동일 절대 경로 tarball을 `publish --dry-run`과 실제 `publish --access public --tag latest`에 전달합니다.
- Preconditions: `HEAD == origin/main == main PR merge SHA`, clean worktree, 0.2.5 manifests, npm whoami, registry E404.
- Failure boundary: publish 응답이 모호하면 blind retry하지 않고 registry version/dist digest를 먼저 조회합니다.
- Verification: registry version/latest/shasum/integrity 일치와 완전 격리된 HOME/CODEX_HOME/CLAUDE_HOME/ANTIGRAVITY_HOME/npm cache/prefix의 registry install 및 CLI help. lifecycle install/upgrade/uninstall은 실행하지 않습니다.

### Task 4: release-complete

- Status: pending.
- Contract: branch/PR exact heads, CI 6/6, dev/main merge SHA, registry digest와 isolated smoke를 독립 재검토하고 plan/goal evidence를 완료합니다.

## Status

- [x] Initial plan created
- [x] Triage finalized
- [ ] dev PR merged
- [ ] main PR merged
- [ ] npm 0.2.5 published and verified
- [ ] Final review completed
