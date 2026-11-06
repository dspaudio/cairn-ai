# Plan: Cairn 0.3.0 릴리스

## Goal

[Cairn 오버헤드 축소와 task DAG](cairn-overhead-reduction.md) 변경을 `0.3.0`으로 커밋하고 `dev` → `main` PR을 CI 통과 후 병합한 뒤, exact merged main에서 만든 tarball 하나만 npm `cairn-ai@0.3.0` latest로 게시합니다.

- Plan ID: `docs/plan/release-0.3.0.md`
- Completion criteria: main PR CI 성공·병합, exact-main tarball 게시, registry version/digest 일치, 격리 설치 CLI 동작.
- 버전: 사용자가 0.3.0을 선택했습니다(상태 스키마 v3와 새 명령).
- Safety: 사용자 Cairn 설치, HOME, 전역 npm prefix/cache는 변경하지 않습니다. `.omo/`와 기존 stash는 손대지 않습니다.

## Triage

- 경로: 릴리스/배포 작업이며 코드 변경은 버전 문자열뿐입니다. 이전 릴리스 계획(`release-0.2.7.md`)의 promotion·exact-tarball 원칙을 따릅니다.
- 사전 확인(2026-11-06): npm `latest`는 `0.2.9`이고 `0.3.0`은 아직 없습니다. GitHub 인증은 정상입니다. `npm whoami`는 401이라 publish 전에 사용자의 npm 재로그인이 필요합니다. 로컬 npm은 11.20.0이고, 이전 계획에 고정된 npm 10.9.8 runtime 경로는 없어서 로컬 npm을 사용합니다.
- 브랜치: `dev`에 직접 커밋해 push한 뒤 `dev` → `main` PR로 승격합니다(#62, #64와 같은 흐름). `origin/main`의 `0b7683e`는 `dev`의 조상이 아니지만 트리 내용은 같습니다.
- `CLAUDE_PLUGIN_SINCE = "0.2.9"`는 플러그인이 처음 도입된 버전을 뜻하므로 바꾸지 않습니다.

## Tasks

1. `release-commit`: 버전 0.3.0, `npm run check`, 커밋, push.
2. `main-pr`: `dev` → `main` PR, exact head CI 성공 후 head 고정 병합.
3. `npm-publish`: exact merged main의 clean detached worktree에서 pack 1회 → 같은 tarball로 publish dry-run과 publish → registry digest 대조. 응답이 모호하면 재시도하지 않고 registry부터 조회합니다.
4. `release-verify`: 격리 prefix에 registry 0.3.0을 설치하고 `cairn goal` start/ready/finish 표면을 확인합니다.

## Evidence

- 진행하며 기록.
