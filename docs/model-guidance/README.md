# Model Guidance

Cairn only applies model-specific adjustment to Claude-family and Codex-family models.

The goal is not to make prompts long by model. The goal is to stabilize the same `MEMORY.md`/`PLAN.md` flow according to model strengths.

## Application Order

1. Identify the active model name. If the model name is not directly exposed, infer it from the user's default model setting and agent role frontmatter.
2. For Claude-family models, apply `docs/model-guidance/claude.md`.
3. For Codex-family models, apply `docs/model-guidance/codex.md`.
4. If the model is not clearly classified, apply only the common rules and skip model-specific adjustment.

## Common Rules

- Keep root `MEMORY.md` and `PLAN.md` as indexes only.
- Keep detailed judgment in `docs/memory/`, `docs/plan/`, and `docs/model-guidance/`.
- Preserve proper nouns, file names, variable names, service names, alert names, MCP tool names, and agent names exactly as written.
- Select Light Path or Heavy Path before implementation.
- Detect required LSP, typecheck, lint, dry-run, and verification tools before implementation.
- Missing required tools must trigger a project-local, repository-native, or ephemeral install attempt before they can be treated as unavailable.
- Every implementation task must pass module acceptance verification and surface integration verification.
- Before mutating external state, run the closest available dry-run, check, plan, diff, validate, or equivalent command.
- Limit each task to two verification passes by default. After two failed passes, record the blocker or split it into sub-tasks instead of continuing a repeated loop.
- User-visible output must follow the OS locale unless the user asks for another language.

## Delegation Defaults

- `explorer`: use for read-only codebase discovery, impact analysis, pattern searches, and read-only verification when available.
- `worker`: use for bounded implementation or verification tasks with clear file ownership.
- Main session: keep urgent blocking work local when the next step depends immediately on the result.
