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

After the transaction commits, Cairn removes empty managed scaffold directories bottom-up and removes the custom marketplace root only after releasing its own lifecycle lock. A directory containing any unmanaged child is preserved; pruning never uses recursive deletion.

The source work folder, repository `MEMORY.md`, `PLAN.md`, `docs/`, and user-home Cairn goal state are not deleted. The globally installed `cairn-ai` package, package-manager download caches, legacy backup files, and legacy shared settings not recorded by the current ownership manifest are also outside this command's scope and require a separate, explicit cleanup decision.
