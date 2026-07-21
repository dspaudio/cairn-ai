# cairn-uninstall

Goal: remove the Codex, Claude Code, and Antigravity entries installed by Cairn.

Read the installed Cairn runtime locator at `{{CAIRN_RUNTIME_LOCATOR_JSON}}`. Invoke Node directly with the absolute `entrypoints.cli` value and `["uninstall"]`; do not build a shell-interpolated command from the path.

The source work folder and user-created `MEMORY.md`, `PLAN.md`, `docs/memory`, and `docs/plan` files are not deleted.
