---
name: cairn-plan
description: Create decision-complete PLAN.md and docs/plan plans through agent delegation instead of user questions.
---

# Cairn Plan

Use this when planning implementation, refactoring, migrations, debugging, or repository automation.

## Purpose

Plans must reduce execution tokens. Do not leave long plans only in chat. Store the topic in `PLAN.md` and details in `docs/plan/<topic>.md`.

## Procedure

1. Run `scripts/cairn-state.sh manual` if it exists. Otherwise ensure `MEMORY.md`, `PLAN.md`, `docs/memory`, and `docs/plan` directly.
2. Read only `MEMORY.md` and relevant `docs/memory/*.md` files.
3. Based on the active or assigned model, read `docs/model-guidance/README.md` and only the relevant model guidance.
4. Explore the repository with focused search and LSP/symbol tools.
5. Run complexity triage and select the work route.
6. Delegate according to the selected route and model guidance instead of asking the user.
   - `architect`: boundaries, domain policy, high-risk decisions.
   - `planner`: slice order, dependencies, acceptance criteria.
   - `worker`: concrete file paths, command availability, examples.
   - `reviewer`: plan gaps and unproven assumptions.
7. Create `docs/plan/<topic>.md` from `templates/work-plan.md`.
8. Add a short index entry to `PLAN.md`.
9. Write user-visible output in the OS locale unless the user asks for another language.

## Complexity Triage

Decide triage from repository evidence without asking the user.

### Fast Route: `planner -> builder`

Choose the fast route only when all conditions are true.

- Expected change scope is one module or 1-2 files.
- There is no data loss, permission, billing, security, migration, or external API impact.
- Existing patterns are clear and there is precedent.
- Module acceptance verification and surface integration verification can be named immediately.
- Domain policy is sufficiently confirmed in `MEMORY.md` or relevant `docs/memory/*.md`.

### Full Route: `architect -> planner -> reviewer -> builder -> reviewer`

Choose the full route when any signal is present.

- 3+ files or 2+ modules are affected.
- Data models, migrations, permissions, authentication, billing, alerts, external integrations, or deployment settings are involved.
- Existing patterns are unclear or conflicting.
- Domain policy or success criteria are insufficient from repository evidence alone.
- Failure is hard to roll back or has significant user impact.

### Route Record

`docs/plan/<topic>.md` must record:

- Selected route.
- Selection rationale.
- Roles omitted in the fast route and why.
- Decisions that `architect` and the first `reviewer` must resolve in the full route.

## Planning Rules

- Every plan must be decision-complete.
- Every plan must include complexity triage and the selected route.
- Every plan must include applied model guidance and rationale.
- Every implementation slice must be small enough to verify with two checks.
- The default checks are module acceptance verification and surface integration verification.
- Verification can expand for risk, but the reason must be recorded.
- Ask the user only when agents or repository evidence cannot answer the decision.
- User-visible text must follow the OS locale unless the user asks for another language.

## Delegation Prompt Format

```text
TASK: Produce <role> input needed for the <topic> plan.
EXPECTED OUTCOME: Return concrete decisions, file paths, dependencies, risks, and evidence requirements.
REQUIRED TOOLS: Read-only repository exploration, LSP/symbol tools, local command checks.
MUST DO: Preserve proper nouns exactly. Prefer repository evidence. Identify assumptions. Use the OS locale for user-visible text.
MUST NOT DO: Edit production code. Ask the user. Expand scope.
CONTEXT: User request, MEMORY.md, relevant docs/memory notes, applied model guidance, repository root.
```

## Completion Criteria

- `PLAN.md` references the plan topic.
- `docs/plan/<topic>.md` includes goal, memory inputs, model guidance, complexity triage, selected route, agent assignments, module slices, and two checks per slice.
- The next `builder` task can run without making planning decisions.
