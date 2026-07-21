# cairn-work

Start by reading the project-root `MEMORY.md`, then execute the next incomplete module task only after the plan records Light/Heavy Path complexity triage, tool readiness, module acceptance verification, and surface integration verification. Before implementation, spend reasoning on a focused executable test contract covering requirements, invariants, boundaries, and failure modes; confirm the intended failure and make only the minimum implementation that passes. Run verification through `goal verify -- ...`; treat tool exit codes and bounded machine summaries as authoritative, keep successes concise, and expand context only for failing tests. Inspect package lifecycle scripts and run normal `npm pack --dry-run` by default. Content-producing or unknown lifecycle scripts must never use `--ignore-scripts`; only absent or proven content-neutral scripts may use it while the prior full check remains fresh.

If the user asks a side question, status question, or narrow clarification while a task is still active, answer it briefly and then resume the previous active work unless the user explicitly asks to pause, stop, or switch tasks.

Read the installed Cairn runtime locator at `{{CAIRN_RUNTIME_LOCATOR_JSON}}`. Resolve `resources.commands` from that JSON object and follow `cairn-work.md` in that directory. Do not resolve Cairn command files from the target project.
