---
name: cairn-plan
description: Use before non-trivial implementation, refactoring, migrations, debugging, repository automation, or any request that asks to plan, design, implement carefully, triage complexity, or coordinate agents. Creates decision-complete PLAN.md and docs/plan plans through repository evidence and bounded delegation instead of user questions.
---

# Cairn Plan

Use this before non-trivial implementation, refactoring, migrations, debugging, or repository automation. Also use it when the user asks for planning, design, "설계부터", "신중하게", "꼼꼼히", complexity triage, or coordinated agent work.

## Purpose

Plans must reduce execution tokens. Do not leave long plans only in chat. Store the topic in `PLAN.md` and details in `docs/plan/<topic>.md`.

Every planning run starts by reading the project-root `MEMORY.md`. Treat it as the repository policy and domain-knowledge index before exploring or delegating work. Every delegated agent must also read the project-root `MEMORY.md` before doing its assigned task.

Do not treat planning as optional for implementation work that is more than a narrow single-file fix. If the current request can change behavior, architecture, data, external state, or multiple files, produce or update a plan artifact before mutation.

Plan from the whole work down. First understand the full requested outcome and affected surfaces, then classify the work into small executable tasks. If one task is still too broad to verify cleanly, split that task into sub-tasks.

## Re-entry and Required References

At the start and after compaction, restart, or handoff, restore context in this order: root `MEMORY.md` → `cairn-plan` → the active plan → current-task references → model guidance recorded by the plan. A new implementation request with no persisted goal may create its initial plan through the procedure below. If persisted state names a plan or task and that reference is missing, unreadable, or inconsistent, do not explore, edit, delegate, or complete work; report or record a blocker first. Do not add a read-receipt field that claims the model read a file: filesystem/state consistency and bound tool evidence remain the fail-closed authority.

## Runtime Location

Resolve Cairn's read-only runtime from `references/cairn-runtime.json` next to this `SKILL.md`. Its `pluginRoot` contains Cairn's `scripts/`, `templates/`, commands, agents, and model guidance. In a source checkout where the locator does not exist, resolve the plugin root from this `SKILL.md` location (`../..`). Never search the target repository for Cairn scripts, templates, or model guidance, and never derive the plugin root from the current working directory.

Use logical resource IDs such as `cairn://templates/work-plan.md` and `cairn://docs/model-guidance/codex.md` in repository plans. Resolve those IDs through `pluginRoot` only while executing. Keep `repoRoot` separate and pass it explicitly as `--root <repoRoot>`.

For an implementation or continued-execution request, treat the request itself as authorization to create an initial two-phase plan and activate its roadmap, even when the user does not mention a goal. The initial plan is decision-complete for the `triage-plan` task but is not implementation-ready. After writing it and its `PLAN.md` index entry, synchronize the same ordered steps to Codex UI tools when available (`update_plan` first, then `create_goal`) and start the repository goal before exploration, toolcheck, complexity triage, or a non-blocking user question:

```sh
node "<pluginRoot>/scripts/cairn.mjs" goal start --root "<repoRoot>" --goal "<objective>" --plan "docs/plan/<topic>.md" --tasks '[{"id":"triage-plan","title":"Run planned triage and finalize the plan","requiredEvidence":["planArtifact","triageDecision"]},{"id":"implement","title":"Implement the finalized plan"},{"id":"verify","title":"Verify and review the result"}]' --criteria "<completion criterion>" --session "<current session_id>"
```

Use the current Codex hook `session_id` when it is available. If the surface does not expose a stable session ID, omit `--session` and record that the goal is repository-scoped. If Codex UI plan/goal tools are unavailable, record that limitation and continue with the repository plan and goal; never claim UI synchronization that did not occur.

## Procedure

1. Run `node "<pluginRoot>/scripts/cairn.mjs" init --root "<repoRoot>"` through the resolved runtime. If the runtime is unavailable, ensure `MEMORY.md`, `PLAN.md`, `docs/memory`, and `docs/plan` directly and report that `cairn doctor` or `cairn upgrade` is required.
2. Read the project-root `MEMORY.md` before repository exploration, tool selection, or delegation.
3. Classify the request as implementation/continued execution versus consultation/explanation/plan-only. For implementation/continued execution, immediately create an initial `docs/plan/<topic>.md` from `cairn://templates/work-plan.md` and add its `PLAN.md` index entry. Based only on the request and `MEMORY.md`, describe the observable outcome, anticipated affected surfaces, and stable top-level roadmap. Make `triage-plan` the first active task and specify its memory inputs, investigation scope, toolcheck, Heavy Path criteria, and exact condition for updating the plan. Mark the plan `initial: decision-complete for triage; not implementation-ready`.
4. Before reading detailed memory, toolcheck, repository exploration, complexity triage, delegation, or any non-blocking user question, synchronize the initial roadmap:
   - Call Codex `update_plan` first when available so the UI displays the ordered tasks with `triage-plan` in progress.
   - Call Codex `create_goal` next when available so the UI displays the active objective. The implementation request plus this developer-level skill instruction is authorization; do not use it for consultation, explanation, or plan-only requests.
   - Start or attach the repository Cairn goal with the same objective, plan ID, stable task IDs, and current session ID.
   - If a UI tool is unavailable, record the limitation in the plan and continue with repository state.
