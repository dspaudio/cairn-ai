# cairn-memory

Use the `cairn-memory` skill.

Goal: create or update repository memory without asking the user for discoverable facts.

Procedure:

1. Ensure `MEMORY.md`, `PLAN.md`, `docs/memory`, and `docs/plan`.
2. Read `MEMORY.md`.
3. Explore repository facts with focused tools.
4. Use `explorer` for read-only domain discovery and contradiction checks when available; use `worker` for exact references, command checks, and bounded evidence capture.
5. Write details to `docs/memory/<domain>.md`.
6. Keep `MEMORY.md` as a short index.
7. Use the OS locale for user-visible output unless the user asks for another language.
