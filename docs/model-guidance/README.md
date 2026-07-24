# Model Guidance

Cairn only applies model-specific adjustment to Claude-family and Codex-family models.

The goal is not to make prompts long by model. The goal is to stabilize the same `MEMORY.md`/`PLAN.md` flow according to model strengths.

## Application Order

1. Identify the active model name. If the model name is not directly exposed, infer it from the user's default model setting and agent role frontmatter.
2. Resolve this installed guidance root from the active skill's `references/cairn-runtime.json` or the source skill's location. Never look for Cairn model guidance in the target repository.
3. For Claude-family models, apply `cairn://docs/model-guidance/claude.md`.
4. For Codex-family models, apply `cairn://docs/model-guidance/codex.md`.
5. If the model is not clearly classified, apply only the common rules and skip model-specific adjustment.

## Common Rules

- On every fresh entry, compaction recovery, restart, delegation, or handoff, restore context in this order: optional root `MEMORY.md` → current phase skill → active plan → current-task references → model guidance recorded by the plan. If `MEMORY.md` is absent, continue without repository memory and do not invoke another memory service. If persisted state or an assignment requires another reference that is missing, unreadable, or inconsistent, fail closed: do not edit, delegate, approve, or complete; report or record a blocker.
- Keep root `MEMORY.md` and `PLAN.md` as indexes only.
- Keep repository-specific judgment in `docs/memory/` and `docs/plan/`. Keep Cairn's model guidance in the installed plugin and reference it with `cairn://docs/model-guidance/...`.
- Treat the user-home `.cairn/projects/<project-id>/worktrees/<worktree-id>/state.json` as a worktree-bound active-work slot. State without `worktreeId` and state copied into another worktree are stale and are removed on the next hook/goal start. Successful completion or cancellation removes the owning copy after plan evidence is recorded; only paused or blocked work remains for resumption.
- Preserve proper nouns, file names, variable names, service names, alert names, MCP tool names, and agent names exactly as written.
- Select Light Path or Heavy Path before implementation.
- Treat complexity as three checkpoints: a provisional request checkpoint, a post-exploration planning checkpoint, and a code checkpoint after exact file/caller/test inspection immediately before the first edit. Before editing, evidence may change either route. Every change must synchronize the plan artifact, repository goal task roadmap through `goal replan`, and native UI plan, including reviews and required evidence. After editing begins, a new Heavy signal promotes Light Path to Heavy Path: stop further edits, mark affected evidence stale, synchronize all three roadmaps, and repeat the code checkpoint.
- Treat the user-called/main agent as the orchestrator: it plans, assigns, verifies, and records evidence.
- Delegate actual implementation edits to `worker` subagents whenever subagent tools are available, regardless of Light Path or Heavy Path.
- When the subagent tool provides a progress-reporting channel, require subagents to report status to the orchestrator when starting work, when deciding or confirming direction, during periodic progress, and when finishing; the orchestrator must immediately relay received status events to the user. If no mid-run reporting channel exists, the orchestrator relays observable events such as assignment, waiting, and final completion.
- When a delegated subagent finishes, require a final report before it leaves; after capturing the final report and evidence, the orchestrator closes or releases the completed subagent, then reviews the final report and evidence before marking the work complete.
- If subagent tools are unavailable, the main agent takes over implementation directly and records that takeover in evidence.
- Detect required LSP, typecheck, lint, dry-run, and verification tools before implementation.
- Missing required tools must be reported with a proposed install. Installation requires explicit user approval and a pinned/supported installer.
- Treat non-trivial implementation or continuation of planned work as authorization to bind active work to a persisted Cairn goal and stable task IDs, even when the user does not mention a goal. Routine known-target Git/GitHub operations (status, fetch, checkout, branch, merge, push, PR management) stay plan/goal-free unless they require code edits, conflict resolution, destructive recovery, release/deploy, or design. For planned work, after MEMORY.md, first write an initial plan that makes triage the active task, synchronize it before exploration, and implement only from the decision-complete revision. Exclude consultation, explanation, and plan-only requests.
- Treat missing, failed, skipped, stale, or placeholder evidence as failure. Task evidence records must be bound to the current goal, task, and plan.
- Treat the repository Cairn state as the fail-closed transition authority. Advance the matching Codex UI plan step only after the evidence-gated repository task transition succeeds.
- Spend reasoning on a focused executable test contract before implementation: requirements, invariants, boundaries, and failure modes. Give implementation only that contract, failing evidence, file scope, and constraints; require the minimum passing change.
- Run verification through `goal verify -- ...`; its default timeout is 600,000 ms and its maximum is 3,600,000 ms. Treat tool exit codes and bounded machine summaries as authoritative. Record evidence only when the starting goal/task identity and pre/post watched fingerprint still match, and choose the watch set and command at the semantic boundary that proves the claim. Compress success output and expand context only for failing tests and related code.
- Use a verification ladder: focused contract tests, one full check after the final change, then package dry-run while the full check remains fresh. Inspect package lifecycle scripts first and run normal `npm pack --dry-run` by default. Content-producing or unknown lifecycle scripts must never use `--ignore-scripts`; only absent or proven content-neutral scripts may use it.
- Every implementation task must pass module acceptance verification and surface integration verification.
- Before mutating external state, run the closest available dry-run, check, plan, diff, validate, or equivalent command.
- Limit each task to two verification passes by default. After two failed passes, record the blocker or split it into sub-tasks instead of continuing a repeated loop.
- User-visible responses and generated or updated documentation, plans, and memory artifacts must follow the OS locale unless the user asks for another language.

