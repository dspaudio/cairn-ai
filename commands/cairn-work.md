# cairn-work

Use the `cairn-work` skill.

Prerequisite: resolve the installed Cairn runtime from the plugin or skill locator. If `cairn doctor` fails, restore it with the published/global lifecycle command. Never look for Cairn scripts or model guidance in the target repository.

Goal: execute the active goal's current task without bypassing complexity triage, then keep advancing tasks until goal-level final review completes or the goal is explicitly paused, blocked, or cancelled.

Procedure:

1. Every agent must read the project-root `MEMORY.md` for domain knowledge and repository policy before selecting or executing a task.
2. Read `PLAN.md`, the detailed plan, and relevant memory notes.
3. Resolve and read the `cairn://` Codex or Claude model guidance recorded in the plan through the installed runtime.
4. Read Cairn goal status and select only its current task. If implementation was requested but no goal exists, create it from the decision-complete plan.
5. Confirm required tool readiness. If a required LSP/check tool is missing, report it and obtain explicit user approval before `toolcheck --install --yes` or a repository-native install command.
6. Confirm the complexity triage and selected Light/Heavy Path recorded in the plan. If missing, update the plan before mutating files.
7. Before implementation, spend reasoning on a focused executable test contract covering requirements, invariants, boundaries, and failure modes. Confirm the intended failure, then constrain implementation to the minimum change that passes it.
8. For Light Path, keep the main agent in the orchestrator role and use one bounded `worker` when allowed; for Heavy Path, follow the recorded staged review gates.
9. Give implementation the test contract, failing evidence, exact file ownership, and constraints. Require minimal implementation and no repeated broad discovery. Preserve status, final-report, close-and-review, recursive bounded delegation, and main-agent fallback rules.
10. Treat tool exit codes and bounded summaries as authoritative. Keep success output concise; expand only the failing test and related code context.
11. For Heavy Path, run the recorded automated test command and record explicit `Tests:` evidence.
12. Run focused module acceptance, then one final surface integration check through `goal verify -- ...`. Verification defaults to 600,000 ms (10 minutes), may be shortened with `--timeout-ms`, and is capped at 3,600,000 ms (1 hour). The command runs without holding the state lock; evidence is recorded only if the starting goal/task identity and the pre/post watched fingerprint still match.
13. Before package verification, inspect package lifecycle scripts. Run normal `npm pack --dry-run` by default. Content-producing or unknown lifecycle scripts must never use `--ignore-scripts`; only absent or proven content-neutral scripts may use it when the prior full check remains fresh.
14. Record evidence at the semantic boundary that proves the claimed behavior, bound to goal/task/plan. Missing, failed, skipped, stale, or placeholder evidence never completes work; relevant mutation invalidates affected evidence.
15. Complete the task and continue the goal. Use `--quiet` on successful state mutations; workers report only their assigned task and never select the next one.
16. Update the plan, goal state, and `PLAN.md` only after evidence exists.
17. Answer side questions briefly and resume unless explicitly asked to pause, stop, or switch.
18. Use the OS locale for user-visible responses and generated or updated documentation, plans, and memory artifacts unless the user asks for another language.
