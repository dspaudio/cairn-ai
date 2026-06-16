# cairn-memory

Use the `cairn-memory` skill.

Prerequisite: if `node scripts/cairn.mjs doctor` fails, restore installation with `node scripts/cairn.mjs install` or `node scripts/cairn.mjs upgrade`.

Goal: create or update repository memory without asking the user for discoverable facts.

Procedure:

1. Run the plugin state initialization script.
2. Every agent must read the project-root `MEMORY.md` for domain knowledge and repository policy before assigned discovery or update work.
3. Explore repository facts with focused tools.
4. Use `explorer` for read-only domain discovery and contradiction checks when available; use `worker` for exact references, command checks, and bounded evidence capture. When subagent tools are available, each agent may recursively delegate bounded sub-tasks to subagents. Tell every delegated agent and child subagent to read the project-root `MEMORY.md` before work, keep scope, and preserve others' edits.
5. Write details to `docs/memory/<domain>.md`.
6. Keep `MEMORY.md` as a short index.
7. Use the OS locale for user-visible output unless the user asks for another language.
