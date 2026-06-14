# cairn-plan

Use the `cairn-plan` skill.

Prerequisite: if `scripts/cairn doctor` fails, restore installation with `scripts/cairn install` or `scripts/cairn upgrade`.

Goal: leave a decision-complete plan for the current task in files.

Procedure:

1. Read `MEMORY.md` and relevant `docs/memory/*.md`.
2. If the active or assigned model is Claude-family, read `docs/model-guidance/claude.md`; if Codex-family, read `docs/model-guidance/codex.md`.
3. Run `scripts/cairn toolcheck` when available.
4. If required LSP/check tools are missing, run `scripts/cairn toolcheck --install` or a repository-native install command before accepting a fallback.
5. Explore before asking the user.
6. Run complexity triage.
7. For the fast route, record `planner -> builder`.
8. For the full route, record `architect -> planner -> reviewer -> builder -> reviewer`.
9. Delegate to the needed agents according to the selected route and model guidance.
10. Write `docs/plan/<topic>.md`.
11. Add the topic link and status to `PLAN.md`.
12. Put tool readiness, module acceptance verification, and surface integration verification on every module slice.
13. Use the OS locale for user-visible output unless the user asks for another language.
