# cairn-review

Review completed tasks against memory, plan, policy, tool readiness, and evidence.

Read the installed Cairn runtime locator at `{{CAIRN_RUNTIME_LOCATOR_JSON}}`. Resolve `resources.commands` from that JSON object and follow `cairn-review.md` in that directory. Do not resolve Cairn command files from the target project. If the shared runtime or locator is missing, unreadable, or inconsistent, stop all dependent mirrors and recover with published/global `cairn doctor` followed by `cairn upgrade`; do not repair through another mirror.
