# cairn-work

Use the `cairn-work` skill.

Goal: execute the next incomplete module slice in `PLAN.md`.

Procedure:

1. Read `PLAN.md`, the detailed plan, `MEMORY.md`, and relevant memory notes.
2. Read the Codex or Claude model guidance recorded in the plan.
3. Select one small module slice.
4. Confirm the complexity triage and selected route recorded in the plan.
5. For the fast route, proceed as `planner -> builder`.
6. For the full route, keep `architect -> planner -> reviewer -> builder -> reviewer`.
7. Delegate implementation to `builder` or `worker` according to model guidance.
8. Re-run module acceptance verification.
9. Re-run surface integration verification.
10. Record evidence in `docs/plan/<topic>.md` and update `PLAN.md`.
11. Use the OS locale for user-visible output unless the user asks for another language.
