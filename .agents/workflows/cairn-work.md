# cairn-work

Use the `cairn-work` skill.

Goal: execute the next incomplete module slice in `PLAN.md` without bypassing the recorded complexity triage.

Procedure:

1. Every agent must read the project-root `MEMORY.md` for domain knowledge and repository policy before selecting or executing a slice.
2. Read `PLAN.md`, the detailed plan, and relevant memory notes.
3. Read the Codex or Claude model guidance recorded in the plan.
4. Select one small module slice.
5. Confirm required tool readiness. If a required LSP/check tool is missing, run `node scripts/cairn.mjs toolcheck --install` or a repository-native install command before accepting a fallback.
6. Confirm the complexity triage and selected Light/Heavy Path recorded in the plan. If missing, update the plan before mutating files.
7. For Light Path, implement directly or use one bounded `worker`, then run focused verification.
8. For Heavy Path, follow the plan's staged implementation and review gates without role-mapping shortcuts.
9. When delegating implementation to `worker`, state the file ownership clearly, tell every delegated agent to read the project-root `MEMORY.md` before work, and tell the worker not to revert others' edits.
10. Re-run module acceptance verification.
11. Re-run surface integration verification.
12. Record tool readiness and verification evidence in `docs/plan/<topic>.md` and update `PLAN.md`.
13. Use the OS locale for user-visible output unless the user asks for another language.
