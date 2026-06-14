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
- Select either the fast route or full route before implementation.
- Every implementation slice must pass module acceptance verification and surface integration verification.
- User-visible output must follow the OS locale unless the user asks for another language.

## Role Defaults

- `architect`: prefer Claude-family models for long context, policy, and boundary judgment.
- `planner`: Claude or Codex can work. With Codex-family models, make plan format and stop conditions more explicit.
- `builder`: prefer Codex-family models. Keep file edits small and explicit.
- `reviewer`: prefer Claude-family models. Check missing evidence, plan mismatch, and name preservation.
- `worker`: choose by task. Prefer Codex-family models for search/mechanical work and Claude-family models for long-form review.
