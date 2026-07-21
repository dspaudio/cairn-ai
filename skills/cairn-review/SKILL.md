---
name: cairn-review
description: Review completed Cairn tasks against MEMORY.md, PLAN.md, domain policy, and two-gate evidence.
---

# Cairn Review

Use this after meaningful implementation with Cairn.

## Purpose

Review is not another implementation loop. Confirm that the completed task satisfies the plan and that memory and plan artifacts are useful to the next agent.

Every review run and every delegated review agent must read the project-root `MEMORY.md` before doing assigned work.

When subagent tools are available, each agent may recursively delegate bounded review sub-tasks to subagents. Every child subagent must read the project-root `MEMORY.md`, keep the assigned scope, and preserve others' edits.

Resolve any `cairn://...` resource through `references/cairn-runtime.json` next to this `SKILL.md` (or this skill's `../..` source root during development). Never look for Cairn runtime resources in the target repository.

## Procedure

1. Read the completed task in `docs/plan/<topic>.md`.
2. Read `MEMORY.md` and relevant `docs/memory/*.md`.
3. Check changed files, tool readiness evidence, and evidence paths.
4. Delegate independent review when it materially improves speed or quality and the current tool policy allows it.
   - Use `explorer` for read-only impact analysis, pattern checks, and independent diff inspection.
   - Use `worker` for scoped verification command re-runs or QA artifact capture.
   - Recursive subagent delegation is allowed only for bounded sub-tasks when the current surface supports it.
   - Keep blocking review work local when the next step depends immediately on the result.
5. Report findings first, ordered by severity, with file and line references. If there are no issues, say so clearly and record remaining test gaps or residual risk.
6. Write user-visible responses and generated or updated documentation, plans, and memory artifacts in the OS locale unless the user asks for another language.

## Reviewer Prompt Format

```text
TASK: Review correctness, scope, and evidence for task <task-id>.
EXPECTED OUTCOME: Findings ordered by severity with file and line references, or an explicit no-issue result with residual risk.
REQUIRED TOOLS: Read-only diff inspection, tool readiness checks, verification command execution, plan/memory reading.
MUST DO: Read the project-root `MEMORY.md` before doing assigned work. Check tool readiness and install-attempt evidence. Check dry-run or check evidence when external state could change. Check both module evidence and surface evidence. Preserve proper nouns exactly. Use the OS locale for user-visible responses and generated or updated documentation, plans, and memory artifacts.
MUST NOT DO: Edit files. Ask the user. Approve skipped LSP/typecheck/lint without install evidence. Approve missing evidence or open-ended verification loops.
CONTEXT: docs/plan/<topic>.md, MEMORY.md, relevant docs/memory notes, changed files.
```

## Completion Criteria

- Findings are resolved or recorded as residual risk.
- Tool readiness evidence is present for required LSP/check/verification tools.
- Dry-run or check evidence is present when required, or the plan records why no dry-run exists.
- Failed gates followed the bounded loop policy and did not continue past two verification passes without a recorded blocker.
- Review evidence exists in `docs/plan/<topic>.md`.
- Goal-level final review evidence is stored as a successful structured evidence record before the goal is marked `completed`.
- The next agent can understand verification without rereading the full conversation.
