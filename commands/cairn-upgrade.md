# cairn-upgrade

Goal: update the Cairn installation from the current source.

Run from the published or global package, not from the installed cache copy:

```sh
bunx cairn-ai@latest upgrade
```

The current custom lifecycle remains in use. The cached plugin root is a replacement target and must not upgrade itself.

Actions:

- Replace the Cairn installation in the Codex cache.
- Recompute hook trust state and update settings.
- Overwrite Claude Code mirror files with the latest content.
- Overwrite Antigravity IDE/CLI skills and workflows mirror files with the latest content.
- Refresh runtime locators for every installed surface.
- Create `*.cairn-backup-*` backups before changing settings.
