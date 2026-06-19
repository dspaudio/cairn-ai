# Codex Model Guidance

Codex-family models are strong at small implementation tasks, explicit tool use, and repeatable verification. In Cairn, prefer them for bounded `worker` tasks and structurally clear planning. When Codex is the user-called/main agent, it orchestrates instead of making implementation edits directly whenever subagent tools are available.

## Use Strengths

- Quickly handle implementation tasks with clear file scope.
- As `worker`, make actual implementation edits within the assigned file scope.
- As the user-called/main agent, delegate implementation edits to `worker` whenever subagent tools are available.
- As a subagent, report status to the orchestrator when the current subagent tool provides a progress-reporting channel, including when starting work, when deciding or confirming direction, during periodic progress, and when finishing.
- As a subagent, provide a final report before leaving when assigned work is complete.
- Read existing patterns and make minimal changes in the same style.
- Run repository tool readiness checks and bootstrap missing command-line tools.
- Capture module acceptance verification and surface integration verification from command results.
- Run dry-run, check, plan, diff, validate, or equivalent commands before mutating external state.
- Explore independent work in parallel and sequence only dependent work.

## Adjustment Rules

- Do not start implementation without a plan.
- Do not stop before local implementation solely because subagent tools are unavailable; the main agent takes over implementation directly and records that takeover in evidence.
- Keep work units small. Split large changes into smaller plan tasks.
- If `apply_patch` is unstable in the environment, use an editing tool or a clear file update path.
- Do not duplicate the same exploration. Wait for already delegated searches.
- Do not trust success-looking output alone. Confirm real files, commands, and surface evidence.
- Do not skip LSP, typecheck, lint, dry-run, or verification because a tool is missing. Try repository-local installation or record the failed install attempt as a blocker.
- Do not continue an open-ended verification loop. Use at most two verification passes per task unless the plan records a risk-based exception.
- Write user-visible responses and generated or updated documentation, plans, and memory artifacts in the OS locale unless the user asks for another language.

## Path Guidance

### Planning

- On Light Path, write explicit task contracts when a plan artifact exists.
- Record detected stack, required tools, install commands, and tool blockers.
- Specify file scope and verification commands so implementation does not need to rediscover them.
- Specify the dry-run or check command for tasks that can mutate external state, or record why none exists.
- On failure, prefer sub-task splitting over a repeated loop.

### Implementation

- If acting as the user-called/main agent, orchestrate the work and delegate actual implementation edits to `worker` whenever subagent tools are available, regardless of Light Path or Heavy Path.
- If acting as the user-called/main agent, immediately relay received subagent status events to the user. If no mid-run reporting channel exists, relay observable events such as assignment, waiting, and final completion.
- If acting as the user-called/main agent, close or release completed subagents after capturing their final report and evidence, then review the final report and evidence before marking the work complete.
- If acting as `worker`, edit only within the file scope listed in the plan.
- Confirm required tools are available. Install or bootstrap missing required tools before implementation.
- Run the recorded dry-run or check command before external-state mutation when applicable.
- After changes, run both module acceptance verification and surface integration verification.
- If a gate fails, diagnose once, shrink the task or split it into sub-tasks, and rerun both gates. Stop after the second failed pass and record the blocker.
- Return evidence in a form that can be recorded in `docs/plan/<topic>.md`.

### Delegation

- Handle search, file listing, command checks, and QA artifact capture.
- Use `explorer` for independent read-only discovery or read-only verification when available.
- When using `worker`, state clear file ownership and tell the worker not to revert others' edits.
- Tell subagents to report status when the tool provides a progress-reporting channel: starting work, deciding or confirming direction, periodic progress, and finishing.
- Tell subagents to provide a final report before leaving, then close or release them after evidence is captured. Review the final report and evidence before marking the work complete.
- If subagent tools are unavailable, the main agent takes over implementation directly and records that takeover in evidence.
