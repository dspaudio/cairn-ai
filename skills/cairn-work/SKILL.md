---
name: cairn-work
description: Use after cairn-plan to execute the next incomplete docs/plan module slice with the recorded Light/Heavy Path route, bounded worker delegation, dry-run/check evidence, and two verification gates.
---

# Cairn Work

Use this to implement a plan created by `cairn-plan`. Do not use this as a shortcut around planning; if no plan exists for non-trivial implementation, run `cairn-plan` first.

## Purpose

Execute only one module slice at a time. Instead of a repeated red-green loop, prove a small slice with two strong verification gates.

Every work run starts by reading the project-root `MEMORY.md` before choosing or executing a slice. Every delegated agent must also read the project-root `MEMORY.md` before doing its assigned task.

## Procedure

1. Read the project-root `MEMORY.md` first.
2. Read `PLAN.md`, the selected `docs/plan/<topic>.md`, and relevant memory notes.
3. Read the `docs/model-guidance/*.md` inputs recorded in the plan.
4. Select the first incomplete module slice.
5. Confirm that required LSP, typecheck, lint, dry-run, and verification tools are available from the plan's tool readiness section.
6. If a required tool is missing, run `node scripts/cairn.mjs toolcheck --install` or the closest repository-native install command, then rerun the tool before continuing.
7. Confirm the selected Light Path or Heavy Path in the plan. If the plan lacks complexity triage, stop and update the plan before mutating files.
8. For Light Path, implement directly or delegate to one bounded `worker`; keep the verification gate.
9. For Heavy Path, follow the full planning and review pipeline recorded in the plan. Run pre-implementation review before mutation and read-only review after evidence exists.
10. Delegate implementation to `worker` with exact files, ownership, constraints, and model-specific adjustment rules. Tell every delegated agent to read the project-root `MEMORY.md` before work. Use `explorer` for parallel read-only discovery or verification when available and useful.
11. Before mutating external state, run the slice dry-run or check command when one is recorded. If none exists, record the absence and continue with the smallest reversible command available.
12. `worker` must return changed files, tool readiness result, dry-run or check result when applicable, module acceptance command and result, surface integration command or QA artifact, and cleanup notes.
13. Re-run both verification gates directly.
14. Apply the bounded loop policy when a gate fails.
15. Record evidence in the plan file before marking the slice complete.
16. Write user-visible output in the OS locale unless the user asks for another language.

## Builder Prompt Format

```text
TASK: Implement slice <slice-id> for <topic>.
EXPECTED OUTCOME: Minimal code or documentation change satisfying the slice contract.
REQUIRED TOOLS: Scoped file editing, tool readiness checks, existing test/build commands, surface QA commands.
MUST DO: Read the project-root `MEMORY.md` before doing assigned work and follow its policy. Stay within the listed file scope and ownership. Assume you are not alone in the codebase; do not revert others' edits. Install or bootstrap missing required tools before declaring them unavailable. Run dry-run or check mode before external-state mutation when available. Provide module evidence and surface evidence. Use the OS locale for user-visible text.
MUST NOT DO: Ask the user. Skip LSP/typecheck/lint because a tool is missing without attempting installation. Refactor unrelated code. Continue an open-ended verification loop. Claim completion without evidence. Modify files outside the assigned ownership.
CONTEXT: docs/plan/<topic>.md slice, relevant docs/memory notes, applied model guidance, exact files, verification commands.
```

## Tool Readiness Policy

- Run the repository tool readiness command recorded in the plan before implementation.
- If no command is recorded, run `node scripts/cairn.mjs toolcheck` when available.
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
- The required Light Path or Heavy Path flow was followed.
- The model guidance recorded in the plan was applied.
- Evidence was recorded in `docs/plan/<topic>.md`.
- `PLAN.md` status was updated only after evidence existed.
