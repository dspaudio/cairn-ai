# cairn-install

Goal: install Cairn into Codex, Claude Code, and Antigravity.

Run:

```sh
scripts/cairn install
```

With the published package:

```sh
bunx cairn-ai@latest install
```

Actions:

- Copy the Cairn installation into the Codex marketplace cache.
- Add the `hooks/hooks.json` link to the installed manifest.
- Register marketplace, plugin, and hook trust state in `~/.codex/config.toml`.
- Install `cairn-*` commands and agents mirror files for Claude Code.
- Install `cairn-*` skills and workflows mirror files for Antigravity IDE/CLI.
- Create `*.cairn-backup-*` backups before changing settings.
