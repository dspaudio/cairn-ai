# cairn-install

목표: Cairn을 Codex와 Claude Code에 설치합니다.

실행:

```sh
scripts/cairn install
```

패키지 배포본에서는 다음처럼 실행합니다.

```sh
bunx cairn-ai@latest install
```

수행 내용:

- Codex marketplace 캐시에 Cairn 설치본을 복사합니다.
- 설치본 manifest에 `hooks/hooks.json` 연결을 추가합니다.
- `~/.codex/config.toml`에 marketplace, plugin, hook trust state를 등록합니다.
- Claude Code용 `cairn-*` commands와 agents 미러 파일을 설치합니다.
- 설정 변경 전 `*.cairn-backup-*` 백업을 만듭니다.
