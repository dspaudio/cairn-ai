# cairn-memory

Use the `cairn-memory` skill.

Read the installed Cairn runtime locator at `{{CAIRN_RUNTIME_LOCATOR_JSON}}`. Cairn scripts and policy resources must be resolved through that locator, not from the target project.

Goal: create or update repository memory without asking the user for discoverable facts.

Procedure:

1. Ensure `MEMORY.md`, `PLAN.md`, `docs/memory`, and `docs/plan`.
2. Every agent must read the project-root `MEMORY.md` for domain knowledge and repository policy before assigned discovery or update work.
3. Explore repository facts with focused tools.
4. Use `explorer` for read-only domain discovery and contradiction checks when available; use `worker` for exact references, command checks, and bounded evidence capture. When subagent tools are available, each agent may recursively delegate bounded sub-tasks to subagents. Tell every delegated agent and child subagent to read the project-root `MEMORY.md` before work, keep scope, and preserve others' edits.
5. Write details to `docs/memory/<domain>.md`.
6. Keep `MEMORY.md` as a short index.
7. Use the OS locale for user-visible responses and generated or updated documentation, plans, and memory artifacts unless the user asks for another language.
