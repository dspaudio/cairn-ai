# Codex Model Guidance

Codex-family models are strong at small implementation slices, explicit tool use, and repeatable verification. In Cairn, prefer them for `builder`, `worker`, and structurally clear `planner` roles.

## Use Strengths

- Quickly handle implementation slices with clear file scope.
- Read existing patterns and make minimal changes in the same style.
- Run repository tool readiness checks and bootstrap missing command-line tools.
- Capture module acceptance verification and surface integration verification from command results.
- Run dry-run, check, plan, diff, validate, or equivalent commands before mutating external state.
- Explore independent work in parallel and sequence only dependent work.

## Adjustment Rules

- Do not start implementation without a plan.
- Keep work units small. Split large changes into smaller plan slices.
- If `apply_patch` is unstable in the environment, use an editing tool or a clear file update path.
- Do not duplicate the same exploration. Wait for already delegated searches.
- Do not trust success-looking output alone. Confirm real files, commands, and surface evidence.
- Do not skip LSP, typecheck, lint, dry-run, or verification because a tool is missing. Try repository-local installation or record the failed install attempt as a blocker.
- Do not continue an open-ended verification loop. Use at most two verification passes per slice unless the plan records a risk-based exception.
- Write user-visible output in the OS locale unless the user asks for another language.

## Role Guidance

### planner

- On the fast route, write more explicit slice contracts.
- Record detected stack, required tools, install commands, and tool blockers.
- Specify file scope and verification commands so `builder` does not need to decide.
- Specify the dry-run or check command for slices that can mutate external state, or record why none exists.
- On failure, prefer slice re-splitting over a repeated loop.

### builder

- Edit only within the file scope listed in the plan.
- Confirm required tools are available. Install or bootstrap missing required tools before implementation.
- Run the recorded dry-run or check command before external-state mutation when applicable.
- After changes, run both module acceptance verification and surface integration verification.
- If a gate fails, diagnose once, shrink or split the slice, and rerun both gates. Stop after the second failed pass and record the blocker.
- Return evidence in a form that can be recorded in `docs/plan/<topic>.md`.

### worker

- Handle search, file listing, command checks, and QA artifact capture.
- Hand off long-form judgment or policy decisions to `architect` or `reviewer`.
