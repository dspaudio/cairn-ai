# cairn-doctor

Goal: diagnose Cairn installation status.

Run:

```sh
bunx cairn-ai@latest doctor
```

When running from local source:

```sh
scripts/cairn doctor
```

Checks:

- Codex plugin, marketplace, hook trust state.
- Claude Code commands and agents mirror files.
- Antigravity skills and workflows mirror files.
- Antigravity CLI skills and workflows mirror files.
