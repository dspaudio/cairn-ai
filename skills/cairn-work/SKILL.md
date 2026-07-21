---
name: cairn-work
description: Use after cairn-plan to execute the next incomplete docs/plan module task with the recorded Light/Heavy Path route, bounded worker delegation, dry-run/check evidence, and two verification gates.
---

# Cairn Work

Use this to implement a plan created by `cairn-plan`. Do not use this as a shortcut around planning; if no plan exists for non-trivial implementation, run `cairn-plan` first.

## Purpose

Execute only one module task at a time, but keep advancing the active goal after each task passes until every task and the goal-level final review are complete. Instead of a repeated red-green loop, prove each small task with two strong verification gates.

Every work run starts by reading the project-root `MEMORY.md` before choosing or executing a task. Every delegated agent must also read the project-root `MEMORY.md` before doing its assigned task.

The user-called/main agent is the orchestrator for work execution: it selects the task, assigns implementation, verifies results, and records evidence. Actual implementation edits belong to `worker` subagents whenever subagent tools are available, regardless of Light Path or Heavy Path.

When the subagent tool provides a progress-reporting channel, subagents report status to the orchestrator when starting work, when deciding or confirming direction, during periodic progress, and when finishing. The orchestrator must immediately relay received status events to the user. If no mid-run reporting channel exists, the orchestrator relays observable events such as assignment, waiting, and final completion.

Delegated subagents must provide a final report before leaving. After the orchestrator captures the final report and evidence, it must close or release the completed subagent, then review the final report and evidence before marking the work complete.

If the user asks a side question, status question, or narrow clarification while the selected task is still active, use the active goal's ordered task roadmap to preserve position, answer briefly, and then resume the current task unless the user explicitly asks to pause, stop, or switch tasks.

When subagent tools are available, each agent may recursively delegate bounded sub-tasks to subagents. Every child subagent must read the project-root `MEMORY.md`, keep the assigned scope, and preserve others' edits.

## Runtime Location

Resolve Cairn's read-only runtime from `references/cairn-runtime.json` next to this `SKILL.md`. Its `pluginRoot` contains Cairn's scripts and model guidance. In a source checkout where the locator does not exist, resolve the plugin root from this `SKILL.md` location (`../..`). Never search the target repository for Cairn runtime files or derive the plugin root from the current working directory. Resolve `cairn://...` plan resources through this runtime and pass the target repository separately with `--root <repoRoot>`.

Use the installed CLI for durable state. Important forms are:

```sh
node "<pluginRoot>/scripts/cairn.mjs" goal status --root "<repoRoot>"
node "<pluginRoot>/scripts/cairn.mjs" goal assign --root "<repoRoot>" --task "<task-id>" --agent "<agent-id>"
node "<pluginRoot>/scripts/cairn.mjs" goal receipt --root "<repoRoot>" --task "<task-id>" --kind moduleAcceptance --command "<verification command>" --exit 0
node "<pluginRoot>/scripts/cairn.mjs" goal receipt --root "<repoRoot>" --task "<task-id>" --kind surfaceIntegration --command "<verification command or QA artifact>" --exit 0
node "<pluginRoot>/scripts/cairn.mjs" goal task --root "<repoRoot>" --task "<task-id>" --status completed
node "<pluginRoot>/scripts/cairn.mjs" goal receipt --root "<repoRoot>" --scope goal --kind finalReview --command "<review command>" --exit 0
node "<pluginRoot>/scripts/cairn.mjs" goal complete --root "<repoRoot>"
```

Use `goal pause`, `goal block --reason "<concrete blocker>"`, or `goal cancel` when that is the truthful state. A task can be blocked with `goal task --task "<task-id>" --status blocked --reason "<concrete blocker>"`.

## Procedure

