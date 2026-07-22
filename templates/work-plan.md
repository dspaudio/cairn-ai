# Plan: <topic>

## Plan Phase

- Initial: decision-complete for `triage-plan`; not implementation-ready.
- Finalized: decision-complete for implementation after planned triage.
- Codex UI synchronization: `update_plan` status and `create_goal` status, or an explicit unavailable reason.

## Goal

Describe the observable result.

- Goal ID: `goal-<stable-id>`
- Plan ID: `plan-<stable-id>`
- Runtime resources: `cairn://` resources resolved by the installed Cairn version; do not record a user-specific absolute plugin path.
- Completion criteria:
- Required goal evidence: `finalReview`
- Terminal state: `completed`, `paused`, `blocked`, or `cancelled` (an `active` goal is never complete).

## Whole Work

- Outcome:
- Affected surfaces:
- Task classification:
- Sub-tasks, if needed:

## Memory Inputs

- `MEMORY.md`
- `docs/memory/<domain>.md`

## Model Guidance

- Applied model family: Codex or Claude.
- Referenced guidance:
  - `cairn://docs/model-guidance/README.md`
  - `cairn://docs/model-guidance/<claude-or-codex>.md`
- Rationale:
- Role-specific adjustment:
- User-visible response and artifact locale: OS locale unless the user asks for another language.

## Complexity Triage

- Selected path: Light Path or Heavy Path.
- Selection rationale:
- Heavy Path signals checked:
  - New directory/module/layer:
  - New domain model/service/abstraction:
  - Security/auth/session:
  - External API/message queue/payment:
  - DB schema/migration:
  - Concurrency/transaction/cache invalidation:
  - Cross-domain refactor:
  - Explicit extra-care signal:
- Heavy Path trigger, if selected:
- Omitted delegation in Light Path, if applicable:
- Pre-implementation decisions:

### Path Criteria

- Light Path: narrow changes inside existing architecture layers. Direct edit or one bounded `worker`, then focused verification.
- Heavy Path: new directory/module/layer, new domain model/service/abstraction, security/session/auth, external API/message queue/payment, DB schema/migration, concurrency/transaction/cache changes, cross-domain refactor, or explicit extra-care request.

## Agent Assignments

- `explorer`: read-only discovery, impact analysis, pattern search, and read-only verification when available.
- `worker`: bounded implementation tasks with clear file ownership, or scoped verification work.
- Local main session: urgent blocking work when the next step depends immediately on the result.

## Tool Readiness

- Detected stack:
- Toolcheck command:
- Required LSP/symbol tools:
- Required typecheck/lint/verification tools:
- Missing tools:
- Install approval: not requested, approved, denied, or not needed.
- Install/bootstrap commands proposed or attempted:
- Tool blockers:

## Execution Guardrails

- Test contract first: requirements, invariants, boundaries, failure modes, expected initial failure, and authoritative tool result.
- Token budget: high reasoning for plan/triage/test design; bounded minimum implementation; concise tool-derived verification summaries.
- Verification ladder: focused tests, one final full check, then package dry-run if no files changed. Inspect lifecycle scripts first; run normal `npm pack --dry-run` by default. Content-producing or unknown scripts must never use `--ignore-scripts`; only absent or proven content-neutral scripts may use it while evidence remains fresh.
- Evidence freshness: relevant changes after verification make affected evidence stale.
- Verification execution: `goal verify` defaults to 600,000 ms (10 minutes), is capped at 3,600,000 ms (1 hour), and records only when the starting goal/task identity and pre/post watched fingerprint match.
- Evidence boundary: choose the semantic boundary whose watch set and command prove the claimed behavior.
- Dry-run or check mode before external-state mutation:
- No dry-run available, if applicable:
- Verification loop budget: two passes per task by default.
- Failure handling: diagnose once, shrink the task or split it into sub-tasks, rerun both gates, then record a blocker after the second failed pass.

## Module Tasks

### Task 0: planned triage and plan finalization

- Task ID: `triage-plan`
- Initial status: `active`
- Contract: execute the investigation scope and Heavy Path criteria declared by the initial plan, then update this file and the Codex UI plan to the decision-complete implementation revision.
- Required evidence records:
  - `planArtifact`: command, exit code 0, timestamp, goal ID, task ID, and plan ID.
  - `triageDecision`: command, exit code 0, timestamp, goal ID, task ID, and plan ID.

### Task 1: <module>

- Task ID: `task-1`
- Initial status: `pending` or `active`
- Contract:
- Sub-tasks, if needed:
- Files:
- Dependencies:
- Tool readiness requirement:
- Dry-run or check command:
- Module acceptance verification:
- Surface integration verification:
- Required evidence records:
  - `moduleAcceptance`: command, exit code 0, timestamp, goal ID, task ID, and plan ID.
  - `surfaceIntegration`: command or QA artifact, exit code 0, timestamp, goal ID, task ID, and plan ID.
- Assigned agent ID, if delegated:
- Blocker: a concrete reason is required when status becomes `blocked`.

## Evidence

- Dry-run or check:
- Tool readiness:
- Tests:
- Module acceptance:
- Surface integration:
- Goal final review evidence record:
- Verification pass count:
- Blocker after two failed passes:

## Status

- [ ] Planned
- [ ] Dry-run or check passed, or not applicable was recorded
- [ ] Implemented
- [ ] Module acceptance passed
- [ ] Surface integration passed
- [ ] Reviewed
- [ ] Goal completed, or an explicit paused/blocked/cancelled reason was recorded
