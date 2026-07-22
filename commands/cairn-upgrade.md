# cairn-upgrade

Goal: update the Cairn installation from the current source.

Run from the published or global package, not from the installed cache copy:

```sh
bunx cairn-ai@latest upgrade
```

The current custom marketplace lifecycle remains in use. The cached plugin root is a replacement target and must not upgrade itself.

Actions:

- Replace only files tracked by the ownership manifest whose current digest still matches the installed digest.
- Recompute Cairn-owned hook trust state without rewriting public feature or agent settings.
- Replace owned Claude Code and Antigravity mirror files with the latest content.
- Refresh runtime locators for every installed surface.
- Stage and validate all candidates before commit; rollback committed phases in reverse order on failure.
- Preserve and report a conflict for modified, unmanaged, or invalid legacy artifacts.
