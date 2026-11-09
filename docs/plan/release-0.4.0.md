# Plan: Cairn 0.4.0 릴리스

## Goal

[dispatch 시 추론 강도 실제 적용과 검증](dispatch-effort-enforcement.md)과 [작업별 모델 결정](per-task-model-routing.md)을 `0.4.0`으로 커밋하고, 기능 브랜치 → `dev` PR, `dev` → `main` PR을 CI 통과 후 병합한 뒤, exact merged main에서 만든 tarball 하나만 npm `cairn-ai@0.4.0` latest로 게시합니다.

- Plan ID: `docs/plan/release-0.4.0.md`
- Completion criteria: dev·main PR CI 성공과 병합, exact-main tarball 게시, registry version/digest 일치, 격리 설치 CLI 동작.
- 버전: `0.4.0`(새 CLI 옵션과 Heavy 완료 게이트, 모델 정책 변경). `0.3.0`은 이미 게시되어 재사용 불가.
- Safety: 사용자 Cairn 설치, HOME, 전역 npm prefix/cache는 변경하지 않습니다. `.omo/`와 기존 stash는 손대지 않습니다.

## Triage

- 경로: 릴리스/배포 작업이며 추가 코드 변경은 버전 문자열뿐입니다. `release-0.3.0.md`의 exact-tarball 원칙을 따릅니다.
- 브랜치: `dev` 직접 push는 보호 규칙 우회이므로 `feat/dispatch-effort-model-routing` → `dev` PR로 진행합니다.
- 사전 확인(2026-11-09): npm `latest`는 `0.3.0`이고 `0.4.0`은 없습니다. `npm whoami`는 401이라 publish 전에 사용자의 npm 재로그인이 필요합니다.

## Tasks

1. `release-commit`: 버전 0.4.0, `npm run check`, 커밋, push.
2. `dev-pr`: 기능 브랜치 → `dev` PR, exact head CI 성공 후 head 고정 병합.
3. `main-pr`: `dev` → `main` PR, exact head CI 성공 후 head 고정 병합.
4. `npm-publish`: exact merged main의 clean detached worktree에서 pack 1회 → 같은 tarball로 publish dry-run과 publish → registry digest 대조. 응답이 모호하면 재시도하지 않고 registry부터 조회합니다.
5. `release-verify`: 격리 prefix에 registry 0.4.0을 설치하고 `goal assign --effort`와 Heavy 완료 게이트를 확인합니다.

## Evidence

- (진행 중)
