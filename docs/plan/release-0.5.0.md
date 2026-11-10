# Plan: Cairn 0.5.0 릴리스

## Goal

[모델 위임 규칙 4가지 개선](delegation-model-identity-rules.md)을 `0.5.0`으로 올려 기능 브랜치 → `dev` PR, `dev` → `main` PR을 CI 통과 후 병합하고, exact merged main에서 만든 tarball 하나만 npm `cairn-ai@0.5.0` latest로 게시한 뒤 로컬 Cairn 설치본을 0.5.0으로 업그레이드합니다.

- Plan ID: `docs/plan/release-0.5.0.md`
- Completion criteria: dev·main PR CI 성공과 병합, exact-main tarball 게시, registry version/digest 일치, 격리 설치 CLI 동작, 로컬 설치본 0.5.0 확인.
- 버전: `0.5.0`(사용자 지정, 2026-11-10). 병합, 게시, 설치본 업그레이드까지 사용자가 요청했습니다.
- Safety: 설치본 업그레이드 외에는 HOME, 전역 설정을 변경하지 않습니다. `.omo/`와 기존 stash는 손대지 않습니다.

## Triage

- Selected path: Light Path. 추가 코드 변경은 버전 문자열뿐이며 `release-0.4.1.md`의 exact-tarball 절차를 따릅니다. Heavy Path signals checked: 없음.
- Request/Planning/Code checkpoint: Light Path 유지. 버전 표면은 `package.json`, `.codex-plugin/plugin.json`, 테스트 5개 파일의 현재 버전 기대값뿐임을 grep으로 확인.
- 위임: 버전 문자열 치환과 Git/GitHub/npm 조작은 기계적이라 main이 직접 수행합니다.

## Tasks

1. `release-commit`: 버전 0.5.0, `npm run check`, 커밋, push.
2. `dev-pr`: PR #77 exact head CI 성공 후 head 고정 병합.
3. `main-pr`: `dev` → `main` PR, exact head CI 성공 후 head 고정 병합.
4. `npm-publish`: exact merged main의 clean detached worktree에서 pack 1회 → 같은 tarball로 publish dry-run과 publish → registry digest 대조. 응답이 모호하면 재시도하지 않고 registry부터 조회합니다.
5. `release-verify`: 격리 prefix에 registry 0.5.0을 설치해 strongest tier 게이트와 `effectiveModel` 노출을 확인합니다.
6. `local-upgrade`: 로컬 Cairn 설치본을 0.5.0으로 업그레이드하고 `cairn doctor`로 확인합니다.

## Evidence

- (진행하며 기록)
