# cairn-uninstall

Goal: remove the Codex, Claude Code, and Antigravity entries installed by Cairn.

Run from the published or global package:

```sh
bunx cairn-ai@latest uninstall
```

The custom marketplace ownership manifest is authoritative. Uninstall removes or restores only destinations whose current digest still matches the recorded installed digest; modified or unmanaged targets are preserved as conflicts. A failure rolls back the transaction.

Managed items:

- Cairn marketplace, plugin, and hook trust state blocks in `~/.codex/config.toml`.
- `~/.codex/plugins/cache/cairn`.
- Claude Code `cairn-*` commands and agents mirror files.
- Antigravity IDE/CLI `cairn-*` skills and workflows mirror files.

The source work folder is not deleted. The custom marketplace root is removed last, after external mirrors and config have committed successfully.
