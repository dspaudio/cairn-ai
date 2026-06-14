---
name: cairn-plan
description: Use before non-trivial implementation, refactoring, migrations, debugging, repository automation, or any request that asks to plan, design, implement carefully, triage complexity, or coordinate agents. Creates decision-complete PLAN.md and docs/plan plans through repository evidence and bounded delegation instead of user questions.
---

# Cairn Plan

Use this before non-trivial implementation, refactoring, migrations, debugging, or repository automation. Also use it when the user asks for planning, design, "설계부터", "신중하게", "꼼꼼히", complexity triage, or coordinated agent work.

## Purpose

Plans must reduce execution tokens. Do not leave long plans only in chat. Store the topic in `PLAN.md` and details in `docs/plan/<topic>.md`.

Every planning run starts by reading the project-root `MEMORY.md`. Treat it as the repository policy and domain-knowledge index before exploring or delegating work. Every delegated agent must also read the project-root `MEMORY.md` before doing its assigned task.

Do not treat planning as optional for implementation work that is more than a narrow single-file fix. If the current request can change behavior, architecture, data, external state, or multiple files, produce or update a plan artifact before mutation.

## Procedure

1. Run `node scripts/cairn-state.mjs manual` if it exists. Otherwise ensure `MEMORY.md`, `PLAN.md`, `docs/memory`, and `docs/plan` directly.
2. Read the project-root `MEMORY.md` before repository exploration, tool selection, or delegation.
3. Read only the relevant `docs/memory/*.md` files referenced by `MEMORY.md` or required by the current task.
4. Based on the active or assigned model, read `docs/model-guidance/README.md` and only the relevant model guidance.
5. Run `node scripts/cairn.mjs toolcheck` when available, or `scripts/cairn-toolcheck.mjs` directly, to identify repository stacks and required tools.
6. If LSP, typecheck, lint, dry-run, or verification tools are missing, run `node scripts/cairn.mjs toolcheck --install` or the closest repository-native install command before treating the tool as unavailable.
7. Explore the repository with focused search and LSP/symbol tools after tool readiness is confirmed.
8. Identify the closest available dry-run or check mode for every slice that can mutate external state.
9. Run complexity triage before applying workflow guidance from agents, plugins, or delegated roles. Record the route before any implementation slice.
10. Delegate according to the selected path and model guidance instead of asking the user.
   - Use `explorer` for independent read-only codebase discovery, impact analysis, pattern searches, and read-only verification that can run in parallel when the current tool list supports it.
   - Use `worker` for bounded implementation slices with clear file ownership, disjoint write scope, or verification tasks that can run while the main session continues.
   - Keep urgent blocking work local when the next step depends immediately on the result.
   - Tell every delegated agent to read the project-root `MEMORY.md` before work, and tell workers they are not alone in the codebase and must not revert others' edits.
11. Create `docs/plan/<topic>.md` from `templates/work-plan.md`.
12. Add a short index entry to `PLAN.md`.
13. Write user-visible output in the OS locale unless the user asks for another language.

## Complexity Triage

Decide triage from repository evidence without asking the user.

This decision takes priority over plugin, agent, or delegated workflow guidance unless higher-priority system or developer instructions say otherwise. The default is Light Path; use Heavy Path only when a Heavy Path condition clearly applies.

### Light Path

Use Light Path for narrow changes inside existing architecture layers. Skip planning/review agents and implement directly or with one `worker`, but keep the verification gate.

Light Path conditions:

- The change stays inside existing architecture layers.
- No new domain model, service class, or abstraction is introduced.
- No security, authentication, authorization, session, external API, message queue, payment, DB schema, migration, concurrency, transaction-boundary, or cache-invalidation change is involved.

Light Path examples:

- One new API endpoint within existing layers.
- Add or modify a controller or service method.
- Strengthen validation rules.
- Adjust query logic.
- Change copy text or constants.
- Fix one clearly scoped bug.

Light Path flow: direct edit or single `worker` -> focused verification by the main agent or a scoped verification `worker` -> report. If there is no plan artifact, use the original user request and the diff as the verification baseline.

### Heavy Path

Use Heavy Path when the request clearly needs the full planning and review pipeline.

