# cairn-memory

Create or update `MEMORY.md` and `docs/memory/<domain>.md`.

Read the installed Cairn runtime locator at `{{CAIRN_RUNTIME_LOCATOR_JSON}}`. Resolve `resources.commands` from that JSON object and follow `cairn-memory.md` in that directory. Do not resolve Cairn command files from the target project.
