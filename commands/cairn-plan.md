# cairn-plan

Use the `cairn-plan` skill.

Prerequisite: if `scripts/cairn doctor` fails, restore installation with `scripts/cairn install` or `scripts/cairn upgrade`.

Goal: leave a decision-complete plan for the current task in files.

Procedure:

1. Read `MEMORY.md` and relevant `docs/memory/*.md`.
2. If the active or assigned model is Claude-family, read `docs/model-guidance/claude.md`; if Codex-family, read `docs/model-guidance/codex.md`.
3. Explore before asking the user.
4. Run complexity triage.
5. For the fast route, record `planner -> builder`.
6. For the full route, record `architect -> planner -> reviewer -> builder -> reviewer`.
7. Delegate to the needed agents according to the selected route and model guidance.
8. Write `docs/plan/<topic>.md`.
9. Add the topic link and status to `PLAN.md`.
10. Put module acceptance verification and surface integration verification on every module slice.
11. Use the OS locale for user-visible output unless the user asks for another language.
