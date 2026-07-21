# cairn-install

Goal: install Cairn into Codex, Claude Code, and Antigravity.

Run:

```sh
bunx cairn-ai@latest install
```

Installation must run from the package/global source because the cached plugin is the destination. Do not copy Cairn runtime files into the target project and do not invoke install from a cached plugin locator.

After installation, check status with the `cairn-doctor` workflow.
