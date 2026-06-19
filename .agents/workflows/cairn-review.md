# cairn-review

Use the `cairn-review` skill.

Goal: review completed work against plan, memory, policy, and evidence.

Procedure:

1. Every agent must read the project-root `MEMORY.md` for domain knowledge and repository policy before review work, then read the plan task and memory inputs.
2. Check changed files, tool readiness evidence, and verification evidence.
3. Delegate independent read-only review to `explorer` when it materially improves speed or quality; use `worker` only for scoped verification reruns or QA artifacts. When subagent tools are available, each agent may recursively delegate bounded sub-tasks to subagents. Tell every delegated agent and child subagent to read the project-root `MEMORY.md` before work, keep scope, and preserve others' edits.
4. Report findings first, ordered by severity, with file and line references. If no issues are found, say so clearly and mention remaining test gaps or residual risk.
5. Record review evidence in `docs/plan/<topic>.md`.
6. Use the OS locale for user-visible responses and generated or updated documentation, plans, and memory artifacts unless the user asks for another language.
