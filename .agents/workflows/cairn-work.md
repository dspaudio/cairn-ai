# cairn-work

Use the `cairn-work` skill.

Read the installed Cairn runtime locator at `{{CAIRN_RUNTIME_LOCATOR_JSON}}`. Resolve Cairn scripts and policy resources through that locator; only work artifacts and state belong to the target project.

Goal: execute the next incomplete module task in `PLAN.md` without bypassing the recorded complexity triage.

Confirm the provisional request checkpoint and post-exploration planning checkpoint, then record the code checkpoint after exact file/caller/test inspection immediately before the first edit. Before editing, evidence may change either route. Every change must synchronize the plan artifact, repository goal task roadmap through `goal replan`, and native UI plan, including reviews and required evidence. After editing begins, a new Heavy Path signal promotes Light Path to Heavy Path: stop further edits, mark affected evidence stale, synchronize all three roadmaps, and repeat the code checkpoint.

Models always inherit. Route reasoning effort per task: Light planning/implementation/verification=`medium`; Heavy planning/review/implementation=`high`; final verification/review=`xhigh`. Record requested/effective effort for every task. Only a new task/worker may receive requested effort through a supported host-native option; unsupported host/value means effective=`inherited` with no model/global config change. Route changes synchronize the plan artifact, repository goal task roadmap, native UI plan, and reasoning effort profile; preserve completed profiles and recalculate incomplete profiles.

Procedure:

1. Every agent reads project-root `MEMORY.md` when present and continues without repository memory when absent before selecting or executing a task.
2. Read `PLAN.md`, the detailed plan, and relevant memory notes.
3. Read the Codex or Claude model guidance recorded in the plan.
4. Select one small module task.
5. Confirm required tool readiness by invoking Node directly with the locator's absolute `entrypoints.cli`, `toolcheck`, and `--root` for the target repository. Follow the installed toolcheck policy before any explicitly approved installation attempt.
6. Confirm the complexity triage and selected Light/Heavy Path recorded in the plan. If missing, update the plan before mutating files.
7. Spend reasoning on a focused executable test contract before implementation: requirements, invariants, boundaries, and failure modes. Confirm the intended failure, then require only the minimum implementation that passes.
8. For Light Path, keep the user-called/main agent in the orchestrator role and delegate implementation edits to one bounded `worker` whenever subagent tools are available, then run focused verification.
9. For Heavy Path, follow the plan's staged implementation and review gates without role-mapping shortcuts.
10. Give implementation only the test contract, failing evidence, exact file ownership, and constraints. Delegate actual implementation edits to `worker` on both paths whenever subagent tools are available. When the subagent tool provides a progress-reporting channel, require subagents to report status to the orchestrator when starting work, when deciding or confirming direction, during periodic progress, and when finishing; immediately relay received status events to the user. If no mid-run reporting channel exists, relay observable events such as assignment, waiting, and final completion. Require delegated subagents to provide a final report before leaving; after capturing the final report and evidence, close or release the completed subagent, then review the final report and evidence before marking the work complete. When subagent tools are available, each agent may recursively delegate bounded sub-tasks to subagents. Tell every delegated agent and child subagent to read the project-root `MEMORY.md` before work, keep scope, and preserve others' edits. If subagent tools are unavailable, the main agent takes over implementation directly and records that takeover in evidence.
11. Treat tool exit codes and bounded machine summaries as authoritative. Keep success concise; expand context only around failing tests.
12. Run focused tests, then one final full repository check through `goal verify -- ...`. Verification defaults to 600,000 ms (10 minutes), is capped at 3,600,000 ms (1 hour), and records evidence only when the starting goal/task identity and pre/post watched fingerprint still match. Select a semantic boundary that proves the claim. Any relevant later mutation makes affected evidence stale.
13. Inspect package lifecycle scripts before package verification and run normal `npm pack --dry-run` by default. Content-producing or unknown lifecycle scripts must never use `--ignore-scripts`; only absent or proven content-neutral scripts may use it while the full-check evidence remains fresh.
14. Record tool readiness and verification evidence in `docs/plan/<topic>.md` and update `PLAN.md`.
15. If the user asks a side question, status question, or narrow clarification while this task is still active, answer it briefly and then resume the previous active work unless the user explicitly asks to pause, stop, or switch tasks.
16. Use the OS locale for user-visible responses and generated or updated documentation, plans, and memory artifacts unless the user asks for another language.
