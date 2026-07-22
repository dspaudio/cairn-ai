# Cairn

Cairn is a token-efficient multi-agent harness plugin for Codex, Claude Code, and Antigravity.

## Translations

- [한국어](README.ko.md)
- [日本語](README.ja.md)
- [中文](README.zh.md)
- [Español](README.es.md)
- [Français](README.fr.md)
- [Deutsch](README.de.md)
- [Português](README.pt.md)

The core idea is to keep useful agent-harness behavior: hooks, persistent state, explicit planning, focused delegation, and stop-time guards. Cairn does not make repeated TDD verification loops the default. Instead, it splits work into small module tasks and proves each task with two verification gates.

1. Module acceptance verification: proves the changed module contract.
2. Surface integration verification: proves behavior through the real surface, such as CLI, HTTP, browser, or file artifacts.

Before a task mutates external state, Cairn records and runs the closest available dry-run or check mode. Verification is bounded: each task gets two verification passes by default, then the agent records a blocker or splits it into sub-tasks instead of continuing an open-ended loop.

Cairn also treats tool readiness as part of the work. LSP, typecheck, lint, dry-run, and verification tools are checked against the repository stack. A missing tool is installed only after explicit approval and only when a pinned, supported installer exists; otherwise Cairn reports a blocker.

## LazyCodex Attribution

Cairn is influenced by LazyCodex (`https://github.com/code-yeongyu/lazycodex`). The borrowed ideas are the installable agent-harness shape, Codex hook trust/setup handling, project memory, planning skills, executable workflow commands, diagnostics, and skill/agent packaging across local agent surfaces.

Cairn intentionally diverges from LazyCodex in the execution policy. It does not adopt LazyCodex's role-chain execution model or open-ended completion loops. Cairn uses Light/Heavy Path triage, main-agent orchestration, bounded `explorer`/`worker` delegation, two verification gates, and explicit stop conditions instead.

## Complexity Triage

Every implementation task passes complexity triage first, before agent, plugin, or delegated workflow guidance. Triage is decided from repository exploration, expected change scope, and risk signals without asking the user.

- Light Path: narrow changes inside existing architecture layers. This is the default. The user-called/main agent still orchestrates and delegates implementation edits to one bounded `worker` whenever subagent tools are available, then keeps the verification gate.
- Heavy Path: new directory/module/layer, new domain model/service/abstraction, security/session/auth, external API/message queue/payment, DB schema/migration, concurrency/transaction/cache changes, cross-domain refactor, or explicit extra-care request.

The selected path and rationale are recorded in `docs/plan/<topic>.md` when a plan artifact exists. Even on Light Path, the two verification gates remain. If subagent tools are unavailable, the main agent takes over implementation directly and records that takeover in evidence.

When the subagent tool provides a progress-reporting channel, subagents report status to the orchestrator when starting work, when deciding or confirming direction, during periodic progress, and when finishing. The orchestrator immediately relays received status events to the user. If no mid-run reporting channel exists, the orchestrator relays observable events such as assignment, waiting, and final completion.

When a delegated subagent finishes, it provides a final report before leaving. After the orchestrator captures that final report and evidence, the completed subagent is closed or released. The orchestrator then reviews the final report and evidence before marking the work complete.

## Tool Readiness

`cairn toolcheck` inspects the current repository for JavaScript, TypeScript, Python, PHP, Java, Kotlin, Swift, Go, and Rust stacks, then checks the matching LSP and verification tools.

```sh
cairn toolcheck --root .
# After explicit approval only:
cairn toolcheck --install --yes --root .
```

- `toolcheck` reports detected stacks and missing tools.
- Default checks are read-only, bounded by a timeout, and do not execute repository-local wrappers merely to discover them.
- `toolcheck --install` requires both `--yes` and explicit user approval. Unpinned or checksum-free installers return the canonical `installer-unavailable` refusal rather than silently downloading `latest`.
- Cairn plans record detected stack, required tools, install commands, and blockers.
- A missing LSP server is not a valid reason to skip precise codebase exploration until installation or an equivalent symbol-aware fallback has been attempted.

## Dry-Run And Loop Policy

- Migrations and database changes use `--pretend`, dry-run, schema diff, rollback feasibility checks, or the closest repository-native equivalent before write/apply commands.
- Package, release, infrastructure, deployment, code generation, and formatting work use check, plan, diff, validate, or dry-run modes before mutating state when available.
- If no dry-run exists, the plan records that fact and selects the smallest reversible command or test artifact available.
- If a verification gate fails, Cairn diagnoses once, shrinks the task or splits it into sub-tasks, and reruns both gates.
- After two failed verification passes for the same task, Cairn records the blocker in `docs/plan/<topic>.md` instead of continuing a repeated loop.

## Model Guidance

Cairn only applies model-specific adjustment to Claude-family and Codex-family models.

- Claude-family: useful for long context, policy interpretation, and plan/evidence review.
- Codex-family: useful for small implementation tasks, explicit file edits, command-based verification, and bounded `worker` tasks.

Detailed guidance lives in the installed plugin and is referenced as `cairn://docs/model-guidance/README.md`, `cairn://docs/model-guidance/claude.md`, and `cairn://docs/model-guidance/codex.md`.

## Repository Artifacts

The harness creates and maintains these files at the target repository root.

- `MEMORY.md`: short index of persistent domain knowledge.
- `docs/memory/*.md`: detailed knowledge by domain.
- `PLAN.md`: short index of active and completed work topics.
- `docs/plan/*.md`: detailed execution plans.
- `.cairn/state.json`: git-ignored, versioned active goal/task/evidence-record state used for interruption recovery and scoped stop gates.

