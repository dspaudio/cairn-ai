# cairn-upgrade

Goal: update the current Cairn installation from the latest source.

Run:

```sh
bunx cairn-ai@latest upgrade
```

Upgrade keeps the recorded hosts unless `--hosts` changes them, moves an installation made by Cairn 0.6.0 or earlier to `~/.cairn/install/` in one run, keeps the previous runtime for 3 days, and refreshes a stale Claude Code plugin cache. If the installed version is newer than this CLI, upgrade refuses without changes; add `--allow-downgrade` to move back to this version anyway. Restart sessions that were open during a migration.

Upgrade must run from the package/global source because the installed copy (`~/.cairn/install/` or the Codex plugin cache) is replaced. Do not invoke upgrade from a cached plugin locator.

After upgrade, check status with the `cairn-doctor` workflow.
