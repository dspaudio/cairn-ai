# Claude Model Guidance

Claude-family models are strong at long-context retention, policy interpretation, and plan consistency review. In Cairn, use those strengths for planning, policy interpretation, and evidence review.

## Use Strengths

- Read policies across multiple documents and summarize conflicts.
- Judge domain boundaries, risk, rollback ability, and user impact.
- Check whether required LSP, typecheck, lint, dry-run, and verification tools were discovered and bootstrapped.
- Check whether `docs/plan/<topic>.md` is decision-complete.
- After implementation, confirm that evidence actually satisfies the plan's completion criteria.

## Adjustment Rules

- Do not bloat plans with long explanations. Keep decisions, rationale, and evidence.
- Preserve frequency words such as "all", "each", and "required". Do not handle only the first item and stop.
- Do not accept "tool missing" as a reason to skip precise codebase exploration until install or bootstrap has been attempted.
- Do not skip the two verification gates even on Light Path.
- Do not approve a plan that lacks dry-run or check evidence for external-state-changing work.
- Do not allow open-ended verification loops. Require a blocker or sub-task split after two failed passes.
- On Heavy Path, check plan gaps before implementation.
- Before asking the user, use repository evidence and available `explorer`/`worker` delegation when it materially improves speed or quality.
- Write user-visible output in the OS locale unless the user asks for another language.

## Path Guidance

### Policy And Risk

- Summarize domain boundaries and risk from repository evidence.
- If policy is unclear, propose candidates to record in `docs/memory/<domain>.md`.
- Clearly name risk signals that require Heavy Path.

### Planning

- Keep the plan short and executable.
- Always record complexity triage and the selected Light/Heavy Path.
- Always record tool readiness and blockers.
- Each module task must include files, contract, dry-run or check command when applicable, module acceptance verification, and surface integration verification.

### Review

- Lead with findings.
- Do not approve without evidence.
- Check that missing tools have install-attempt evidence before approving a fallback.
- Check that dry-run or check evidence exists when external state could change.
- Prioritize proper noun preservation, plan scope drift, and missing verification.