5. Execute the planned `triage-plan` task: read only the relevant `docs/memory/*.md`, read applicable installed model guidance, run toolcheck, and explore the repository with focused search and LSP/symbol tools.
6. Treat tool installation as a separate external-state change. Do not install during planning without explicit user approval. After approval, use `toolcheck --install --yes --root "<repoRoot>"` only for pinned/supported installers, or the approved repository-native command. Otherwise record the missing tool and proposed command as a blocker.
7. Summarize the whole work and affected surfaces, classify it into small executable tasks/sub-tasks, identify dry-run/check modes, and run complexity triage before applying workflow guidance from agents, plugins, or delegated roles.
8. Update the same repository plan with the selected route, all checked Heavy Path signals, concrete file scope, tool readiness, delegation, verification commands, and fail-closed evidence. Mark it `decision-complete for implementation`, then call Codex `update_plan` again so the UI matches the finalized roadmap.
   - Spend planning tokens on executable test design: requirements, invariants, boundaries, failure modes, expected initial failure, and authoritative tool result.
   - Give implementation a bounded test contract and exact file scope; require the minimum passing change rather than renewed broad discovery.
   - Plan focused tests first, one final full check, and a package dry-run when no change occurred after the full check. Require lifecycle inspection, normal script execution for content-producing or unknown scripts, and `--ignore-scripts` only for absent or proven content-neutral scripts. Mark evidence stale after relevant mutation.
9. Only after step 8, record bound `planArtifact` and `triageDecision` evidence records, complete the `triage-plan` task, and advance to implementation.
10. Delegate according to the selected path and model guidance instead of asking the user.
   - Use `explorer` for independent read-only codebase discovery, impact analysis, pattern searches, and read-only verification that can run in parallel when the current tool list supports it.
   - Treat the user-called/main agent as the orchestrator: it plans, assigns, verifies, and records evidence.
   - Use `worker` for actual implementation edits with clear file ownership whenever subagent tools are available, on both Light Path and Heavy Path.
   - When the subagent tool provides a progress-reporting channel, require subagents to report status to the orchestrator when starting work, when deciding or confirming direction, during periodic progress, and when finishing; the orchestrator must immediately relay received status events to the user. If no mid-run reporting channel exists, relay observable events such as assignment, waiting, and final completion.
   - Require delegated subagents to provide a final report before leaving; after capturing the final report and evidence, close or release the completed subagent, then review the final report and evidence before marking the work complete.
   - When subagent tools are available, each agent may recursively delegate bounded sub-tasks to subagents, subject to the current surface's depth and concurrency limits.
   - If subagent tools are unavailable, the main agent takes over implementation directly and records that takeover in evidence; do not stop before local implementation solely because subagent tools are unavailable.
   - Keep urgent non-implementation blocking work local when the next step depends immediately on the result.
   - Tell every delegated agent and child subagent to read the project-root `MEMORY.md` before work, keep scope, and tell workers they are not alone in the codebase and must not revert others' edits.
11. Give every plan and ordered task step a stable ID and declare task-level and goal-level required evidence. The task order must be sufficient for both Codex UI and hook context to show the roadmap and restore the current task after side questions.
12. Advance a Codex UI step only after the matching repository Cairn task transition succeeds with all required bound evidence records. The repository state is the fail-closed transition authority; UI state is its synchronized projection.
13. Write user-visible responses and generated or updated documentation, plans, and memory artifacts in the OS locale unless the user asks for another language.

## Reasoning Effort Routing

- Models always inherit the host/user default; never configure or override them.
- Light Path planning, implementation, and verification request `medium`.
- Heavy Path planning, review, and implementation request `high`; final verification and review request `xhigh`.
- Every module task records `Requested reasoning effort` and `Effective reasoning effort` in `docs/plan/<topic>.md`.
- Pass requested effort only when dispatching a new task/worker and the host exposes a reasoning-effort option or host-native equivalent. Omit model overrides. For an unsupported host or value, record effective reasoning effort `inherited` with the reason and leave model/global config unchanged.
- On every route change, synchronize the plan artifact, repository goal task roadmap through `goal replan`, native UI plan, and reasoning effort profile before mutation. Completed task profiles are preserved as audit history; incomplete task profiles are recalculated for the new path.

