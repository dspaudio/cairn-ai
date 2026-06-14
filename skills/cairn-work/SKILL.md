---
name: cairn-work
description: Execute docs/plan module slices through small builder delegation and two verification gates.
---

# Cairn Work

Use this to implement a plan created by `cairn-plan`.

## Purpose

Execute only one module slice at a time. Instead of a repeated red-green loop, prove a small slice with two strong verification gates.

## Procedure

1. Read `PLAN.md`, the selected `docs/plan/<topic>.md`, `MEMORY.md`, and relevant memory notes.
2. Read the `docs/model-guidance/*.md` inputs recorded in the plan.
3. Select the first incomplete module slice.
4. Confirm that required LSP, typecheck, lint, dry-run, and verification tools are available from the plan's tool readiness section.
5. If a required tool is missing, run `scripts/cairn toolcheck --install` or the closest repository-native install command, then rerun the tool before continuing.
6. Confirm the selected route in the plan.
7. For the fast route, keep `planner -> builder` order and delegate directly to `builder`.
8. For the full route, keep `architect -> planner -> reviewer -> builder -> reviewer` order. Before implementation, `reviewer` checks plan gaps. After implementation, `reviewer` checks evidence and regressions.
9. Delegate implementation to `builder` or `worker` with exact files, constraints, and model-specific adjustment rules.
10. Before mutating external state, run the slice dry-run or check command when one is recorded. If none exists, record the absence and continue with the smallest reversible command available.
11. `builder` must return changed files, tool readiness result, dry-run or check result when applicable, module acceptance command and result, surface integration command or QA artifact, and cleanup notes.
12. Re-run both verification gates directly.
13. Apply the bounded loop policy when a gate fails.
14. Record evidence in the plan file before marking the slice complete.
15. Write user-visible output in the OS locale unless the user asks for another language.

## Builder Prompt Format

```text
TASK: Implement slice <slice-id> for <topic>.
EXPECTED OUTCOME: Minimal code or documentation change satisfying the slice contract.
REQUIRED TOOLS: Scoped file editing, tool readiness checks, existing test/build commands, surface QA commands.
MUST DO: Follow MEMORY.md policy. Stay within the listed file scope. Install or bootstrap missing required tools before declaring them unavailable. Run dry-run or check mode before external-state mutation when available. Provide module evidence and surface evidence. Use the OS locale for user-visible text.
MUST NOT DO: Ask the user. Skip LSP/typecheck/lint because a tool is missing without attempting installation. Refactor unrelated code. Continue an open-ended verification loop. Claim completion without evidence.
CONTEXT: docs/plan/<topic>.md slice, relevant docs/memory notes, applied model guidance, exact files, verification commands.
```

## Tool Readiness Policy

- Run the repository tool readiness command recorded in the plan before implementation.
- If no command is recorded, run `scripts/cairn toolcheck` when available.
- Missing LSP, typecheck, lint, dry-run, or verification tools must trigger a project-local or repository-native install attempt.
- After installation, rerun the exact tool command and record evidence.
- If installation fails, stop the slice and record the blocker rather than silently falling back to less precise exploration.

## Two Verification Gates

- Module acceptance: targeted unit, typecheck, lint, parser, schema, or command that proves the module contract.
- Surface integration: HTTP, browser, CLI, tmux, desktop, or parsed artifact evidence proving behavior through the real surface.

## Dry-Run Policy

Run the closest available dry-run or check mode before commands that mutate external state.

- Migrations and database changes: `--pretend`, dry-run, schema diff, rollback feasibility check, or equivalent.
- Package and release work: `npm pack --dry-run`, publish dry-run, build check, or equivalent.
- Infrastructure and deployment: plan, diff, validate, check, or equivalent.
- Code generation and formatting: check mode before write mode when available.
- If no dry-run mode exists, record that fact in `docs/plan/<topic>.md` before continuing.

## Bounded Loop Policy

- Run at most two verification passes per slice by default.
- If a gate fails, diagnose the cause once, shrink or split the slice, then rerun both gates.
- After two failed passes, stop implementation for the slice and record the blocker in `docs/plan/<topic>.md`.
- Do not imitate repeated red-green loops unless the plan explicitly records a risk-based reason.

## Completion Criteria

- Both verification gates passed in the current turn.
- Required LSP/check/verification tools were available, installed, or recorded as blockers with attempted commands.
- Dry-run or check evidence exists when the slice could mutate external state, or the plan records why no dry-run exists.
- The required role order for the selected route was followed.
- The model guidance recorded in the plan was applied.
- Evidence was recorded in `docs/plan/<topic>.md`.
- `PLAN.md` status was updated only after evidence existed.
