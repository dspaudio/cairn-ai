# cairn-install

Goal: install Cairn into Codex, Claude Code, and Antigravity.

Run from the published or global package, not from the installed cache copy:

```sh
bunx cairn-ai@latest install
```

The current custom marketplace lifecycle remains in use; this is not a migration to `codex plugin add`. Do not invoke lifecycle install/upgrade from the cached plugin root because that copy is the replacement target.

Actions:

- Stage and validate the Cairn installation, then transactionally commit the custom marketplace source and versioned runtime cache.
- Add the `hooks/hooks.json` link to the installed manifest.
- Register only Cairn-owned marketplace, plugin, and hook trust sections in `~/.codex/config.toml`; do not rewrite public feature or agent settings.
- Install `cairn-*` commands and agents mirror files for Claude Code.
- Install `cairn-*` skills and workflows mirror files for Antigravity IDE/CLI.
- Write runtime locators so all mirrors resolve scripts, templates, and model guidance from the installed plugin root.
- Record every managed destination and digest in the ownership manifest under the custom marketplace, and rollback committed phases in reverse order on failure.
- Adopt an exact, unmodified supported legacy install only after release-integrity validation; preserve and reject modified or unknown artifacts.
