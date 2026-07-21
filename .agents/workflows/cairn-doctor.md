# cairn-doctor

Goal: diagnose Cairn installation status.

Read the installed Cairn runtime locator at `{{CAIRN_RUNTIME_LOCATOR_JSON}}`. Invoke Node directly with the absolute `entrypoints.cli` value and `["doctor"]`; do not build a shell-interpolated command from the path.

Checks:

- Codex plugin, marketplace, hook trust state.
- Claude Code commands and agents mirror files.
- Antigravity skills and workflows mirror files.
- Antigravity CLI skills and workflows mirror files.
- Installed runtime locators and the referenced scripts, templates, and model guidance.
