# cairn-uninstall

목표: Cairn이 설치한 Codex, Claude Code, Antigravity 항목을 제거합니다.

실행:

```sh
scripts/cairn uninstall
```

패키지 배포본에서는 다음처럼 실행합니다.

```sh
bunx cairn-ai@latest uninstall
```

제거 항목:

- `~/.codex/config.toml`의 Cairn marketplace, plugin, hook trust state 블록.
- `~/.codex/plugins/cache/cairn`.
- Claude Code의 `cairn-*` commands와 agents 미러 파일.
- Antigravity IDE/CLI의 `cairn-*` skills와 workflows 미러 파일.

원본 `/Users/wknam/workspace/cairn` 작업 폴더는 삭제하지 않습니다.
