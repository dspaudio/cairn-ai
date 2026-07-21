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

- Keep root `MEMORY.md` and `PLAN.md` as indexes only.
- Keep repository-specific judgment in `docs/memory/` and `docs/plan/`. Keep Cairn's model guidance in the installed plugin and reference it with `cairn://docs/model-guidance/...`.
- Preserve proper nouns, file names, variable names, service names, alert names, MCP tool names, and agent names exactly as written.
- Select Light Path or Heavy Path before implementation.
- Treat the user-called/main agent as the orchestrator: it plans, assigns, verifies, and records evidence.
- Delegate actual implementation edits to `worker` subagents whenever subagent tools are available, regardless of Light Path or Heavy Path.
- When the subagent tool provides a progress-reporting channel, require subagents to report status to the orchestrator when starting work, when deciding or confirming direction, during periodic progress, and when finishing; the orchestrator must immediately relay received status events to the user. If no mid-run reporting channel exists, the orchestrator relays observable events such as assignment, waiting, and final completion.
- When a delegated subagent finishes, require a final report before it leaves; after capturing the final report and evidence, the orchestrator closes or releases the completed subagent, then reviews the final report and evidence before marking the work complete.
- If subagent tools are unavailable, the main agent takes over implementation directly and records that takeover in evidence.
- Detect required LSP, typecheck, lint, dry-run, and verification tools before implementation.
- Missing required tools must be reported with a proposed install. Installation requires explicit user approval and a pinned/supported installer.
- Treat every implementation or continued-execution request as authorization to bind active work to a persisted Cairn goal and stable task IDs, even when the user does not mention a goal. After MEMORY.md, first write an initial plan that makes triage the active task. Before exploration or triage, synchronize its roadmap to Codex `update_plan` and `create_goal` when available and to the repository Cairn goal. Update both plans after triage, and implement only from the decision-complete revision. Exclude consultation, explanation, and plan-only requests.
- Treat missing, failed, skipped, stale, or placeholder evidence as failure. Task evidence records must be bound to the current goal, task, and plan.
- Treat the repository Cairn state as the fail-closed transition authority. Advance the matching Codex UI plan step only after the evidence-gated repository task transition succeeds.
- Spend reasoning on a focused executable test contract before implementation: requirements, invariants, boundaries, and failure modes. Give implementation only that contract, failing evidence, file scope, and constraints; require the minimum passing change.
- Run verification through `goal verify -- ...`; treat tool exit codes and bounded machine summaries as authoritative. Compress success output and expand context only for failing tests and related code. The exact argv, output digest, and watched-workspace fingerprint make stale evidence fail closed.
- Use a verification ladder: focused contract tests, one full check after the final change, then package dry-run while the full check remains fresh. Inspect package lifecycle scripts first and run normal `npm pack --dry-run` by default. Content-producing or unknown lifecycle scripts must never use `--ignore-scripts`; only absent or proven content-neutral scripts may use it.
- Every implementation task must pass module acceptance verification and surface integration verification.
- Before mutating external state, run the closest available dry-run, check, plan, diff, validate, or equivalent command.
- Limit each task to two verification passes by default. After two failed passes, record the blocker or split it into sub-tasks instead of continuing a repeated loop.
- User-visible responses and generated or updated documentation, plans, and memory artifacts must follow the OS locale unless the user asks for another language.

## Delegation Defaults

- `explorer`: use for read-only codebase discovery, impact analysis, pattern searches, and read-only verification when available.
- `worker`: use for actual implementation edits or verification tasks with clear file ownership.
- Main session: orchestrate, immediately relay received subagent status events or observable subagent lifecycle events to the user, verify, and record evidence; keep only urgent non-implementation blocking work local when the next step depends immediately on the result, except that unavailable subagent tools make the main agent take over implementation directly.
