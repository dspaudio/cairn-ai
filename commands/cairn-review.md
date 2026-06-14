# cairn-review

Use the `cairn-review` skill.

Prerequisite: if `node scripts/cairn.mjs doctor` fails, restore installation with `node scripts/cairn.mjs install` or `node scripts/cairn.mjs upgrade`.

Goal: review completed work against plan, memory, policy, and evidence.

Procedure:

1. Read the plan slice and memory inputs.
2. Check changed files, tool readiness evidence, and verification evidence.
3. Delegate independent read-only review to `explorer` when it materially improves speed or quality; use `worker` only for scoped verification reruns or QA artifacts.
4. Report findings first, ordered by severity, with file and line references. If no issues are found, say so clearly and mention remaining test gaps or residual risk.
5. Record review evidence in `docs/plan/<topic>.md`.
6. Use the OS locale for user-visible output unless the user asks for another language.
