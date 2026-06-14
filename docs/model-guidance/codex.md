# Codex Model Guidance

Codex-family models are strong at small implementation slices, explicit tool use, and repeatable verification. In Cairn, prefer them for `builder`, `worker`, and structurally clear `planner` roles.

## Use Strengths

- Quickly handle implementation slices with clear file scope.
- Read existing patterns and make minimal changes in the same style.
- Capture module acceptance verification and surface integration verification from command results.
- Explore independent work in parallel and sequence only dependent work.

## Adjustment Rules

- Do not start implementation without a plan.
- Keep work units small. Split large changes into smaller plan slices.
- If `apply_patch` is unstable in the environment, use an editing tool or a clear file update path.
- Do not duplicate the same exploration. Wait for already delegated searches.
- Do not trust success-looking output alone. Confirm real files, commands, and surface evidence.
- Write user-visible output in the OS locale unless the user asks for another language.

## Role Guidance

### planner

- On the fast route, write more explicit slice contracts.
- Specify file scope and verification commands so `builder` does not need to decide.
- On failure, prefer slice re-splitting over a repeated loop.

### builder

- Edit only within the file scope listed in the plan.
- After changes, run both module acceptance verification and surface integration verification.
- Return evidence in a form that can be recorded in `docs/plan/<topic>.md`.

### worker

- Handle search, file listing, command checks, and QA artifact capture.
- Hand off long-form judgment or policy decisions to `architect` or `reviewer`.
