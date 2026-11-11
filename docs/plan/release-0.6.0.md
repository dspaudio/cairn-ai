# Plan: Cairn 0.6.0 릴리스

## Goal

[메모리·계획 인덱스 재활용과 측정·감사 잔여 수정](memory-plan-index-reuse.md)을 `0.6.0`으로 올려 기능 브랜치 → `dev` PR, `dev` → `main` PR을 CI 통과 후 병합하고, exact merged main에서 만든 tarball 하나만 npm `cairn-ai@0.6.0` latest로 게시합니다.

- Plan ID: `docs/plan/release-0.6.0.md`
- Completion criteria (advisory text; Cairn does not enforce it — completion is gated only by required evidence): dev·main PR CI 성공과 병합, exact-main tarball 게시, registry version/digest 일치, 격리 설치에서 새 CLI와 hook 주입 동작.
- 버전: `0.6.0`. 새 CLI 하위 명령(`cairn memory|plan check|index`, `goal stats --history`)과 hook 주입이 추가된 minor 릴리스라 main이 정했습니다. 사용자가 dev PR 병합, main PR 병합, npm 배포를 요청했습니다(2026-11-11).
- Safety: 로컬 Cairn 설치본 업그레이드는 요청 범위가 아니라 하지 않습니다. `.omo/`와 기존 stash는 손대지 않습니다. npm 게시는 되돌릴 수 없습니다.

## Memory Inputs

- `MEMORY.md`, `docs/memory/release-process.md`(버전 표면, exact-main tarball 절차, npm 대화형 인증).
- Related completed plans: `docs/plan/release-0.5.0.md`(같은 절차와 Windows lock 테스트 플레이크 기록).

## Triage

- Selected path: Light Path. 추가 코드 변경은 버전 문자열뿐이며 `release-0.5.0.md`의 exact-tarball 절차를 따릅니다. Heavy Path signals checked: 없음(릴리스할 기능은 이미 Heavy Path로 구현·리뷰됨).
- Request/Planning checkpoint: Light Path. 버전 표면은 `package.json`, `.codex-plugin/plugin.json`, 테스트 5개 파일의 기대값(`docs/memory/release-process.md`).
- Code checkpoint: 버전 치환 직전에 `grep -rn '0\.5\.0' package.json .codex-plugin test`로 확인.
- 위임: 버전 문자열 치환과 Git/GitHub/npm 조작은 기계적이라 main이 직접 수행합니다. `npm publish`는 대화형 인증이 필요해 사용자의 터미널에서 실행합니다.

## Tasks

1. `release-commit`: 기능 브랜치 생성, 버전 0.6.0, `npm run check`, 커밋, push.
2. `dev-pr`: 기능 브랜치 → `dev` PR, exact head CI 성공 후 head 고정 병합.
3. `main-pr`: `dev` → `main` PR, exact head CI 성공 후 head 고정 병합.
4. `npm-publish`: exact merged main의 clean detached worktree에서 pack 1회 → 같은 tarball로 publish dry-run과 publish → registry digest 대조. 응답이 모호하면 재시도하지 않고 registry부터 조회합니다.
5. `release-verify`: 격리 prefix·cache·HOME·`CAIRN_HOME`에 registry 0.6.0을 설치해 `memory check`/`index`, hook의 메모리 블록, `goal stats --history`를 확인합니다.
6. `release-record`: 증거를 이 계획에 기록하고 `main`의 병합 커밋을 `dev`에 다시 합치는 기록 PR을 병합합니다.

## Evidence

- 진행에 따라 기록.

## Status

- [x] Planned
- [ ] Dry-run or check passed, or not applicable was recorded
- [ ] Implemented
- [ ] Module acceptance passed
- [ ] Surface integration passed
- [ ] Reviewed
- [ ] Goal completed, or an explicit paused/blocked/cancelled reason was recorded
