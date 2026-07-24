# cairn-memory

Use the `cairn-memory` skill.

Prerequisite: resolve the installed Cairn runtime from the plugin or skill locator. If `cairn doctor` fails, restore it with the published/global lifecycle command. Never look for Cairn scripts in the target repository.

Goal: create or update repository memory without asking the user for discoverable facts.

Procedure:

1. Run the installed plugin state initialization script with an explicit target `--root`.
2. Every agent reads project-root `MEMORY.md` when present and continues without repository memory when absent before assigned discovery or update work.
3. Explore repository facts with focused tools.
4. Use `explorer` for read-only domain discovery and contradiction checks when available; use `worker` for exact references, command checks, and bounded evidence capture. When subagent tools are available, each agent may recursively delegate bounded sub-tasks to subagents. Tell every delegated agent and child subagent to read the project-root `MEMORY.md` before work, keep scope, and preserve others' edits.
5. Write details to `docs/memory/<domain>.md`.
6. Keep `MEMORY.md` as a short index.
7. Use the OS locale for user-visible responses and generated or updated documentation, plans, and memory artifacts unless the user asks for another language.
