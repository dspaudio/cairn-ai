# Plan: Cairn 0.4.1 릴리스

## Goal

[Heavy Path 설계 모델 위임](heavy-design-model-routing.md)을 `0.4.1`로 커밋하고, 기능 브랜치 → `dev` PR, `dev` → `main` PR을 CI 통과 후 병합한 뒤, exact merged main에서 만든 tarball 하나만 npm `cairn-ai@0.4.1` latest로 게시합니다.

- Plan ID: `docs/plan/release-0.4.1.md`
- Completion criteria: dev·main PR CI 성공과 병합, exact-main tarball 게시, registry version/digest 일치, 격리 설치 CLI 동작.
- 버전: `0.4.1`(사용자 지정, 2026-11-09). npm `latest`는 `0.4.0`이고 `0.4.1`은 미게시.
- Safety: 사용자 Cairn 설치, HOME, 전역 npm prefix/cache는 변경하지 않습니다. `.omo/`와 기존 stash는 손대지 않습니다.

## Triage

- 경로: 릴리스/배포 작업이며 추가 코드 변경은 버전 문자열뿐입니다. `release-0.4.0.md`의 exact-tarball 원칙을 따릅니다.
- Selected path: Light Path. Heavy Path signals checked: 없음(버전 문자열과 기록만 변경).
- Request/Planning/Code checkpoint: Light Path 유지. 버전 표면은 `package.json`, `.codex-plugin/plugin.json`, 테스트의 현재 버전 기대값뿐임을 grep으로 확인.
- 브랜치: `dev` 직접 push는 보호 규칙 우회이므로 `feat/heavy-design-fable-routing` → `dev` PR로 진행합니다. `main` 보호 규칙이 strict이므로 `origin/main`을 먼저 이 브랜치에 합쳤습니다.
- 위임: 버전 문자열 치환은 기계적 변경이라 main이 직접 수행합니다.
- 사전 확인: `npm whoami`는 `wonkyoo.nam`. 게시 시 OTP/브라우저 승인이 필요할 수 있으며 그 경우 사용자 승인을 받습니다.

## Tasks

1. `release-commit`: 버전 0.4.1, `npm run check`, 커밋, push.
2. `dev-pr`: 기능 브랜치 → `dev` PR, exact head CI 성공 후 head 고정 병합.
3. `main-pr`: `dev` → `main` PR, exact head CI 성공 후 head 고정 병합.
4. `npm-publish`: exact merged main의 clean detached worktree에서 pack 1회 → 같은 tarball로 publish dry-run과 publish → registry digest 대조. 응답이 모호하면 재시도하지 않고 registry부터 조회합니다.
5. `release-verify`: 격리 prefix에 registry 0.4.1을 설치하고 설계 task 게이트를 확인합니다.

## Evidence

- 사전 정리: PR https://github.com/dspaudio/cairn-ai/pull/73 병합(merge `7f5aa8f`).