1. Read the project-root `MEMORY.md` first.
2. Read `PLAN.md`, the selected `docs/plan/<topic>.md`, and relevant memory notes.
3. Read the `cairn://docs/model-guidance/*.md` inputs recorded in the plan through the installed runtime.
4. Read `.cairn/state.json` through `cairn goal status --root "<repoRoot>"`. Select only the active goal's current task. If implementation was requested but no goal exists, create one from the decision-complete plan before editing.
5. Confirm that required LSP, typecheck, lint, dry-run, and verification tools are available from the plan's tool readiness section.
6. If a required tool is missing, do not install it implicitly. Obtain explicit user approval, then run the installed runtime's `toolcheck --install --yes --root "<repoRoot>"` only for pinned/supported installers or run the approved repository-native command. Otherwise record a blocker.
7. Confirm the selected Light Path or Heavy Path in the plan. If the plan lacks complexity triage, stop and update the plan before mutating files.
8. For Light Path, keep the main agent in the orchestrator role and delegate implementation edits to one bounded `worker` whenever subagent tools are available; keep the verification gate.
9. For Heavy Path, follow the full planning and review pipeline recorded in the plan. Run pre-implementation review before mutation and read-only review after evidence exists.
10. Delegate implementation to `worker` with exact files, ownership, constraints, and model-specific adjustment rules on both Light Path and Heavy Path whenever subagent tools are available. Tell every delegated agent and child subagent to read the project-root `MEMORY.md` before work, keep scope, preserve others' edits, and report status when the subagent tool provides a progress-reporting channel. Immediately relay received status events to the user. If no mid-run reporting channel exists, relay observable events such as assignment, waiting, and final completion. Require delegated subagents to provide a final report before leaving; after capturing final report and evidence, close or release the completed subagent, then review the final report and evidence before marking the work complete. Use `explorer` for parallel read-only discovery or verification when available and useful. Allow recursive delegation only for bounded sub-tasks when the current surface supports it. If subagent tools are unavailable, the main agent takes over implementation directly and records that takeover in evidence.
11. Before mutating external state, run the task dry-run or check command when one is recorded. If none exists, record the absence and continue with the smallest reversible command available.
12. For Heavy Path, run the recorded automated test command and record explicit `Tests:` evidence before claiming completion.
13. `worker` must return a structured handoff for only its assigned goal/task with changed files, tool readiness result, dry-run or check result when applicable, automated test result for Heavy Path, module acceptance command and result, surface integration command or QA artifact, blocker, and cleanup notes. A worker must not select the next task.
14. Re-run both verification gates directly. Record each successful command as a structured Cairn receipt bound to the current goal ID, task ID, and plan.
15. Apply the bounded loop policy when a gate fails. After two failed passes, transition the task or goal to `blocked` with a concrete blocker instead of continuing automatically.
16. Mark a task complete only after every required receipt passes. Let Cairn advance to the next pending task, then continue the goal without yielding a false completion.
17. After all tasks complete, run and record the goal-level final review receipt and explicitly complete the goal. `active` is not a completion state; `paused`, `blocked`, and `cancelled` are allowed terminal-for-now states that stop automatic continuation.
18. Record evidence in the plan file and state before updating `PLAN.md`.
19. If the user asks a side question, status question, or narrow clarification while this task is still active, answer it briefly and then resume the previous active work unless the user explicitly asks to pause, stop, or switch tasks.
20. Write user-visible responses and generated or updated documentation, plans, and memory artifacts in the OS locale unless the user asks for another language.

## Builder Prompt Format

