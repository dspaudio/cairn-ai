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

The core idea is to keep useful agent-harness behavior: hooks, persistent state, explicit planning, focused delegation, and stop-time guards. Cairn does not make repeated TDD verification loops the default. Instead, it splits work into small module slices and proves each slice with two verification gates.

1. Module acceptance verification: proves the changed module contract.
2. Surface integration verification: proves behavior through the real surface, such as CLI, HTTP, browser, or file artifacts.

Before a slice mutates external state, Cairn records and runs the closest available dry-run or check mode. Verification is bounded: each slice gets two verification passes by default, then the agent records a blocker or splits the slice instead of continuing an open-ended loop.

Cairn also treats tool readiness as part of the work. LSP, typecheck, lint, dry-run, and verification tools are checked against the repository stack. If a required tool is missing, Cairn attempts project-local or repository-native installation before accepting a fallback.

## LazyCodex Attribution

Cairn is influenced by LazyCodex (`https://github.com/code-yeongyu/lazycodex`). The borrowed ideas are the installable agent-harness shape, Codex hook trust/setup handling, project memory, planning skills, executable workflow commands, diagnostics, and skill/agent packaging across local agent surfaces.

Cairn intentionally diverges from LazyCodex in the execution policy. It does not adopt LazyCodex's role-chain execution model or open-ended completion loops. Cairn uses Light/Heavy Path triage, bounded `explorer`/`worker` delegation, two verification gates, and explicit stop conditions instead.

## Complexity Triage

Every implementation task passes complexity triage first, before agent, plugin, or delegated workflow guidance. Triage is decided from repository exploration, expected change scope, and risk signals without asking the user.

- Light Path: narrow changes inside existing architecture layers. This is the default. Implement directly or use one bounded `worker`, then keep the verification gate.
- Heavy Path: new directory/module/layer, new domain model/service/abstraction, security/session/auth, external API/message queue/payment, DB schema/migration, concurrency/transaction/cache changes, cross-domain refactor, or explicit extra-care request.

The selected path and rationale are recorded in `docs/plan/<topic>.md` when a plan artifact exists. Even on Light Path, the two verification gates remain.

## Tool Readiness

`cairn toolcheck` inspects the current repository for JavaScript, TypeScript, Python, PHP, Java, Kotlin, Swift, Go, and Rust stacks, then checks the matching LSP and verification tools.

```sh
cairn toolcheck
cairn toolcheck --install
```

- `toolcheck` reports detected stacks and missing tools.
- `toolcheck --install` attempts the closest project-local or repository-native install path, such as package-manager dev dependencies, Composer dev dependencies, `uv`, Java LSP bootstrap, `go install`, or `rustup component add`.
- Cairn plans record detected stack, required tools, install commands, and blockers.
- A missing LSP server is not a valid reason to skip precise codebase exploration until installation or an equivalent symbol-aware fallback has been attempted.

## Dry-Run And Loop Policy

- Migrations and database changes use `--pretend`, dry-run, schema diff, rollback feasibility checks, or the closest repository-native equivalent before write/apply commands.
- Package, release, infrastructure, deployment, code generation, and formatting work use check, plan, diff, validate, or dry-run modes before mutating state when available.
- If no dry-run exists, the plan records that fact and selects the smallest reversible command or test artifact available.
- If a verification gate fails, Cairn diagnoses once, shrinks or splits the slice, and reruns both gates.
- After two failed verification passes for the same slice, Cairn records the blocker in `docs/plan/<topic>.md` instead of continuing a repeated loop.

## Model Guidance

Cairn only applies model-specific adjustment to Claude-family and Codex-family models.

- Claude-family: useful for long context, policy interpretation, and plan/evidence review.
- Codex-family: useful for small implementation slices, explicit file edits, command-based verification, and bounded `worker` tasks.

Detailed guidance lives in `docs/model-guidance/README.md`, `docs/model-guidance/claude.md`, and `docs/model-guidance/codex.md`.

## Repository Artifacts

The harness creates and maintains these files at the target repository root.

- `MEMORY.md`: short index of persistent domain knowledge.
- `docs/memory/*.md`: detailed knowledge by domain.
- `docs/model-guidance/*.md`: Claude and Codex model adjustment guidance.
- `PLAN.md`: short index of active and completed work topics.
- `docs/plan/*.md`: detailed execution plans.

Root files stay short and details move under `docs/`, so agents only read the context they need.

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

- `cairn install`: installs the plugin into the Codex marketplace cache and configures hook trust state, Claude Code mirror files, and Antigravity skills/workflows.
- `cairn upgrade`: updates the installation, hook trust state, Claude Code mirror files, and Antigravity skills/workflows from the current source.
- `cairn doctor`: diagnoses Codex settings, installation, hook trust state, Claude Code mirror files, and Antigravity mirror files.
- `cairn uninstall`: removes Cairn-added Codex settings, cache, Claude Code mirror files, and Antigravity mirror files.
- `cairn toolcheck`: detects repository stacks and checks or installs required LSP and verification tools.
- `cairn-memory`: explores domain knowledge and updates `MEMORY.md`.
- `cairn-plan`: creates a decision-complete plan under `docs/plan/`.
- `cairn-work`: executes the next module slice in the current `PLAN.md` with two verification gates.
- `cairn-review`: reviews completed slices against plan, memory, and evidence.

Install and upgrade create `*.cairn-backup-*` backups before modifying `~/.codex/config.toml`. The source plugin manifest stays validator-friendly; only the installed cache copy gets a `hooks` field to activate Codex hooks.

Codex uses `skills/` and `commands/`. Claude Code uses mirrored commands and agent definitions under `.claude/`. Antigravity uses `.agents/workflows` and global skills mirrors.

## Antigravity Compatibility

Antigravity supports `SKILL.md`-based Agent Skills and Workflows invoked as `/workflow-name`. Cairn installs these paths for that surface.

- Antigravity IDE: `~/.agents/skills/cairn-*`, `~/.agents/workflows/cairn-*.md`.
- Antigravity CLI: `~/.gemini/antigravity-cli/skills/cairn-*`, `~/.gemini/antigravity-cli/workflows/cairn-*.md`.

Codex-only hooks are not ported to Antigravity. Instead, the same planning, memory, complexity triage, and two-gate verification procedures run through Skills and Workflows. Set `ANTIGRAVITY_HOME` or `ANTIGRAVITY_CLI_HOME` to override paths.

## Locale Policy

Cairn's reusable instructions are written in English for global use. User-visible output should follow the configured OS locale unless the user explicitly asks for another language. The CLI localizes common messages for `en`, `ko`, `ja`, `zh`, `es`, `fr`, `de`, and `pt`, and falls back to English for unsupported locales. Codex hook `statusMessage` text remains static English, while hook command output is English or Korean.

## Delegation

- `explorer`: handles read-only codebase discovery, impact analysis, pattern searches, and read-only verification when available.
- `worker`: handles bounded implementation or verification tasks with clear file ownership.
- Main session: keeps urgent blocking work local when the next step depends immediately on the result.

Every delegation prompt uses six sections: TASK, EXPECTED OUTCOME, REQUIRED TOOLS, MUST DO, MUST NOT DO, CONTEXT.
