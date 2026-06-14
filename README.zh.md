# Cairn

Cairn 是面向 Codex、Claude Code 和 Antigravity 的高 token 效率 multi-agent harness plugin。

[English](README.md)

Cairn 的核心思路是保留 LazyCodex 中有用的部分：hooks、persistent state、explicit planning、agent roles 和 stop-time guards。Cairn 不把重复的 TDD verification loops 作为默认流程，而是把工作拆成小的 module slices，并用两个 verification gates 证明每个 slice。

1. Module acceptance verification: 证明被修改的 module contract。
2. Surface integration verification: 通过 CLI、HTTP、browser 或 file artifacts 等真实 surface 证明行为。

在 slice 修改外部状态之前，Cairn 会记录并运行最接近的 dry-run 或 check mode。verification 是有边界的：默认每个 slice 有两次 verification pass，然后 agent 会记录 blocker 或拆分 slice，而不是继续开放式循环。

Cairn 也把 tool readiness 视为工作的一部分。它会根据 repository stack 检查 LSP、typecheck、lint、dry-run 和 verification tools。如果缺少必要工具，Cairn 会先尝试 project-local 或 repository-native installation，再接受 fallback。

## Complexity Triage

每个 user task 都先经过 complexity triage。triage 根据 repository exploration、expected change scope 和 risk signals 判断，不向用户询问可发现的信息。

- Fast route: single module、low risk、clear file scope 且 existing pattern 明确时使用 `planner -> builder`。
- Full route: multiple modules、data/permission/migration/external integration/architecture impact，或 domain policy 不清晰时使用 `architect -> planner -> reviewer -> builder -> reviewer`。

选中的 route 和理由会记录在 `docs/plan/<topic>.md`。即使是 fast route，`builder` 完成后也保留两个 verification gates。

## Tool Readiness

`cairn toolcheck` 会检查当前 repository 中的 JavaScript、TypeScript、Python、PHP、Java、Kotlin、Swift、Go 和 Rust stacks，然后检查匹配的 LSP 和 verification tools。

```sh
cairn toolcheck
cairn toolcheck --install
```

- `toolcheck` 报告 detected stacks 和 missing tools。
- `toolcheck --install` 尝试最接近的 project-local 或 repository-native install path，例如 package-manager dev dependencies、Composer dev dependencies、`uv`、Java LSP bootstrap、`go install` 或 `rustup component add`。
- Cairn plans 会记录 detected stack、required tools、install commands 和 blockers。
- 缺少 LSP server 不能作为跳过 precise codebase exploration 的理由，除非已尝试 installation 或等价的 symbol-aware fallback。

## Dry-Run And Loop Policy

- Migrations 和 database changes 在 write/apply commands 前使用 `--pretend`、dry-run、schema diff、rollback feasibility checks 或最接近的 repository-native equivalent。
- Package、release、infrastructure、deployment、code generation 和 formatting work 在可用时，先使用 check、plan、diff、validate 或 dry-run modes，再修改状态。
- 如果没有 dry-run，plan 会记录该事实，并选择最小且可逆的 command 或 test artifact。
- 如果 verification gate 失败，Cairn 会诊断一次，缩小或拆分 slice，然后重新运行两个 gates。
- 同一 slice 两次 verification pass 失败后，Cairn 会在 `docs/plan/<topic>.md` 中记录 blocker，而不是继续重复循环。

## Model Guidance

Cairn 只对 Claude-family 和 Codex-family models 应用 model-specific adjustment。

- Claude-family: 适合 `architect`、`planner` 和 `reviewer`。用于 long context、policy interpretation 和 plan/evidence review。
- Codex-family: 适合 `builder`、`worker` 和结构清晰的 `planner`。用于 small implementation slices、explicit file edits 和 command-based verification。

详细指南位于 `docs/model-guidance/README.md`、`docs/model-guidance/claude.md` 和 `docs/model-guidance/codex.md`。

## Repository Artifacts

harness 会在目标 repository root 创建并维护这些文件。

