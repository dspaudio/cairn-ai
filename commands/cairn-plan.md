# cairn-plan

Use the `cairn-plan` skill.

Prerequisite: if `node scripts/cairn.mjs doctor` fails, restore installation with `node scripts/cairn.mjs install` or `node scripts/cairn.mjs upgrade`.

Goal: leave a decision-complete plan for the current task in files before non-trivial implementation.

Procedure:

1. Every agent must read the project-root `MEMORY.md` for domain knowledge and repository policy before repository exploration, tool selection, work, or delegation.
2. Read relevant `docs/memory/*.md`.
3. If the active or assigned model is Claude-family, read `docs/model-guidance/claude.md`; if Codex-family, read `docs/model-guidance/codex.md`.
4. Run `node scripts/cairn.mjs toolcheck` when available.
5. If required LSP/check tools are missing, run `node scripts/cairn.mjs toolcheck --install` or a repository-native install command before accepting a fallback.
6. Explore before asking the user.
7. Understand the whole work and affected surfaces first, then classify it into small executable tasks. If a task is still too broad to verify cleanly, split it into sub-tasks.
8. Run complexity triage before applying agent, plugin, or delegated workflow guidance, and record it before mutating files.
9. Use Light Path by default unless a Heavy Path condition clearly applies.
10. Use `explorer` for independent read-only discovery, impact analysis, pattern search, and read-only verification when available.
11. Treat the user-called/main agent as the orchestrator: it plans, assigns, verifies, relays received subagent status events or observable lifecycle events to the user, and records evidence. Use `worker` for actual implementation edits with clear file ownership whenever subagent tools are available, on both Light Path and Heavy Path. When the subagent tool provides a progress-reporting channel, require subagents to report status when starting work, when deciding or confirming direction, during periodic progress, and when finishing; immediately relay received status events to the user. If no mid-run reporting channel exists, relay observable events such as assignment, waiting, and final completion. Require delegated subagents to provide a final report before leaving; after capturing the final report and evidence, close or release the completed subagent, then review the final report and evidence before marking the work complete. When subagent tools are available, each agent may recursively delegate bounded sub-tasks to subagents. Tell every delegated agent and child subagent to read the project-root `MEMORY.md` before work, keep scope, and preserve others' edits. If subagent tools are unavailable, the main agent takes over implementation directly and records that takeover in evidence.
12. Write `docs/plan/<topic>.md`.
13. Add the topic link and status to `PLAN.md`.
14. Put the selected Light/Heavy Path, checked Heavy Path signals, tool readiness, module acceptance verification, and surface integration verification on every module task.
15. For Heavy Path, include an explicit automated test command and `Tests:` evidence line; Heavy Path completion must not rely on generic verification wording alone.
16. Use the OS locale for user-visible responses and generated or updated documentation, plans, and memory artifacts unless the user asks for another language.
