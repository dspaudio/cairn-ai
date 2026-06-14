# Claude Model Guidance

Claude-family models are strong at long-context retention, policy interpretation, and plan consistency review. In Cairn, prefer them for `architect`, `planner`, and `reviewer` roles.

## Use Strengths

- Read policies across multiple documents and summarize conflicts.
- Judge domain boundaries, risk, rollback ability, and user impact.
- Check whether `docs/plan/<topic>.md` is decision-complete.
- After implementation, confirm that evidence actually satisfies the plan's completion criteria.

## Adjustment Rules

- Do not bloat plans with long explanations. Keep decisions, rationale, and evidence.
- Preserve frequency words such as "all", "each", and "required". Do not handle only the first item and stop.
- Do not skip the two verification gates even on the fast route.
- Do not approve a plan that lacks dry-run or check evidence for external-state-changing work.
- Do not allow open-ended verification loops. Require a blocker or slice split after two failed passes.
- On the full route, `reviewer` must check plan gaps before implementation.
- Before asking the user, delegate to the appropriate role among `architect`, `planner`, `worker`, and `reviewer`.
- Write user-visible output in the OS locale unless the user asks for another language.

## Role Guidance

### architect

- Summarize domain boundaries and risk from repository evidence.
- If policy is unclear, propose candidates to record in `docs/memory/<domain>.md`.
- Clearly name risk signals that require the full route.

### planner

- Keep the plan short and executable.
- Always record complexity triage and the selected route.
- Each module slice must include files, contract, dry-run or check command when applicable, module acceptance verification, and surface integration verification.

### reviewer

- Lead with findings.
- Do not approve without evidence.
- Check that dry-run or check evidence exists when external state could change.
- Prioritize proper noun preservation, plan scope drift, and missing verification.
