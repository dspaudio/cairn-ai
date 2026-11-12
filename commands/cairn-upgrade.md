# cairn-upgrade

Goal: update the Cairn installation from the current source.

Run from the published or global package, not from the installed cache copy:

```sh
bunx cairn-ai@latest upgrade
bunx cairn-ai@latest upgrade --hosts codex,claude
```

The current custom marketplace lifecycle remains in use. An installed copy (`~/.cairn/install/` or the Codex plugin cache) is a replacement target and must not upgrade itself.

Actions:

- Replace only files tracked by the ownership manifest whose current digest still matches the installed digest.
- Recompute Cairn-owned hook trust state without rewriting public feature or agent settings.
- Replace owned Claude Code and Antigravity mirror files with the latest content.
- Refresh runtime locators for every installed surface.
- Stage and validate all candidates before commit; rollback committed phases in reverse order on failure.
- Preserve and report a conflict for modified, unmanaged, or invalid legacy artifacts.
- Keep the recorded hosts unless `--hosts` (`all` or a comma list of `codex`, `claude`, `antigravity`) changes them; deselected hosts are removed, and a modified artifact of a deselected host refuses the upgrade.
- Migrate an installation made by Cairn 0.6.0 or earlier (everything under `$CODEX_HOME/plugins/cache/cairn`) to `~/.cairn/install/` in one transaction, re-registering the Claude Code plugin from its new marketplace path. A failed or interrupted migration is restored; a legacy installation migrates with every host, so a narrower `--hosts` is refused until the next run. Restart sessions that were open during the migration.
- After a version change, keep the previous canonical runtime and Codex cache copy for 3 days (at most 3 of each); expired ones are removed by the next install or upgrade. A Codex cache copy at or above the new version is never kept, because Codex loads the highest cached version.
- When the Claude Code plugin cache holds a different version, run `claude plugin marketplace update cairn` and `claude plugin update cairn@cairn --scope user`. If that fails, keep the upgraded files, print those commands, and exit 1.
- Refuse, changing nothing, when the installed version is newer than this CLI; `--allow-downgrade` moves the installation to this CLI's version anyway.
- `upgrade --auto` is reserved for the auto-upgrade runner; it keeps the recorded hosts, never downgrades (it cannot be combined with `--allow-downgrade`), and refuses to run without an existing installation.
