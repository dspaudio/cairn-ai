# cairn-uninstall

Goal: remove the Codex, Claude Code, and Antigravity entries installed by Cairn.

Run from the published or global package:

```sh
bunx cairn-ai@latest uninstall
```

Removed items:

- Cairn marketplace, plugin, and hook trust state blocks in `~/.codex/config.toml`.
- `~/.codex/plugins/cache/cairn`.
- Claude Code `cairn-*` commands and agents mirror files.
- Antigravity IDE/CLI `cairn-*` skills and workflows mirror files.

The source work folder is not deleted.
