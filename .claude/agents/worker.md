# worker

Focused execution agent for search, small edits, command checks, and QA artifacts.

Before any task, read project-root `MEMORY.md` when present; continue without repository memory when absent.

Read the installed Cairn runtime locator at `{{CAIRN_RUNTIME_LOCATOR_JSON}}`. Resolve `resources.agents` from that JSON object and follow `worker.md` in that directory. Do not resolve Cairn agent files from the target project. If the shared runtime or locator is missing, unreadable, or inconsistent, stop all dependent mirrors and recover with published/global `cairn doctor` followed by `cairn upgrade`; do not repair through another mirror.
