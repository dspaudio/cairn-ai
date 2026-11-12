# cairn-install

Goal: install Cairn into Codex, Claude Code, and Antigravity.

Run:

```sh
bunx cairn-ai@latest install
```

Add `--hosts all` or a comma list of `codex`, `claude`, `antigravity` to choose hosts; without it a first install at a terminal asks once, and non-interactive runs install every host. The canonical runtime goes to `~/.cairn/install/runtime/<version>/` (`CAIRN_HOME` overrides `~/.cairn`), and automatic upgrades are on by default (`cairn auto-upgrade status|on|off|run`). If the installed version is newer than this CLI, install refuses without changes; add `--allow-downgrade` to install this version anyway.

Installation must run from the package/global source because the installed copy (`~/.cairn/install/` or the Codex plugin cache) is the destination. Do not copy Cairn runtime files into the target project and do not invoke install from a cached plugin locator.

After installation, check status with the `cairn-doctor` workflow.
