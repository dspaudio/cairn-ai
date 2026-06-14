---
name: cairn-memory
description: Create and maintain repository MEMORY.md and docs/memory domain notes for token-efficient Codex, Claude Code, and Antigravity agent work.
---

# Cairn Memory

Use this when domain knowledge, repository policy, or pre-plan context compression is needed.

## Purpose

The root `MEMORY.md` is an index, not detailed knowledge. Record details in `docs/memory/<domain>.md`.

## Procedure

1. Run `scripts/cairn-state.sh manual` if it exists. Otherwise ensure `MEMORY.md`, `PLAN.md`, `docs/memory`, and `docs/plan` directly.
2. Explore the repository before asking the user.
3. Delegate when it materially improves speed or quality instead of asking the user.
   - `explorer`: read-only domain discovery, boundaries, invariants, policies, contradictions, and stale facts when available.
   - `worker`: exact file paths, commands, schemas, references, and bounded evidence capture.
4. Write detailed facts to `docs/memory/<domain>.md`.
5. Keep only one-line links and summaries in `MEMORY.md`.
6. Write user-visible output in the OS locale unless the user asks for another language.

## Delegation Prompt Format

```text
TASK: Explore persistent domain knowledge for <domain>.
EXPECTED OUTCOME: Return facts, source paths, and proof commands concisely.
REQUIRED TOOLS: Read-only file search, LSP/symbol tools, command checks.
MUST DO: Preserve proper nouns exactly. Cite local paths. Separate facts from inference. Use the OS locale for user-visible text.
MUST NOT DO: Edit files. Ask the user. Guess missing names.
CONTEXT: Current task, repository root, existing MEMORY.md entries.
```

## Completion Criteria

- `MEMORY.md` links to detailed notes.
- Detailed notes have clear scope and sources, and are shorter than reading the original files wholesale.
- Long explanations are not duplicated in the root index.
