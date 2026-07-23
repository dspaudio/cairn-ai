# cairn-plan

Use the `cairn-plan` skill.

Prerequisite: resolve the installed Cairn runtime from the plugin or skill locator. If `cairn doctor` fails, restore it with the published/global lifecycle command. Never look for Cairn scripts, templates, or model guidance in the target repository.

Goal: show an initial plan and goal before triage can be interrupted, then leave a decision-complete implementation plan before non-trivial implementation.

Complexity is staged, not decided once. Record a provisional request checkpoint, re-evaluate it at the planning checkpoint after exploration, and require a code checkpoint after exact file/caller/test inspection immediately before the first edit. Before editing, either route may change when evidence supports it. Every change must synchronize the plan artifact, repository goal task roadmap through `goal replan`, and native UI plan, including reviews and required evidence. After editing begins, a new Heavy Path signal only promotes Light Path to Heavy Path: stop further edits, mark affected evidence stale, synchronize all three roadmaps, and repeat the code checkpoint.

Models always inherit. Route reasoning effort per task: Light planning/implementation/verification=`medium`; Heavy planning/review/implementation=`high`; final verification/review=`xhigh`. Record requested/effective effort for every task. Only a new task/worker may receive requested effort through a supported host-native option; unsupported host/value means effective=`inherited` with no model/global config change. Route changes synchronize the plan artifact, repository goal task roadmap, native UI plan, and reasoning effort profile; preserve completed profiles and recalculate incomplete profiles.

Procedure:

1. Every agent must read the project-root `MEMORY.md` for domain knowledge and repository policy before repository exploration, tool selection, work, or delegation.
2. For implementation or continued execution, write an initial `docs/plan/<topic>.md` and `PLAN.md` entry from the request and `MEMORY.md`. Make `triage-plan` the first active task and specify its investigation scope, path-decision criteria, plan-update condition, and anticipated implementation/verification stages. This initial plan must be decision-complete for triage and explicitly not implementation-ready.
3. Before repository exploration, toolcheck, complexity triage, delegation, or a non-blocking user question, call Codex `update_plan` and then `create_goal` when those UI tools are available. Mirror the same roadmap into the repository Cairn goal. Record unavailable UI tools instead of silently implying UI synchronization. Skip goal activation for consultation, explanation, and plan-only requests.
4. Read relevant `docs/memory/*.md` as directed by the initial triage task.
5. Read the applicable installed model guidance.
6. Run the installed runtime's `toolcheck --root <repoRoot>` and handle missing tools through the explicit approval policy.
7. Explore the repository according to the initial triage task before asking the user.
8. Understand the whole work and affected surfaces, classify it into executable tasks/sub-tasks, run Light/Heavy Path triage, and update the same repository plan and Codex `update_plan` roadmap to a decision-complete implementation plan.
9. Use Light Path by default unless a Heavy Path condition clearly applies.
10. Apply delegation and orchestration policy only after the route is recorded. If subagent tools are unavailable or disallowed by a higher-priority policy, the main agent takes over and records it.
11. Do not begin implementation until the updated plan records selected path, checked Heavy Path signals, tool readiness, file scope, dry-run/check, module acceptance, surface integration, stable IDs, and fail-closed evidence.
12. For Heavy Path, include an explicit automated test command and `Tests:` evidence line.
13. Keep the repository goal and Codex UI plan statuses synchronized as triage and later tasks advance. Advance a UI step only after the matching repository Cairn task transition succeeds with its required bound evidence records.
14. Use the OS locale for user-visible responses and generated or updated documentation, plans, and memory artifacts unless the user asks for another language.
