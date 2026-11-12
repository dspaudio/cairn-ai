# cairn-install

Goal: install Cairn into Codex, Claude Code, and Antigravity.

Run from the published or global package, not from the installed cache copy:

```sh
bunx cairn-ai@latest install
bunx cairn-ai@latest install --hosts claude
```

The current custom marketplace lifecycle remains in use; this is not a migration to `codex plugin add`. Do not invoke lifecycle install/upgrade from an installed copy (`~/.cairn/install/` or the Codex plugin cache) because that copy is the replacement target.

Hosts: `--hosts all` or a comma list of `codex`, `claude`, `antigravity` (also `--hosts=<list>`). Without it, a first install at a terminal asks once (all hosts is the default); non-interactive runs and CI install every host. The selection is recorded in the ownership manifest and followed by upgrade, doctor, and uninstall.

Actions:

- Stage and validate the Cairn installation, then transactionally commit the canonical runtime `~/.cairn/install/runtime/<version>/` (`CAIRN_HOME` overrides `~/.cairn`) and, for Codex, the marketplace source `~/.cairn/install/codex/` and the versioned runtime cache `$CODEX_HOME/plugins/cache/cairn/cairn/<version>/`.
- Add the `hooks/hooks.json` link to the installed manifests.
- Register only Cairn-owned marketplace, plugin, and hook trust sections in `~/.codex/config.toml`; do not rewrite public feature or agent settings.
- Install `cairn-*` commands and agents mirror files for Claude Code.
- Generate the Claude Code plugin `cairn@cairn` (four skills plus hooks that call the canonical runtime) in the Cairn-owned local marketplace `~/.cairn/install/claude/`, then register it with `claude plugin marketplace add` and `claude plugin install cairn@cairn --scope user` after the files commit. Skip with a manual command when the `claude` CLI is missing, and never touch a different marketplace named `cairn`.
- Install `cairn-*` skills and workflows mirror files for Antigravity IDE/CLI.
- Write runtime locators so all mirrors resolve scripts, templates, and model guidance from the installed plugin root.
- Install only the surfaces of the selected hosts; the canonical runtime is always installed.
- Record every current managed destination and digest, the host selection, and the install origin in the ownership manifest `~/.cairn/install/lifecycle.json`, and rollback committed phases in reverse order on failure.
- Automatic upgrades are on by default for a package install; see `cairn auto-upgrade status|on|off|run`.
- Use the separate pinned SHA-256 release 0.2.2 file-hash allowlist only to validate that exact legacy file set; it is not the current package file list or a cryptographic signature.
- Adopt an exact, unmodified supported legacy install only after release-integrity validation; preserve and reject modified or unknown artifacts.
- Refuse, changing nothing, when the installed version is newer than this CLI; `--allow-downgrade` installs this CLI's version anyway.
