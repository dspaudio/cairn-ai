# cairn-memory

Use the `cairn-memory` skill.

Prerequisite: if `scripts/cairn doctor` fails, restore installation with `scripts/cairn install` or `scripts/cairn upgrade`.

Goal: create or update repository memory without asking the user for discoverable facts.

Procedure:

1. Run the plugin state initialization script.
2. Read `MEMORY.md`.
3. Explore repository facts with focused tools.
4. Delegate domain discovery to `architect`, exact references to `worker`, and contradiction checks to `reviewer`.
5. Write details to `docs/memory/<domain>.md`.
6. Keep `MEMORY.md` as a short index.
7. Use the OS locale for user-visible output unless the user asks for another language.
