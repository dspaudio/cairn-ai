# cairn-work

Use the `cairn-work` skill.

Goal: execute the next incomplete module task in `PLAN.md` without bypassing the recorded complexity triage.

Procedure:

1. Every agent must read the project-root `MEMORY.md` for domain knowledge and repository policy before selecting or executing a task.
2. Read `PLAN.md`, the detailed plan, and relevant memory notes.
3. Read the Codex or Claude model guidance recorded in the plan.
4. Select one small module task.
5. Confirm required tool readiness. If a required LSP/check tool is missing, run `node scripts/cairn.mjs toolcheck --install` or a repository-native install command before accepting a fallback.
6. Confirm the complexity triage and selected Light/Heavy Path recorded in the plan. If missing, update the plan before mutating files.
7. For Light Path, implement directly or use one bounded `worker`, then run focused verification.
8. For Heavy Path, follow the plan's staged implementation and review gates without role-mapping shortcuts.
9. When delegating implementation to `worker`, state the file ownership clearly. When subagent tools are available, each agent may recursively delegate bounded sub-tasks to subagents. Tell every delegated agent and child subagent to read the project-root `MEMORY.md` before work, keep scope, and preserve others' edits.
10. Re-run module acceptance verification.
11. Re-run surface integration verification.
12. Record tool readiness and verification evidence in `docs/plan/<topic>.md` and update `PLAN.md`.
13. If the user asks a side question, status question, or narrow clarification while this task is still active, answer it briefly and then resume the previous active work unless the user explicitly asks to pause, stop, or switch tasks.
14. Use the OS locale for user-visible output unless the user asks for another language.