## Prompt Cache Shape

- Keep `.codex-plugin/plugin.json` `defaultPrompt` as a small, stable policy and recovery kernel. Put detailed bootstrap, delegation, test, package, and verification procedures in the phase skills and this installed guidance.
- Put static instructions before dynamic goal data. Hook capsules must be deterministic for the same locale, event, and persisted state; prompt text and turn IDs must not change their content.
- Idle capsules reference root `MEMORY.md` and `cairn-plan`; active-work capsules reference the active plan, current task, and `cairn-work`; all-tasks-complete capsules reference `cairn-review`.
- A foreign session receives only a generic ownership-conflict capsule on session/prompt events. It must not expose goal, plan, or task details, and it must not make stop hooks block work owned by another session.
- Character budgets are regression proxies for cache-friendly prompt shape, not measurements of provider cache hits or cost. Cairn does not require provider cache keys, breakpoints, or live API telemetry.
- Do not add read receipts that claim model attention. Restore references on every re-entry and use readable state plus fresh bound evidence as the enforceable contract.

## Reasoning Effort Routing

- Models always inherit the host or user default; Cairn never selects or overrides a model.
- Light Path planning, implementation, and verification request `medium`.
- Heavy Path planning, review, and implementation request `high`; final verification and review request `xhigh`.
- Every plan task records `Requested reasoning effort` and `Effective reasoning effort`.
- Only a newly dispatched task or worker may receive the requested value, and only through a host-exposed reasoning-effort option or host-native equivalent. Omit every model override.
- For an unsupported host or value, record `Effective reasoning effort: inherited` with the reason. Do not change the model or global config and do not silently choose a nearby value.
- A route change synchronizes the plan artifact, repository goal task roadmap through `goal replan`, native UI plan, and reasoning effort profile before edits resume. Preserve completed task profiles as audit history and recalculate incomplete task profiles for the new path.

## Delegation Defaults

- `explorer`: use for read-only codebase discovery, impact analysis, pattern searches, and read-only verification when available.
- `worker`: use for actual implementation edits or verification tasks with clear file ownership.
- Main session: orchestrate, immediately relay received subagent status events or observable subagent lifecycle events to the user, verify, and record evidence; keep only urgent non-implementation blocking work local when the next step depends immediately on the result, except that unavailable subagent tools make the main agent take over implementation directly.
