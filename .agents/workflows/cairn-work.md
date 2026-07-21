# cairn-work

Use the `cairn-work` skill.

Read the installed Cairn runtime locator at `{{CAIRN_RUNTIME_LOCATOR_JSON}}`. Resolve Cairn scripts and policy resources through that locator; only work artifacts and state belong to the target project.

Goal: execute the next incomplete module task in `PLAN.md` without bypassing the recorded complexity triage.

Procedure:

1. Every agent must read the project-root `MEMORY.md` for domain knowledge and repository policy before selecting or executing a task.
2. Read `PLAN.md`, the detailed plan, and relevant memory notes.
3. Read the Codex or Claude model guidance recorded in the plan.
4. Select one small module task.
5. Confirm required tool readiness by invoking Node directly with the locator's absolute `entrypoints.cli`, `toolcheck`, and `--root` for the target repository. Follow the installed toolcheck policy before any explicitly approved installation attempt.
6. Confirm the complexity triage and selected Light/Heavy Path recorded in the plan. If missing, update the plan before mutating files.
7. For Light Path, keep the user-called/main agent in the orchestrator role and delegate implementation edits to one bounded `worker` whenever subagent tools are available, then run focused verification.
8. For Heavy Path, follow the plan's staged implementation and review gates without role-mapping shortcuts.
9. Delegate actual implementation edits to `worker` with clear file ownership on both Light Path and Heavy Path whenever subagent tools are available. When the subagent tool provides a progress-reporting channel, require subagents to report status to the orchestrator when starting work, when deciding or confirming direction, during periodic progress, and when finishing; immediately relay received status events to the user. If no mid-run reporting channel exists, relay observable events such as assignment, waiting, and final completion. Require delegated subagents to provide a final report before leaving; after capturing the final report and evidence, close or release the completed subagent, then review the final report and evidence before marking the work complete. When subagent tools are available, each agent may recursively delegate bounded sub-tasks to subagents. Tell every delegated agent and child subagent to read the project-root `MEMORY.md` before work, keep scope, and preserve others' edits. If subagent tools are unavailable, the main agent takes over implementation directly and records that takeover in evidence.
10. Re-run module acceptance verification.
11. Re-run surface integration verification.
12. Record tool readiness and verification evidence in `docs/plan/<topic>.md` and update `PLAN.md`.
13. If the user asks a side question, status question, or narrow clarification while this task is still active, answer it briefly and then resume the previous active work unless the user explicitly asks to pause, stop, or switch tasks.
14. Use the OS locale for user-visible responses and generated or updated documentation, plans, and memory artifacts unless the user asks for another language.