```text
TASK: Implement task <task-id> for <topic>.
EXPECTED OUTCOME: Minimal code or documentation change satisfying the task contract.
REQUIRED TOOLS: Scoped file editing, tool readiness checks, existing test/build commands, surface QA commands.
MUST DO: Read the project-root `MEMORY.md` before doing assigned work and follow its policy. Stay within the listed file scope and ownership. Assume you are not alone in the codebase; do not revert others' edits. Treat the user-called/main agent as the orchestrator; delegate actual implementation edits to `worker` whenever subagent tools are available, regardless of Light Path or Heavy Path. When the subagent tool provides a progress-reporting channel, require subagents to report status to the orchestrator when starting work, when deciding or confirming direction, during periodic progress, and when finishing; the orchestrator must immediately relay received status events to the user. If no mid-run reporting channel exists, relay observable events such as assignment, waiting, and final completion. Require delegated subagents to provide a final report before leaving; after capturing final report and evidence, close or release the completed subagent, then review the final report and evidence before marking the work complete. If subagent tools are unavailable, the main agent takes over implementation directly and records that takeover in evidence. When subagent tools are available, recursively delegate only bounded sub-tasks and pass these same constraints to every child subagent. Obtain explicit user approval before installing missing tools. Run dry-run or check mode before external-state mutation when available. Provide module evidence, surface evidence, and a structured handoff scoped to the assigned goal/task. Use the OS locale for user-visible responses and generated or updated documentation, plans, and memory artifacts.
MUST NOT DO: Ask the user. Skip LSP/typecheck/lint because a tool is missing without attempting installation. Refactor unrelated code. Continue an open-ended verification loop. Treat a side question as permission to abandon the active task. Delegate vague or unbounded work. Claim completion without evidence. Modify files outside the assigned ownership.
CONTEXT: docs/plan/<topic>.md task, relevant docs/memory notes, applied model guidance, exact files, verification commands.
```

## Tool Readiness Policy

- Run the repository tool readiness command recorded in the plan before implementation.
- If no command is recorded, run the resolved installed runtime's `toolcheck --root "<repoRoot>"`.
- Missing LSP, typecheck, lint, dry-run, or verification tools must be reported with an install proposal. Installation requires explicit user approval and a pinned/supported installer.
- After installation, rerun the exact tool command and record evidence.
- If installation fails, stop the task and record the blocker rather than silently falling back to less precise exploration.

## Two Verification Gates

- Module acceptance: targeted unit, typecheck, lint, parser, schema, or command that proves the module contract.
- Surface integration: HTTP, browser, CLI, tmux, desktop, or parsed artifact evidence proving behavior through the real surface.
- Heavy Path test gate: run an explicit automated test command and record it as `Tests:` evidence in the plan. This is required even when module acceptance uses a broader check command.

## Dry-Run Policy

Run the closest available dry-run or check mode before commands that mutate external state.

- Migrations and database changes: `--pretend`, dry-run, schema diff, rollback feasibility check, or equivalent.
- Package and release work: `npm pack --dry-run`, publish dry-run, build check, or equivalent.
- Infrastructure and deployment: plan, diff, validate, check, or equivalent.
- Code generation and formatting: check mode before write mode when available.
- If no dry-run mode exists, record that fact in `docs/plan/<topic>.md` before continuing.

## Bounded Loop Policy

- Run at most two verification passes per task by default.
- If a gate fails, diagnose the cause once, shrink the task or split it into sub-tasks, then rerun both gates.
- After two failed passes, stop implementation for the task and record the blocker in `docs/plan/<topic>.md`.
- Do not imitate repeated red-green loops unless the plan explicitly records a risk-based reason.

## Completion Criteria

- Both verification gates passed in the current turn.
- Heavy Path work has explicit automated test evidence in the current plan.
- The active goal advanced through every task and has goal-level final review evidence, or it is explicitly `paused`, `blocked`, or `cancelled` with a recorded reason.
- Implementation edits were delegated to `worker` when subagent tools were available, or the main agent took over implementation directly and recorded that takeover in evidence when subagent tools were unavailable.
- Required LSP/check/verification tools were available, installed, or recorded as blockers with attempted commands.
- Dry-run or check evidence exists when the task could mutate external state, or the plan records why no dry-run exists.
- The required Light Path or Heavy Path flow was followed.
- The model guidance recorded in the plan was applied.
- Evidence was recorded in `docs/plan/<topic>.md`.
- `PLAN.md` status was updated only after evidence existed.
