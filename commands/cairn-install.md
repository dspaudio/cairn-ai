# cairn-install

Goal: install Cairn into Codex, Claude Code, and Antigravity.

Run from the published or global package, not from the installed cache copy:

```sh
bunx cairn-ai@latest install
```

The current custom lifecycle remains in use. Do not invoke lifecycle install/upgrade from the cached plugin root because that copy is the replacement target.

Actions:

- Copy the Cairn installation into the Codex marketplace cache.
- Add the `hooks/hooks.json` link to the installed manifest.
- Register marketplace, plugin, and hook trust state in `~/.codex/config.toml`.
- Install `cairn-*` commands and agents mirror files for Claude Code.
- Install `cairn-*` skills and workflows mirror files for Antigravity IDE/CLI.
- Write runtime locators so all mirrors resolve scripts, templates, and model guidance from the installed plugin root.
- Create `*.cairn-backup-*` backups before changing settings.
