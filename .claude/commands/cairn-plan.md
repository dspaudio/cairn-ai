# cairn-plan

Start by reading the project-root `MEMORY.md`, write an initial `PLAN.md` and `docs/plan/<topic>.md` with a planned triage task, persist the goal before exploration, then update the same plan after Light/Heavy Path triage and tool readiness checks before implementation.

Read the installed Cairn runtime locator at `{{CAIRN_RUNTIME_LOCATOR_JSON}}`. Resolve `resources.commands` from that JSON object and follow `cairn-plan.md` in that directory. Resolve model guidance and templates through the same locator. Do not resolve Cairn runtime resources from the target project. If the shared runtime or locator is missing, unreadable, or inconsistent, stop all dependent mirrors and recover with published/global `cairn doctor` followed by `cairn upgrade`; do not repair through another mirror.
