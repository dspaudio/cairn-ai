# cairn-uninstall

Goal: remove the Codex, Claude Code, and Antigravity entries installed by Cairn.

Run from the published or global package:

```sh
bunx cairn-ai@latest uninstall
```

The custom marketplace ownership manifest is authoritative. Uninstall first compares every non-config managed destination with its recorded installed digest and refuses the whole uninstall, changing nothing, if any managed artifact was modified or removed. Otherwise it removes or restores the managed destinations; unmanaged targets and their parent directories are preserved. A failure rolls back the transaction.

Managed items:

- Cairn marketplace, plugin, and hook trust state blocks in `~/.codex/config.toml`.
- `~/.cairn/install/` (ownership manifest, canonical and retained runtimes, Codex marketplace source, Claude Code marketplace).
- `$CODEX_HOME/plugins/cache/cairn` (Codex versioned runtime cache and retained copies).
- The Claude Code plugin `cairn@cairn` registration.
- Auto-upgrade state in `~/.cairn/update/`.
- Claude Code `cairn-*` commands and agents mirror files.
- Antigravity IDE/CLI `cairn-*` skills and workflows mirror files.

Only the hosts recorded in the ownership manifest are touched. An installation made by Cairn 0.6.0 or earlier is removed in place without migrating.

After the transaction commits, Cairn removes empty managed scaffold directories bottom-up and removes `~/.cairn/install/` and `$CODEX_HOME/plugins/cache/cairn` only when empty, after releasing its own lifecycle lock. `~/.cairn/update/` loses its known state files and is removed when empty. A directory containing any unmanaged child is preserved; pruning never uses recursive deletion.

The source work folder, repository `MEMORY.md`, `PLAN.md`, `docs/`, and user-home Cairn goal state (`~/.cairn/projects/`) and settings (`~/.cairn/config.json`) are not deleted. The globally installed `cairn-ai` package, package-manager download caches, legacy backup files, and legacy shared settings not recorded by the current ownership manifest are also outside this command's scope and require a separate, explicit cleanup decision.
