# cairn-doctor

Goal: diagnose Cairn installation status.

Run from the published or global package:

```sh
bunx cairn-ai@latest doctor
```

The doctor validates the custom marketplace installation and ownership manifest without repairing it. Diagnostics are read-only; rollback is performed only by lifecycle transaction recovery.

Checks:

- Source plugin manifest.
- Codex cached installation.
- Marketplace file.
- Hook manifest link in the installed copy.
- ownership manifest presence and managed destination digests.
- `cairn@cairn` installed/enabled/version from the actual Codex CLI.
- effective Codex plugin/hook/multi-agent feature state (reported, never forced).
- hook trust state.
- Claude Code commands and agents mirror files.
- Antigravity IDE/CLI skills and workflows mirror files.
- Installed runtime locators and their referenced scripts, templates, and model guidance.
