---
name: cairn-review
description: Review completed Cairn slices against MEMORY.md, PLAN.md, domain policy, and two-gate evidence.
---

# Cairn Review

Use this after meaningful implementation with Cairn.

## Purpose

Review is not another implementation loop. Confirm that the completed slice satisfies the plan and that memory and plan artifacts are useful to the next agent.

## Procedure

1. Read the completed slice in `docs/plan/<topic>.md`.
2. Read `MEMORY.md` and relevant `docs/memory/*.md`.
3. Check changed files and evidence paths.
4. Delegate independent review.
   - `reviewer`: plan compliance and domain policy.
   - `worker`: dry-run or check confirmation and verification command re-run.
   - `architect`: boundary or architecture regression when needed.
5. Report findings first. If there are no issues, say so clearly and record residual risk.
6. Write user-visible output in the OS locale unless the user asks for another language.

## Reviewer Prompt Format

```text
TASK: Review correctness, scope, and evidence for slice <slice-id>.
EXPECTED OUTCOME: Findings ordered by severity, or an explicit no-issue result.
REQUIRED TOOLS: Read-only diff inspection, verification command execution, plan/memory reading.
MUST DO: Check dry-run or check evidence when external state could change. Check both module evidence and surface evidence. Preserve proper nouns exactly. Use the OS locale for user-visible text.
MUST NOT DO: Edit files. Ask the user. Approve missing evidence or open-ended verification loops.
CONTEXT: docs/plan/<topic>.md, MEMORY.md, relevant docs/memory notes, changed files.
```

## Completion Criteria

- Findings are resolved or recorded as residual risk.
- Dry-run or check evidence is present when required, or the plan records why no dry-run exists.
- Failed gates followed the bounded loop policy and did not continue past two verification passes without a recorded blocker.
- Review evidence exists in `docs/plan/<topic>.md`.
- The next agent can understand verification without rereading the full conversation.
