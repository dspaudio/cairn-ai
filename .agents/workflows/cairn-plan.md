# cairn-plan

Use the `cairn-plan` skill.

Goal: leave a decision-complete plan for the current task in files.

Procedure:

1. Read `MEMORY.md` and relevant `docs/memory/*.md`.
2. If the active or assigned model is Claude-family, read `docs/model-guidance/claude.md`; if Codex-family, read `docs/model-guidance/codex.md`.
3. Run `node scripts/cairn.mjs toolcheck` when available.
4. If required LSP/check tools are missing, run `node scripts/cairn.mjs toolcheck --install` or a repository-native install command before accepting a fallback.
5. Explore before asking the user.
6. Run complexity triage before applying agent, plugin, or delegated workflow guidance.
7. Use Light Path by default unless a Heavy Path condition clearly applies.
8. Use `explorer` for independent read-only discovery, impact analysis, pattern search, and read-only verification when available.
9. Use `worker` for bounded implementation or verification tasks with clear file ownership. Keep urgent blocking work local.
10. Write `docs/plan/<topic>.md`.
11. Add the topic link and status to `PLAN.md`.
12. Put tool readiness, module acceptance verification, and surface integration verification on every module slice.
13. Use the OS locale for user-visible output unless the user asks for another language.
