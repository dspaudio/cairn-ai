# cairn-uninstall

Goal: remove the Codex, Claude Code, and Antigravity entries installed by Cairn.

Read the installed Cairn runtime locator at `{{CAIRN_RUNTIME_LOCATOR_JSON}}`. Invoke Node directly with the absolute `entrypoints.cli` value and `["uninstall"]`; do not build a shell-interpolated command from the path.

Uninstall removes the managed entries of the recorded hosts and retained runtimes, then removes `~/.cairn/install/` only when it is empty. It removes the auto-upgrade state files in `~/.cairn/update/`, removes `update/stage/` only when no auto-upgrade runner holds `update/update.lock`, and removes `~/.cairn/update/` only when it is empty. An installation made by Cairn 0.6.0 or earlier is removed in place without migrating.

The source work folder, user-created `MEMORY.md`, `PLAN.md`, `docs/memory`, and `docs/plan` files, goal state in `~/.cairn/projects/`, and `~/.cairn/config.json` are not deleted.
