# Plan: <topic>

## Goal

Describe the observable result.

## Memory Inputs

- `MEMORY.md`
- `docs/memory/<domain>.md`

## Model Guidance

- Applied model family: Codex or Claude.
- Referenced guidance:
  - `docs/model-guidance/README.md`
  - `docs/model-guidance/<claude-or-codex>.md`
- Rationale:
- Role-specific adjustment:
- User-visible output locale: OS locale unless the user asks for another language.

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
- `worker`: bounded implementation slices with clear file ownership, or scoped verification work.
- Local main session: urgent blocking work when the next step depends immediately on the result.

## Tool Readiness

- Detected stack:
- Toolcheck command:
- Required LSP/symbol tools:
- Required typecheck/lint/verification tools:
- Missing tools:
- Install/bootstrap commands attempted:
- Tool blockers:

## Execution Guardrails

- Dry-run or check mode before external-state mutation:
- No dry-run available, if applicable:
- Verification loop budget: two passes per slice by default.
- Failure handling: diagnose once, shrink or split the slice, rerun both gates, then record a blocker after the second failed pass.

## Module Slices

### Slice 1: <module>

- Contract:
- Files:
- Dependencies:
- Tool readiness requirement:
- Dry-run or check command:
- Module acceptance verification:
- Surface integration verification:

## Evidence

- Dry-run or check:
- Tool readiness:
- Module acceptance:
- Surface integration:
- Verification pass count:
- Blocker after two failed passes:

## Status

- [ ] Planned
- [ ] Dry-run or check passed, or not applicable was recorded
- [ ] Implemented
- [ ] Module acceptance passed
- [ ] Surface integration passed
- [ ] Reviewed
