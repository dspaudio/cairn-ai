# Cairn Work: Delegation and Reasoning Effort

Reference for `cairn-work`. Read before dispatching a `worker` or `explorer`, or when recording reasoning effort. Quick Path work done directly by the main agent does not need this file.

## Subagent Lifecycle

- The user-called/main agent is the orchestrator: it selects the task, assigns implementation, verifies results, and records evidence. Actual implementation edits belong to `worker` subagents whenever subagent tools are available, regardless of Light Path or Heavy Path.
- Delegate implementation with exact files, ownership, constraints, and model-specific adjustment rules. For Light Path use one bounded `worker`. Use `explorer` for parallel read-only discovery or verification when useful.
- When the subagent tool provides a progress-reporting channel, subagents report status to the orchestrator when starting work, when deciding or confirming direction, during periodic progress, and when finishing. The orchestrator must immediately relay received status events to the user. If no mid-run reporting channel exists, the orchestrator relays observable events such as assignment, waiting, and final completion.
- Delegated subagents must provide a final report before leaving. After the orchestrator captures the final report and evidence, it must close or release the completed subagent, then review the final report and evidence before marking the work complete.
- When subagent tools are available, each agent may recursively delegate bounded sub-tasks to subagents. Every child subagent reads project-root `MEMORY.md` when present and continues when absent, keeps the assigned scope, and preserves others' edits.
- If subagent tools are unavailable, the main agent takes over implementation directly and records that takeover in evidence.
- `worker` returns a structured handoff for only its assigned goal/task: changed files, tool readiness result, dry-run or check result when applicable, automated test result for Heavy Path, module acceptance command and result, surface integration command or QA artifact, blocker, and cleanup notes. A worker must not select the next task.

## Parallel Tasks

- `goal ready` (read-only) prints `{"active":[...],"ready":[...],"blocked":[...]}` task ids. A ready task is pending with every dependency completed.
- Only ready tasks can be activated: `goal task --task <id> --status active`. At most 4 tasks are active at once; active `writeScope`s must not overlap (segment-wise prefix, case-insensitive), and a task without `writeScope` is active only alone. start/replan/completion auto-activate only the first ready task when nothing is active; open further parallel tasks explicitly.
- Assign one `worker` per active task (`goal assign`); assignment, evidence, and completion stay per task. Workers stay inside their `writeScope` and exchange data only through the plan's handoff files.
- Parallel workers must run in the same Git worktree: goal state is stored per worktree, so another worktree sees no goal.
- While other tasks are active, task-scope `goal verify` needs `--watch` paths inside that task's `writeScope`, so sibling edits cannot stale or fail its evidence; goal-scope verify needs `--watch` when 2 or more tasks are active.
- Rerun `goal ready` after each completion. A blocked task keeps its dependents pending while unrelated branches continue; the goal becomes blocked only when no task is active or ready.
- Main Stop gates on all active tasks; SubagentStop gates the stopping agent's own assigned active task. The hook adds one `Parallel active:` line only when 2 or more tasks are active.

## Builder Prompt Format

```text
TASK: Implement task <task-id> for <topic>.
EXPECTED OUTCOME: Minimal code or documentation change satisfying the task contract.
REQUIRED TOOLS: Scoped file editing, tool readiness checks, existing test/build commands, surface QA commands.
MUST DO: Read the project-root `MEMORY.md` before doing assigned work and follow its policy. Stay within the listed file scope and the task's `writeScope`. Assume you are not alone in the codebase; do not revert others' edits. Follow the subagent lifecycle rules (status reporting when a channel exists, final report before leaving, recursive delegation only for bounded sub-tasks with these same constraints). Obtain explicit user approval before installing missing tools. Run dry-run or check mode before external-state mutation when available. Provide module evidence, surface evidence, and a structured handoff scoped to the assigned goal/task. Never edit, weaken, skip, or delete existing tests, fixtures, or verification commands to pass a gate without a reason recorded in the plan. After a defect fix, search for other implementations of the same rule or pattern and report them. Copy the Cairn CLI prefix line literally; never store it in a shell variable. Use the OS locale for user-visible responses and generated or updated documentation, plans, and memory artifacts.
MUST NOT DO: Ask the user. Skip LSP/typecheck/lint because a tool is missing without attempting installation. Refactor unrelated code. Continue an open-ended verification loop. Treat a side question as permission to abandon the active task. Delegate vague or unbounded work. Claim completion without evidence. Modify files outside the assigned ownership.
CONTEXT: docs/plan/<topic>.md task, relevant docs/memory notes, applied model guidance, exact files, verification commands, Cairn CLI prefix line.
```

## Reasoning Effort Routing

- Models always inherit the host/user default; never configure or override them.
- Light Path planning, implementation, and verification request `medium`.
- Heavy Path planning, review, and implementation request `high`; final verification and review request `xhigh`.
- Every module task records `Requested reasoning effort` and `Effective reasoning effort` in `docs/plan/<topic>.md`. Requested is Cairn's desired profile; Effective is what the dispatch result confirms.
- Pass requested effort only when dispatching a new task/worker and the host exposes a reasoning-effort option or host-native equivalent. Omit model overrides. Effective `inherited` means no task-level override was confirmed, not proof of missing host capability. Describe capability only from the exposed interface or dispatch response, distinguish Cairn non-integration from host non-support, and leave model/global config unchanged.
- On every route change, synchronize the plan artifact, repository goal task roadmap through `goal replan`, native UI plan, and reasoning effort profile before edits resume. Completed task profiles are preserved as audit history; incomplete task profiles are recalculated for the new path.
