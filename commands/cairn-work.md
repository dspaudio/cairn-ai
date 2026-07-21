# cairn-work

Use the `cairn-work` skill.

Prerequisite: resolve the installed Cairn runtime from the plugin or skill locator. If `cairn doctor` fails, restore it with the published/global lifecycle command. Never look for Cairn scripts or model guidance in the target repository.

Goal: execute the active goal's current task without bypassing complexity triage, then keep advancing tasks until goal-level final review completes or the goal is explicitly paused, blocked, or cancelled.

Procedure:

1. Every agent must read the project-root `MEMORY.md` for domain knowledge and repository policy before selecting or executing a task.
2. Read `PLAN.md`, the detailed plan, and relevant memory notes.
3. Resolve and read the `cairn://` Codex or Claude model guidance recorded in the plan through the installed runtime.
4. Read Cairn goal status and select only its current task. If implementation was requested but no goal exists, create it from the decision-complete plan.
5. Confirm required tool readiness. If a required LSP/check tool is missing, report it and obtain explicit user approval before `toolcheck --install --yes` or a repository-native install command.
6. Confirm the complexity triage and selected Light/Heavy Path recorded in the plan. If missing, update the plan before mutating files.
7. For Light Path, keep the user-called/main agent in the orchestrator role and delegate implementation edits to one bounded `worker` whenever subagent tools are available, then run focused verification.
8. For Heavy Path, follow the plan's staged implementation and review gates without role-mapping shortcuts.
9. Delegate actual implementation edits to `worker` with clear file ownership on both Light Path and Heavy Path whenever subagent tools are available. When the subagent tool provides a progress-reporting channel, require subagents to report status to the orchestrator when starting work, when deciding or confirming direction, during periodic progress, and when finishing; immediately relay received status events to the user. If no mid-run reporting channel exists, relay observable events such as assignment, waiting, and final completion. Require delegated subagents to provide a final report before leaving; after capturing the final report and evidence, close or release the completed subagent, then review the final report and evidence before marking the work complete. When subagent tools are available, each agent may recursively delegate bounded sub-tasks to subagents. Tell every delegated agent and child subagent to read the project-root `MEMORY.md` before work, keep scope, and preserve others' edits. If subagent tools are unavailable, the main agent takes over implementation directly and records that takeover in evidence.
10. For Heavy Path, run the recorded automated test command and record explicit `Tests:` evidence before any completion claim.
11. Re-run module acceptance verification.
12. Re-run surface integration verification.
13. Record successful verification as structured receipts bound to the goal/task/plan. Missing, failed, skipped, or placeholder receipts never complete a task.
14. Complete the current task, let Cairn advance to the next one, and continue until every task and goal-level final review receipt passes. Workers return only their assigned task handoff and never select the next task.
15. Record tool readiness and verification evidence in `docs/plan/<topic>.md`, update goal state, and update `PLAN.md` only after evidence exists.
16. If the user asks a side question, status question, or narrow clarification while this task is still active, answer it briefly and then resume the previous active work unless the user explicitly asks to pause, stop, or switch tasks.
17. Use the OS locale for user-visible responses and generated or updated documentation, plans, and memory artifacts unless the user asks for another language.