Runtime scripts, templates, commands, agents, and model guidance stay in the installed plugin root. Runtime locator files let Codex, Claude Code, and Antigravity share that installed copy without copying Cairn internals into the target repository.

## Commands

The published package can be executed with `bunx` or globally installed `cairn` commands.

```sh
bunx cairn-ai@latest install
bunx cairn-ai@latest upgrade
bunx cairn-ai@latest doctor
bunx cairn-ai@latest uninstall
bunx cairn-ai@latest toolcheck
```

After global installation, short commands are also available.

```sh
bun add -g cairn-ai
cairn install
cairn upgrade
cairn doctor
cairn uninstall
cairn toolcheck
```

- `cairn install`: transactionally installs the custom marketplace source, versioned Codex runtime cache, Cairn-owned config sections, Claude Code mirrors, and current Antigravity IDE/CLI skill surfaces.
- `cairn upgrade`: replaces only ownership-manifest entries whose installed digests still match, with staged validation and reverse-order rollback on failure.
- `cairn doctor`: validates the ownership manifest, managed digests, effective Codex features, actual installed/enabled/version plugin state, and mirror/runtime locators without repairing them.
- `cairn uninstall`: removes or restores only ownership-manifest entries that remain unmodified; modified or unmanaged targets are preserved as conflicts and failures roll back.
- `cairn toolcheck`: detects repository stacks and checks required LSP and verification tools; installation runs only for an approved supported installer.
- `cairn goal ...`: starts, inspects, pauses, resumes, blocks, cancels, and completes a persisted repository goal; the default tool-bound policy records successful evidence by executing `goal verify -- <argv>`. The legacy `goal receipt` command imports declared evidence only.
- `cairn-memory`: explores domain knowledge and updates `MEMORY.md`.
- `cairn-plan`: creates a decision-complete plan under `docs/plan/`.
- `cairn-work`: executes the next module task in the current `PLAN.md` with two verification gates.
- `cairn-review`: reviews completed tasks against plan, memory, and evidence.

On every `UserPromptSubmit`, Cairn injects model-visible guidance that an implementation or continued-execution request authorizes goal creation even if the user never says “goal.” The agent first writes an initial repository plan with triage as the active task, then—before exploration or triage—shows the same roadmap through Codex `update_plan` and `create_goal` when available and starts the repository Cairn goal. Triage updates both plans to a decision-complete implementation revision before implementation begins. An active goal keeps the full ordered roadmap, statuses, and current task in hook context so a side question returns to the original work. Consultation, explanation, and plan-only requests remain goal-free.

For token-efficient execution, Cairn puts reasoning into a focused executable test contract—requirements, invariants, boundaries, and failure modes—before implementation. Implementation receives the failing contract and bounded file scope, then makes the minimum passing change. Tool exit codes and machine summaries decide success; successful output stays concise and only failures expand context. Verification climbs from focused tests to one final full check. Before package verification, inspect lifecycle scripts and run normal `npm pack --dry-run` by default: content-producing or unknown scripts must never use `--ignore-scripts`; only absent or proven content-neutral scripts may use it while the full-check evidence remains fresh. Successful state mutations support `--quiet` so growing goal JSON does not consume the conversation budget.

Install and upgrade keep the custom marketplace lifecycle; they do not invoke `codex plugin add`. Candidates are staged and validated before commit, every managed destination and digest is recorded in an ownership manifest, and committed phases roll back in reverse order on failure. An exact unmodified supported legacy installation can be adopted after release-integrity validation; modified or unknown artifacts are preserved and rejected. Cairn edits only its own TOML sections and never forces public feature or agent settings. The source plugin manifest stays validator-friendly; only the installed cache copy gets a `hooks` field. Lifecycle commands must run from the published/global package, not from the cached copy that they replace.

Codex uses `skills/` and `commands/`. Claude Code uses mirrored commands and agent definitions under `.claude/`. Antigravity uses `.agents/workflows` and global skills mirrors.

## Antigravity Compatibility

Antigravity supports `SKILL.md`-based Agent Skills and Workflows invoked as `/workflow-name`. Cairn installs these paths for that surface.

- Antigravity IDE: `~/.gemini/config/skills/cairn-*/SKILL.md`.
- Antigravity CLI: flat `~/.gemini/antigravity-cli/skills/cairn-*.md` skill files.

Codex-only hooks are not ported to Antigravity. Instead, the same planning, memory, complexity triage, and two-gate verification procedures run through Skills and Workflows. Set `ANTIGRAVITY_HOME` or `ANTIGRAVITY_CLI_HOME` to override paths.

## Locale Policy

Cairn's reusable instructions are written in English for global use. User-visible output and generated or updated documentation, plans, and memory artifacts should follow the configured OS locale unless the user explicitly asks for another language. This includes `MEMORY.md`, `PLAN.md`, `docs/memory`, and `docs/plan` content. The CLI localizes common messages for `en`, `ko`, `ja`, `zh`, `es`, `fr`, `de`, and `pt`, and falls back to English for unsupported locales. Codex hook `statusMessage` text remains static English, while hook command output is English or Korean.

## Delegation

- `explorer`: handles read-only codebase discovery, impact analysis, pattern searches, and read-only verification when available.
- `worker`: handles actual implementation edits or verification tasks with clear file ownership.
- Main session: orchestrates, verifies, and records evidence; it keeps only urgent non-implementation blocking work local when the next step depends immediately on the result, except that unavailable subagent tools make the main agent take over implementation directly.

Every delegation prompt uses six sections: TASK, EXPECTED OUTCOME, REQUIRED TOOLS, MUST DO, MUST NOT DO, CONTEXT.
