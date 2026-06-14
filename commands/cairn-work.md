# cairn-work

Use the `cairn-work` skill.

Prerequisite: if `scripts/cairn doctor` fails, restore installation with `scripts/cairn install` or `scripts/cairn upgrade`.

Goal: execute the next incomplete module slice in `PLAN.md`.

Procedure:

1. Read `PLAN.md`, the detailed plan, `MEMORY.md`, and relevant memory notes.
2. Read the Codex or Claude model guidance recorded in the plan.
3. Select one small module slice.
4. Confirm required tool readiness. If a required LSP/check tool is missing, run `scripts/cairn toolcheck --install` or a repository-native install command before accepting a fallback.
5. Confirm the complexity triage and selected route recorded in the plan.
6. For the fast route, proceed as `planner -> builder`.
7. For the full route, keep `architect -> planner -> reviewer -> builder -> reviewer`.
8. Delegate implementation to `builder` or `worker` according to model guidance.
9. Re-run module acceptance verification.
10. Re-run surface integration verification.
11. Record tool readiness and verification evidence in `docs/plan/<topic>.md` and update `PLAN.md`.
12. Use the OS locale for user-visible output unless the user asks for another language.