## Complexity Triage

Decide triage from repository evidence without asking the user.

Use three mandatory checkpoints and record each result, evidence, newly discovered Heavy Path signals, and current route in the plan artifact:

1. **Request checkpoint:** before exploration, make a provisional classification from the request and `MEMORY.md`; uncertainty stays explicit and this result is not implementation authority.
2. **Planning checkpoint:** after repository exploration, affected-surface analysis, and test design, re-evaluate the provisional route and finalize the implementation plan.
3. **Code checkpoint:** during `cairn-work`, inspect the exact files, callers, and tests, then record one final re-evaluation immediately before the first edit. A pending or missing code checkpoint blocks mutation.

Before the first edit, the planning or code checkpoint may change Light Path to Heavy Path or Heavy Path to Light Path when the evidence supports it. Every route change must rebuild and synchronize the plan artifact, repository goal task roadmap through `goal replan`, and native UI plan, including assignments, reviews, and required evidence; do not mutate until all three agree. After editing starts, only promote Light Path to Heavy Path: stop further edits, mark affected evidence stale, revise and synchronize all three roadmaps, run newly required Heavy Path review, and repeat the code checkpoint before resuming.

This decision takes priority over plugin, agent, or delegated workflow guidance unless higher-priority system or developer instructions say otherwise. The default is Light Path; use Heavy Path only when a Heavy Path condition clearly applies.

### Light Path

Use Light Path for narrow changes inside existing architecture layers. Skip planning/review agents when appropriate, but actual implementation edits still go to `worker` whenever subagent tools are available. Keep the verification gate.

Light Path conditions:

- The change stays inside existing architecture layers.
- No new domain model, service class, or abstraction is introduced.
- No security, authentication, authorization, session, external API, message queue, payment, DB schema, migration, concurrency, transaction-boundary, or cache-invalidation change is involved.

Light Path examples:

- One new API endpoint within existing layers.
- Add or modify a controller or service method.
- Strengthen validation rules.
- Adjust query logic.
- Change copy text or constants.
- Fix one clearly scoped bug.

Light Path flow: main-agent orchestration -> bounded `worker` implementation when subagent tools are available -> main-agent takeover when subagent tools are unavailable -> focused verification by the main agent or a scoped verification `worker` -> report. If there is no plan artifact, use the original user request and the diff as the verification baseline.

### Heavy Path

Use Heavy Path when the request clearly needs the full planning and review pipeline.

Heavy Path conditions:

- Creating a new directory, module, or architecture layer.
- Introducing a new domain model, service class, or abstraction.
- Changing security, authentication, authorization, or sessions.
- Integrating an external API, message queue, or payment flow.
- Changing DB schema or migrations.
- Changing concurrency, transaction boundaries, or cache invalidation.
- Refactoring across multiple domains.
- The user signals extra care, such as "신중하게", "검토 받고", "설계부터", or "꼼꼼히".

Heavy Path flow: plan -> pre-implementation review -> bounded `worker` implementation -> verification worker or read-only review.

### Route Record

`docs/plan/<topic>.md` must record:

- Selected path.
- Selection rationale.
- Heavy Path conditions found, if any.
- Heavy Path conditions checked and not found.
- Roles or delegation omitted in Light Path and why.
- Any unavailable subagent tool main-agent takeover and its evidence record.
- Pre-implementation decisions that review must resolve in Heavy Path.
- Request checkpoint, planning checkpoint, and code checkpoint status, evidence, newly found signals, and route.
- Every route change and the synchronized plan artifact, repository goal task roadmap, native UI plan, assignments, reviews, required evidence, and stale evidence invalidation.

## Planning Rules

