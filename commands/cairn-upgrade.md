# cairn-upgrade

목표: 현재 소스 기준으로 Cairn 설치본을 갱신합니다.

실행:

```sh
scripts/cairn upgrade
```

패키지 배포본에서는 다음처럼 실행합니다.

```sh
bunx cairn-ai@latest upgrade
```

수행 내용:

- Codex 캐시의 Cairn 설치본을 교체합니다.
- hook trust state를 다시 계산해 설정을 갱신합니다.
- Claude Code 미러 파일을 최신 내용으로 덮어씁니다.
- Antigravity IDE/CLI skills와 workflows 미러 파일을 최신 내용으로 덮어씁니다.
- 설정 변경 전 `*.cairn-backup-*` 백업을 만듭니다.
