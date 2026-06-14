# cairn-work

Use the `cairn-work` skill.

Goal: execute the next incomplete module slice in `PLAN.md`.

Procedure:

1. Read `PLAN.md`, the detailed plan, `MEMORY.md`, and relevant memory notes.
2. Read the Codex or Claude model guidance recorded in the plan.
3. Select one small module slice.
4. Confirm required tool readiness. If a required LSP/check tool is missing, run `node scripts/cairn.mjs toolcheck --install` or a repository-native install command before accepting a fallback.
5. Confirm the complexity triage and selected Light/Heavy Path recorded in the plan.
6. For Light Path, implement directly or use one bounded `worker`, then run focused verification.
7. For Heavy Path, follow the plan's staged implementation and review gates without role-mapping shortcuts.
8. When delegating implementation to `worker`, state the file ownership clearly and tell the worker not to revert others' edits.
9. Re-run module acceptance verification.
10. Re-run surface integration verification.
11. Record tool readiness and verification evidence in `docs/plan/<topic>.md` and update `PLAN.md`.
12. Use the OS locale for user-visible output unless the user asks for another language.