- Every initial plan must be decision-complete for its triage task and explicitly not implementation-ready; the post-triage revision must be decision-complete for implementation.
- Every implementation or continued-execution plan must be shown through Codex `update_plan` and `create_goal` before triage when those tools are available, then synchronized again after triage. Repository plan/goal persistence remains required on every surface.
- Every plan must describe the whole work first, then classify it into executable tasks and any needed sub-tasks.
- Every plan must treat the user-called/main agent as the orchestrator and assign actual implementation edits to `worker` whenever subagent tools are available, regardless of Light Path or Heavy Path.
- Every plan must require subagents to report status when the subagent tool provides a progress-reporting channel. If no mid-run reporting channel exists, the orchestrator must relay observable events such as assignment, waiting, and final completion.
- Every plan must require delegated subagents to provide a final report before leaving, require the orchestrator to close or release completed subagents after capturing final report and evidence, and require the orchestrator to review the final report and evidence before marking work complete.
- Every plan must allow recursive subagent delegation for bounded sub-tasks when the current agent surface supports it.
- Every plan must include complexity triage and the selected path.
- Every plan must explicitly list Heavy Path signals checked, even when Light Path is selected.
- Every plan must include applied model guidance and rationale.
- Every plan must include tool readiness results: detected stack, required LSP/check tools, installed tools, and blockers.
- Every executable plan must include a stable goal ID, stable task IDs, explicit terminal states, and fail-closed required evidence. A missing evidence section never means success.
- Every implementation task must be small enough to verify with two checks.
- Heavy Path tasks must include an explicit automated test command and a `Tests:` evidence line; Heavy Path completion cannot rely on generic verification wording without test evidence.
- The default checks are module acceptance verification and surface integration verification.
- Every risky or external-state-changing task must include the closest available dry-run or check command before the write/apply command.
- Verification can expand for risk, but the reason must be recorded.
- The default loop budget is two verification passes per task. If a gate fails, diagnose once, shrink the task or split it into sub-tasks, and rerun both gates. After two failed passes, record the blocker in `docs/plan/<topic>.md` instead of continuing an open-ended loop.
- Ask the user only when agents, repository evidence, or local verification cannot answer the decision.
- User-visible responses and generated or updated documentation, plans, and memory artifacts must follow the OS locale unless the user asks for another language.

## Tool Readiness Policy

Do not silently skip LSP, typecheck, lint, dry-run, or verification because the tool is missing. Tool installation still requires explicit user approval.

- Detect the codebase stack from repository files before choosing tools.
- Prefer repository-local installation through the existing package manager and lockfile.
- Use ephemeral tool runners only when project-local installation is not appropriate.
- Run the tool after installation and record the command result.
- If installation was not approved or is impossible, record the proposed or attempted command, failure output summary when applicable, and blocker in `docs/plan/<topic>.md`.
- Treat "LSP server not installed" as an unresolved blocker until installation or an equivalent symbol-aware fallback has been attempted.

## Dry-Run Policy

Prefer repository-native dry-run and check modes before mutating external state.

- Migrations and database changes: `--pretend`, dry-run, schema diff, rollback feasibility check, or equivalent.
- Package and release work: inspect lifecycle scripts first, then use normal `npm pack --dry-run`, publish dry-run, build check, or equivalent. Never skip content-producing or unknown lifecycle scripts with `--ignore-scripts`; it is allowed only for absent or proven content-neutral scripts while prior full-check evidence remains fresh.
- Infrastructure and deployment: plan, diff, validate, check, or equivalent.
- Code generation and formatting: check mode before write mode when available.
- If no dry-run mode exists, record that fact and select the smallest reversible command or test artifact available.

## Delegation Prompt Format

```text
TASK: Produce <role> input needed for the <topic> plan.
EXPECTED OUTCOME: Return concrete decisions, file paths, dependencies, risks, and evidence requirements.
REQUIRED TOOLS: Read-only repository exploration, tool readiness checks, LSP/symbol tools, local command checks.
MUST DO: Read the project-root `MEMORY.md` before doing assigned work. Preserve proper nouns exactly. Prefer repository evidence. Report missing tools and obtain explicit user approval before any installation. Identify assumptions. Treat the user-called/main agent as the orchestrator. Use `explorer` for read-only discovery and `worker` for actual implementation edits or verification when subagent tools are available, regardless of Light Path or Heavy Path. When the subagent tool provides a progress-reporting channel, require subagents to report status to the orchestrator when starting work, when deciding or confirming direction, during periodic progress, and when finishing; the orchestrator must immediately relay received status events to the user. If no mid-run reporting channel exists, relay observable events such as assignment, waiting, and final completion. Require delegated subagents to provide a final report before leaving; after capturing the final report and evidence, close or release the completed subagent, then review the final report and evidence before marking the work complete. If subagent tools are unavailable, the main agent takes over implementation directly and records that takeover in evidence. When subagent tools are available, allow recursive delegation of bounded sub-tasks. Tell every delegated agent and child subagent to read the project-root `MEMORY.md` before work. Tell workers they are not alone in the codebase and must not revert others' edits. Use the OS locale for user-visible responses and generated or updated documentation, plans, and memory artifacts.
MUST NOT DO: Edit production code. Ask the user. Expand scope. Delegate vague or unbounded work.
CONTEXT: User request, MEMORY.md, relevant docs/memory notes, applied model guidance, repository root.
```

## Completion Criteria

- `PLAN.md` references the plan topic.
- `docs/plan/<topic>.md` includes goal, memory inputs, model guidance, tool readiness, complexity triage, selected path, agent assignments, module tasks, and two checks per task.
- The next implementation task can run without making planning decisions.
