# cairn-upgrade

Goal: update the Cairn installation from the current source.

Run:

```sh
node scripts/cairn.mjs upgrade
```

With the published package:

```sh
bunx cairn-ai@latest upgrade
```

Actions:

- Replace the Cairn installation in the Codex cache.
- Recompute hook trust state and update settings.
- Overwrite Claude Code mirror files with the latest content.
- Overwrite Antigravity IDE/CLI skills and workflows mirror files with the latest content.
- Create `*.cairn-backup-*` backups before changing settings.
