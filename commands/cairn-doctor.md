# cairn-doctor

Goal: diagnose Cairn installation status.

Run:

```sh
node scripts/cairn.mjs doctor
```

With the published package:

```sh
bunx cairn-ai@latest doctor
```

Checks:

- Source plugin manifest.
- Codex cached installation.
- Marketplace file.
- Hook manifest link in the installed copy.
- `features.plugins`, `features.plugin_hooks`.
- `cairn@cairn` plugin enabled.
- hook trust state.
- Claude Code commands and agents mirror files.
- Antigravity IDE/CLI skills and workflows mirror files.
