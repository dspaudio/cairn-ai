# cairn-review

Use the `cairn-review` skill.

Prerequisite: if `scripts/cairn doctor` fails, restore installation with `scripts/cairn install` or `scripts/cairn upgrade`.

Goal: review completed work against plan, memory, policy, and evidence.

Procedure:

1. Read the plan slice and memory inputs.
2. Check changed files, tool readiness evidence, and verification evidence.
3. Delegate independent review to `reviewer`, `worker`, and `architect` when needed.
4. Report findings first.
5. Record review evidence in `docs/plan/<topic>.md`.
6. Use the OS locale for user-visible output unless the user asks for another language.
