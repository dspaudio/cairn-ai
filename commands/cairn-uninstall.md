# cairn-uninstall

Goal: remove the Codex, Claude Code, and Antigravity entries installed by Cairn.

Run:

```sh
node scripts/cairn.mjs uninstall
```

With the published package:

```sh
bunx cairn-ai@latest uninstall
```

Removed items:

- Cairn marketplace, plugin, and hook trust state blocks in `~/.codex/config.toml`.
- `~/.codex/plugins/cache/cairn`.
- Claude Code `cairn-*` commands and agents mirror files.
- Antigravity IDE/CLI `cairn-*` skills and workflows mirror files.

The source work folder is not deleted.
