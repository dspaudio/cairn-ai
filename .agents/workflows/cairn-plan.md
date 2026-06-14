# cairn-plan

Use the `cairn-plan` skill.

Goal: leave a decision-complete plan for the current task in files before non-trivial implementation.

Procedure:

1. Every agent must read the project-root `MEMORY.md` for domain knowledge and repository policy before repository exploration, tool selection, work, or delegation.
2. Read relevant `docs/memory/*.md`.
3. If the active or assigned model is Claude-family, read `docs/model-guidance/claude.md`; if Codex-family, read `docs/model-guidance/codex.md`.
4. Run `node scripts/cairn.mjs toolcheck` when available.
5. If required LSP/check tools are missing, run `node scripts/cairn.mjs toolcheck --install` or a repository-native install command before accepting a fallback.
6. Explore before asking the user.
7. Run complexity triage before applying agent, plugin, or delegated workflow guidance, and record it before mutating files.
8. Use Light Path by default unless a Heavy Path condition clearly applies.
9. Use `explorer` for independent read-only discovery, impact analysis, pattern search, and read-only verification when available.
10. Use `worker` for bounded implementation or verification tasks with clear file ownership. Tell every delegated agent to read the project-root `MEMORY.md` before work. Keep urgent blocking work local.
11. Write `docs/plan/<topic>.md`.
12. Add the topic link and status to `PLAN.md`.
13. Put the selected Light/Heavy Path, checked Heavy Path signals, tool readiness, module acceptance verification, and surface integration verification on every module slice.
14. Use the OS locale for user-visible output unless the user asks for another language.