- `MEMORY.md`: persistent domain knowledge 的短索引。
- `docs/memory/*.md`: 按 domain 记录的详细 knowledge。
- `docs/model-guidance/*.md`: Claude 和 Codex model adjustment guidance。
- `PLAN.md`: active 和 completed work topics 的短索引。
- `docs/plan/*.md`: detailed execution plans。

root files 保持简短，细节移到 `docs/` 下，让 agents 只读取当前任务需要的 context。

## Commands

发布后的 package 可以用类似 LazyCodex 的方式执行。

```sh
bunx cairn-ai@latest install
bunx cairn-ai@latest upgrade
bunx cairn-ai@latest doctor
bunx cairn-ai@latest uninstall
bunx cairn-ai@latest toolcheck
```

全局安装后也可以使用短命令。

```sh
bun add -g cairn-ai
cairn install
cairn upgrade
cairn doctor
cairn uninstall
cairn toolcheck
```

- `cairn install`: 将 plugin 安装到 Codex marketplace cache，并配置 hook trust state、Claude Code mirror files 和 Antigravity skills/workflows。
- `cairn upgrade`: 从当前 source 更新 installation、hook trust state、Claude Code mirror files 和 Antigravity skills/workflows。
- `cairn doctor`: 诊断 Codex settings、installation、hook trust state、Claude Code mirror files 和 Antigravity mirror files。
- `cairn uninstall`: 移除 Cairn 添加的 Codex settings、cache、Claude Code mirror files 和 Antigravity mirror files。
- `cairn toolcheck`: 检测 repository stacks，并检查或安装 required LSP 和 verification tools。
- `cairn-memory`: 探索 domain knowledge 并更新 `MEMORY.md`。
- `cairn-plan`: 在 `docs/plan/` 下创建 decision-complete plan。
- `cairn-work`: 执行当前 `PLAN.md` 中的下一个 module slice，并收集两个 verification gates。
- `cairn-review`: 根据 plan、memory 和 evidence review completed slices。

`install` 和 `upgrade` 在修改 `~/.codex/config.toml` 前会创建 `*.cairn-backup-*` backups。source plugin manifest 保持 validator-friendly；只有 installed cache copy 会添加启用 Codex hooks 的 `hooks` field。

Codex 使用 `skills/` 和 `commands/`。Claude Code 使用 `.claude/` 下的 mirrored commands 和 agent definitions。Antigravity 使用 `.agents/workflows` 和 global skills mirrors。

## Antigravity Compatibility

Antigravity 支持通过 `/workflow-name` 调用的 `SKILL.md` based Agent Skills and Workflows。Cairn 会为该 surface 安装这些 paths。

- Antigravity IDE: `~/.agents/skills/cairn-*`, `~/.agents/workflows/cairn-*.md`.
- Antigravity CLI: `~/.gemini/antigravity-cli/skills/cairn-*`, `~/.gemini/antigravity-cli/workflows/cairn-*.md`.

Codex-only hooks 不会移植到 Antigravity。相同的 planning、memory、complexity triage 和 two-gate verification procedures 会通过 Skills 和 Workflows 运行。设置 `ANTIGRAVITY_HOME` 或 `ANTIGRAVITY_CLI_HOME` 可以覆盖 paths。

## Locale Policy

Cairn 的 reusable instructions 为了 global use 使用英文编写。除非用户明确要求其他语言，user-visible output 应遵循 configured OS locale。CLI 会本地化 `en`、`ko`、`ja`、`zh`、`es`、`fr`、`de` 和 `pt` 的 common messages，不支持的 locales fallback 到 English。Codex hook `statusMessage` text 保持 static English，而 hook command output 为 English 或 Korean。

## Agent Roles

- `architect`: 总结 system boundaries、risk 和 domain policy。
- `planner`: 将 explored facts 转换为 decision-complete plan。
- `builder`: 实现一个 small module slice。
- `reviewer`: 验证 behavior、policy 和 evidence。
- `worker`: 处理 search、small edits 和 QA 等 focused work。

每个 delegation prompt 都使用六个 sections: TASK、EXPECTED OUTCOME、REQUIRED TOOLS、MUST DO、MUST NOT DO、CONTEXT。
