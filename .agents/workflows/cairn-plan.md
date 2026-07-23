# cairn-plan

Use the `cairn-plan` skill.

Read the installed Cairn runtime locator at `{{CAIRN_RUNTIME_LOCATOR_JSON}}`. Resolve Cairn scripts, model guidance, templates, commands, and agents through that locator; only repository state such as `MEMORY.md`, `PLAN.md`, and `docs/plan/` belongs to the target project.

Goal: write an initial plan with triage as its active task before exploration, persist the goal/roadmap, then update the same plan to a decision-complete implementation revision after triage.

Complexity triage has a provisional request checkpoint, post-exploration planning checkpoint, and code checkpoint after exact file/caller/test inspection immediately before the first edit. Before editing, evidence may change either route. Every change must synchronize the plan artifact, repository goal task roadmap through `goal replan`, and native UI plan, including reviews and required evidence. After editing begins, a new Heavy Path signal promotes Light Path to Heavy Path: stop further edits, mark affected evidence stale, synchronize all three roadmaps, and repeat the code checkpoint.

Models always inherit. Route reasoning effort per task: Light planning/implementation/verification=`medium`; Heavy planning/review/implementation=`high`; final verification/review=`xhigh`. Record requested/effective effort for every task. Only a new task/worker may receive requested effort through a supported host-native option; unsupported host/value means effective=`inherited` with no model/global config change. Route changes synchronize the plan artifact, repository goal task roadmap, native UI plan, and reasoning effort profile; preserve completed profiles and recalculate incomplete profiles.

Procedure:

1. Every agent must read the project-root `MEMORY.md` for domain knowledge and repository policy before repository exploration, tool selection, work, or delegation.
2. For implementation or continued execution, write the initial repository plan and `PLAN.md` entry from the request and `MEMORY.md`. Include a planned `triage-plan` task and anticipated execution/verification stages, then start or attach the repository Cairn goal before exploration.
3. When the surface exposes native plan/goal UI tools, synchronize the same roadmap there before exploration; otherwise record that those tools are unavailable.
4. Read relevant `docs/memory/*.md` and perform toolcheck, exploration, and Light/Heavy Path triage according to the initial task.
5. Update the same plan to a decision-complete implementation revision before implementation.
6. If the active or assigned model is Claude-family, read `claude.md` under the locator's `resources.modelGuidance`; if Codex-family, read `codex.md` there.
7. Invoke Node directly with the locator's absolute `entrypoints.cli`, `toolcheck`, and `--root` for the target repository.
8. If required LSP/check tools are missing, follow the installed toolcheck policy before any explicitly approved installation attempt.
9. Use Light Path by default unless a Heavy Path condition clearly applies.
10. Use `explorer` for independent read-only discovery, impact analysis, pattern search, and read-only verification when available.
11. Treat the user-called/main agent as the orchestrator: it plans, assigns, verifies, relays received subagent status events or observable lifecycle events to the user, and records evidence. Use `worker` for actual implementation edits with clear file ownership whenever subagent tools are available, on both Light Path and Heavy Path. When the subagent tool provides a progress-reporting channel, require subagents to report status when starting work, when deciding or confirming direction, during periodic progress, and when finishing; immediately relay received status events to the user. If no mid-run reporting channel exists, relay observable events such as assignment, waiting, and final completion. Require delegated subagents to provide a final report before leaving; after capturing the final report and evidence, close or release the completed subagent, then review the final report and evidence before marking the work complete. When subagent tools are available, each agent may recursively delegate bounded sub-tasks to subagents. Tell every delegated agent and child subagent to read the project-root `MEMORY.md` before work, keep scope, and preserve others' edits. If subagent tools are unavailable, the main agent takes over implementation directly and records that takeover in evidence.
12. Record selected path, checked Heavy Path signals, tool readiness, module acceptance verification, and surface integration verification on every implementation task in the existing plan.
13. Advance native UI steps only after the matching repository task transition succeeds with its required bound evidence records.
14. Keep the existing `PLAN.md` entry and repository goal synchronized with the finalized plan status.
15. Use the OS locale for user-visible responses and generated or updated documentation, plans, and memory artifacts unless the user asks for another language.