Heavy Path conditions:

- Creating a new directory, module, or architecture layer.
- Introducing a new domain model, service class, or abstraction.
- Changing security, authentication, authorization, or sessions.
- Integrating an external API, message queue, or payment flow.
- Changing DB schema or migrations.
- Changing concurrency, transaction boundaries, or cache invalidation.
- Refactoring across multiple domains.
- The user signals extra care, such as "신중하게", "검토 받고", "설계부터", or "꼼꼼히".

Heavy Path flow: plan -> pre-implementation review -> bounded `worker` implementation -> verification worker or read-only review.

### Route Record

`docs/plan/<topic>.md` must record:

- Selected path.
- Selection rationale.
- Heavy Path conditions found, if any.
- Heavy Path conditions checked and not found.
- Roles or delegation omitted in Light Path and why.
- Pre-implementation decisions that review must resolve in Heavy Path.

## Planning Rules

- Every plan must be decision-complete.
- Every plan must include complexity triage and the selected path.
- Every plan must explicitly list Heavy Path signals checked, even when Light Path is selected.
- Every plan must include applied model guidance and rationale.
- Every plan must include tool readiness results: detected stack, required LSP/check tools, installed tools, and blockers.
- Every implementation slice must be small enough to verify with two checks.
- The default checks are module acceptance verification and surface integration verification.
- Every risky or external-state-changing slice must include the closest available dry-run or check command before the write/apply command.
- Verification can expand for risk, but the reason must be recorded.
- The default loop budget is two verification passes per slice. If a gate fails, diagnose once, shrink or split the slice, and rerun both gates. After two failed passes, record the blocker in `docs/plan/<topic>.md` instead of continuing an open-ended loop.
- Ask the user only when agents, repository evidence, or local verification cannot answer the decision.
- User-visible text must follow the OS locale unless the user asks for another language.

## Tool Readiness Policy

Do not skip LSP, typecheck, lint, dry-run, or verification because the tool is missing.

- Detect the codebase stack from repository files before choosing tools.
- Prefer repository-local installation through the existing package manager and lockfile.
- Use ephemeral tool runners only when project-local installation is not appropriate.
- Run the tool after installation and record the command result.
- If installation is impossible, record the command tried, failure output summary, and blocker in `docs/plan/<topic>.md`.
- Treat "LSP server not installed" as an unresolved blocker until installation or an equivalent symbol-aware fallback has been attempted.

## Dry-Run Policy

Prefer repository-native dry-run and check modes before mutating external state.

- Migrations and database changes: `--pretend`, dry-run, schema diff, rollback feasibility check, or equivalent.
- Package and release work: `npm pack --dry-run`, publish dry-run, build check, or equivalent.
- Infrastructure and deployment: plan, diff, validate, check, or equivalent.
- Code generation and formatting: check mode before write mode when available.
- If no dry-run mode exists, record that fact and select the smallest reversible command or test artifact available.

## Delegation Prompt Format

```text
TASK: Produce <role> input needed for the <topic> plan.
EXPECTED OUTCOME: Return concrete decisions, file paths, dependencies, risks, and evidence requirements.
REQUIRED TOOLS: Read-only repository exploration, tool readiness checks, LSP/symbol tools, local command checks.
MUST DO: Read the project-root `MEMORY.md` before doing assigned work. Preserve proper nouns exactly. Prefer repository evidence. Install or bootstrap missing required tools before declaring them unavailable. Identify assumptions. Use `explorer` for read-only discovery and `worker` for bounded implementation or verification when available and useful. Tell every delegated agent to read the project-root `MEMORY.md` before work. Tell workers they are not alone in the codebase and must not revert others' edits. Use the OS locale for user-visible text.
MUST NOT DO: Edit production code. Ask the user. Expand scope.
CONTEXT: User request, MEMORY.md, relevant docs/memory notes, applied model guidance, repository root.
```

## Completion Criteria

- `PLAN.md` references the plan topic.
- `docs/plan/<topic>.md` includes goal, memory inputs, model guidance, tool readiness, complexity triage, selected path, agent assignments, module slices, and two checks per slice.
- The next implementation task can run without making planning decisions.
