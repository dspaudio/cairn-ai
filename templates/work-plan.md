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

- Selected route: fast route or full route.
- Selection rationale:
- Omitted fast-route roles and rationale:
- Full-route pre-review decisions:

### Route Criteria

- Fast route: `planner -> builder`.
- Full route: `architect -> planner -> reviewer -> builder -> reviewer`.

## Agent Assignments

- `architect`: system boundaries and risk. Required on the full route.
- `planner`: decision-complete planning. Required on every route.
- `builder`: module slice implementation. Required on every route.
- `reviewer`: pre-implementation plan gap review and post-implementation evidence review. Required on the full route.
- `worker`: focused execution work. Use when needed.

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
- Dry-run or check command:
- Module acceptance verification:
- Surface integration verification:

## Evidence

- Dry-run or check:
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
