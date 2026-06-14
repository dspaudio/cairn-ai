# cairn-doctor

목표: Cairn 설치 상태를 진단합니다.

실행:

```sh
scripts/cairn doctor
```

패키지 배포본에서는 다음처럼 실행합니다.

```sh
bunx cairn-ai@latest doctor
```

확인 항목:

- 원본 플러그인 manifest.
- Codex 캐시 설치본.
- marketplace 파일.
- 설치본의 hook manifest 연결.
- `features.plugins`, `features.plugin_hooks`.
- `cairn@cairn` plugin 활성화.
- hook trust state.
- Claude Code commands와 agents 미러 파일.
- Antigravity IDE/CLI skills와 workflows 미러 파일.
