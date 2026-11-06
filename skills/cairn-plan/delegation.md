# Cairn Plan: Delegation and Reasoning Effort

Reference for `cairn-plan`. Read before dispatching `explorer` or `worker` agents or recording reasoning effort. Quick Path work done directly by the main agent does not need this file.

## Subagent Lifecycle

- Treat the user-called/main agent as the orchestrator: it plans, assigns, verifies, and records evidence.
- Use `explorer` for independent read-only codebase discovery, impact analysis, pattern searches, and read-only verification that can run in parallel when the current tool list supports it.
- Use `worker` for actual implementation edits with clear file ownership whenever subagent tools are available, on both Light Path and Heavy Path.
- When the subagent tool provides a progress-reporting channel, require subagents to report status to the orchestrator when starting work, when deciding or confirming direction, during periodic progress, and when finishing; the orchestrator must immediately relay received status events to the user. If no mid-run reporting channel exists, relay observable events such as assignment, waiting, and final completion.
- Require delegated subagents to provide a final report before leaving; after capturing the final report and evidence, close or release the completed subagent, then review the final report and evidence before marking the work complete.
- When subagent tools are available, each agent may recursively delegate bounded sub-tasks to subagents, subject to the current surface's depth and concurrency limits.
- If subagent tools are unavailable, the main agent takes over implementation directly and records that takeover in evidence; do not stop solely because subagent tools are unavailable.
- Keep urgent non-implementation blocking work local when the next step depends immediately on the result.
- Tell every delegated agent and child subagent to read project-root `MEMORY.md` when present and continue when absent, keep scope, and tell workers they are not alone in the codebase and must not revert others' edits.
- Every plan must require these status, final-report, close-and-review, and recursive-delegation rules.

## Task Graph

- Every task in `goal start --tasks` / `goal replan --tasks` JSON declares `dependsOn` (task ids) and `writeScope` (literal repo-relative paths; no globs, `..`, or absolute paths). Example: `{"id":"api","title":"API","dependsOn":["triage-plan"],"writeScope":["src/api"]}`.
- Omitted `dependsOn` means the previous task in list order (first task: none); explicit `[]` means no dependency, so sequential plans keep working. In `goal replan` the default chains across completed and new tasks, and `dependsOn` may reference completed tasks. Duplicate ids, unknown ids, self references, and cycles are rejected.
- Omitted `writeScope` is null: that task can only be active alone. Give independent tasks disjoint scopes so they can run in parallel; scope is declarative, not filesystem-enforced.
- Cairn has no messaging channel: name the handoff files that carry data between tasks in the plan (`Handoff files:`) and include them in the producer's `writeScope`.

## Delegation Prompt Format

```text
TASK: Produce <role> input needed for the <topic> plan.
EXPECTED OUTCOME: Return concrete decisions, file paths, dependencies, risks, and evidence requirements.
REQUIRED TOOLS: Read-only repository exploration, tool readiness checks, LSP/symbol tools, local command checks.
MUST DO: Read the project-root `MEMORY.md` before doing assigned work. Preserve proper nouns exactly. Prefer repository evidence. Report missing tools and obtain explicit user approval before any installation. Identify assumptions. Follow the subagent lifecycle rules (status reporting when a channel exists, final report before leaving, recursive delegation only for bounded sub-tasks). Tell workers they are not alone in the codebase and must not revert others' edits. Use the OS locale for user-visible responses and generated or updated documentation, plans, and memory artifacts.
MUST NOT DO: Edit production code. Ask the user. Expand scope. Delegate vague or unbounded work.
CONTEXT: User request, MEMORY.md, relevant docs/memory notes, applied model guidance, repository root, Cairn CLI prefix line from the session-start hook.
```

## Reasoning Effort Routing

- Models always inherit the host/user default; never configure or override them.
- Light Path planning, implementation, and verification request `medium`.
- Heavy Path planning, review, and implementation request `high`; final verification and review request `xhigh`.
- Every module task records `Requested reasoning effort` and `Effective reasoning effort` in `docs/plan/<topic>.md`. Requested is Cairn's desired profile; Effective is what the dispatch result confirms.
- Pass requested effort only when dispatching a new task/worker and the host exposes a reasoning-effort option or host-native equivalent. Omit model overrides. Effective `inherited` means no task-level override was confirmed, not proof of missing host capability. Describe capability only from the exposed interface or dispatch response, distinguish Cairn non-integration from host non-support, and leave model/global config unchanged.
- On every route change, synchronize the plan artifact, repository goal task roadmap through `goal replan`, native UI plan, and reasoning effort profile before mutation. Completed task profiles are preserved as audit history; incomplete task profiles are recalculated for the new path.
