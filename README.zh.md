# Cairn

Cairn 是面向 Codex、Claude Code 和 Antigravity 的高 token 效率 multi-agent harness plugin。

[English](README.md)

Cairn 的核心思路是保留有用的 agent harness 行为：hooks、persistent state、explicit planning、focused delegation 和 stop-time guards。Cairn 不把重复的 TDD verification loops 作为默认流程，而是把工作拆成小的 module tasks，并用两个 verification gates 证明每个 task。

1. Module acceptance verification: 证明被修改的 module contract。
2. Surface integration verification: 通过 CLI、HTTP、browser 或 file artifacts 等真实 surface 证明行为。

在 task 修改外部状态之前，Cairn 会记录并运行最接近的 dry-run 或 check mode。verification 是有边界的：默认每个 task 有两次 verification pass，然后 agent 会记录 blocker 或拆分 task，而不是继续开放式循环。

Cairn 也把 tool readiness 视为工作的一部分。它会根据 repository stack 检查 LSP、typecheck、lint、dry-run 和 verification tools。只有在获得明确批准且存在固定版本的受支持 installer 时才安装，否则报告 blocker。

## LazyCodex Attribution

Cairn 受到 LazyCodex（`https://github.com/code-yeongyu/lazycodex`）影响。受影响的部分包括 installable agent-harness shape、Codex hook trust/setup handling、project memory、planning skills、executable workflow commands、diagnostics，以及跨 local agent surfaces 的 skill/agent packaging。

Cairn 在 execution policy 上刻意不同于 LazyCodex。它不采用 LazyCodex 的 role-chain execution model 或 open-ended completion loop。Cairn 使用 Light/Heavy Path triage、bounded `explorer`/`worker` delegation、两个 verification gates 和 explicit stop conditions。

## Complexity Triage

每个 implementation task 都先经过 complexity triage，然后才应用 agent、plugin 或 delegated workflow guidance。triage 根据 repository exploration、expected change scope 和 risk signals 判断，不向用户询问可发现的信息。

- Light Path: existing architecture layers 内的窄范围修改。这是默认路径。可以直接实现，或使用一个 bounded `worker`，然后保留 verification gate。
- Heavy Path: new directory/module/layer、new domain model/service/abstraction、security/session/auth、external API/message queue/payment、DB schema/migration、concurrency/transaction/cache changes、cross-domain refactor，或明确的 extra-care request。

选中的 path 和理由会在存在 plan artifact 时记录在 `docs/plan/<topic>.md`。即使是 Light Path，也保留两个 verification gates。

## Tool Readiness

`cairn toolcheck` 会检查当前 repository 中的 JavaScript、TypeScript、Python、PHP、Java、Kotlin、Swift、Go 和 Rust stacks，然后检查匹配的 LSP 和 verification tools。

```sh
cairn toolcheck --root .
cairn toolcheck --install --yes --root .
```

- `toolcheck` 报告 detected stacks 和 missing tools。
- `toolcheck --install` 要求明确批准和 `--yes`；不受支持的 installer 不会执行，并返回 canonical `installer-unavailable`。
- Cairn plans 会记录 detected stack、required tools、install commands 和 blockers。
- 缺少 LSP server 不能作为跳过 precise codebase exploration 的理由，除非已尝试 installation 或等价的 symbol-aware fallback。

## Dry-Run And Loop Policy

- Migrations 和 database changes 在 write/apply commands 前使用 `--pretend`、dry-run、schema diff、rollback feasibility checks 或最接近的 repository-native equivalent。
- Package、release、infrastructure、deployment、code generation 和 formatting work 在可用时，先使用 check、plan、diff、validate 或 dry-run modes，再修改状态。
- 如果没有 dry-run，plan 会记录该事实，并选择最小且可逆的 command 或 test artifact。
- 如果 verification gate 失败，Cairn 会诊断一次，缩小或拆分 task，然后重新运行两个 gates。
- 同一 task 两次 verification pass 失败后，Cairn 会在 `docs/plan/<topic>.md` 中记录 blocker，而不是继续重复循环。

## Model Guidance

Cairn 只对 Claude-family 和 Codex-family models 应用 model-specific adjustment。

- Claude-family: 适合 long context、policy interpretation 和 plan/evidence review。
- Codex-family: 适合 small implementation tasks、explicit file edits、command-based verification 和 bounded `worker` tasks。

详细指南位于已安装插件的 `cairn://docs/model-guidance/README.md`、`cairn://docs/model-guidance/claude.md` 和 `cairn://docs/model-guidance/codex.md`。

## Repository Artifacts

harness 会在目标 repository root 创建并维护这些文件。

- `MEMORY.md`: persistent domain knowledge 的短索引。
- `docs/memory/*.md`: 按 domain 记录的详细 knowledge。
- `.cairn/state.json`: 用于中断恢复和 scoped stop gate 的 git-ignored goal/task/evidence-record 状态。
- `PLAN.md`: active 和 completed work topics 的短索引。
- `docs/plan/*.md`: detailed execution plans。

root files 保持简短，细节移到 `docs/` 下，让 agents 只读取当前任务需要的 context。

为节省 token，先把需求、不变量、边界和失败模式写成 test contract。以 `goal verify -- <argv>` 的 tool exit code 为判定依据，成功时保持简短，只在失败时扩展 context。检查 package lifecycle，并默认运行正常的 `npm pack --dry-run`。content-producing 或未知 script 不得使用 `--ignore-scripts`；只有 script 不存在或已证明为 content-neutral，且 full-check evidence 仍然新鲜时才可使用。

## Commands

发布后的 package 可以通过 `bunx` 或全局安装的 `cairn` commands 执行。

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

- `cairn install`: 以事务方式安装 custom marketplace source、versioned runtime、Cairn-owned config sections 和当前 host mirrors。
- `cairn upgrade`: staged validation 后只替换 ownership manifest 中未修改的 entry，失败时 rollback。
- `cairn doctor`: 只读验证 ownership digests、effective Codex features、真实 plugin status 和 runtime locators。
- `cairn uninstall`: 只删除未修改的 managed entry；modified 或 unmanaged target 会 preserve 并报告 conflict。
- `cairn toolcheck`: 检测 repository stacks 和 required tools；只执行已批准的 supported installer，否则返回 `installer-unavailable`。
- `cairn-memory`: 探索 domain knowledge 并更新 `MEMORY.md`。
- `cairn-plan`: 在 `docs/plan/` 下创建 decision-complete plan。
- `cairn-work`: 执行当前 `PLAN.md` 中的下一个 module task，并收集两个 verification gates。
- `cairn-review`: 根据 plan、memory 和 evidence review completed tasks。

custom marketplace lifecycle 将 source 与 versioned runtime 分离。每次 commit 前执行 staged validation，ownership manifest 绑定全部 managed digests，失败时执行 reverse-order rollback。modified 或 unmanaged artifacts 会 preserve 并报告 conflict。Cairn 只修改自身 TOML sections，不强制 public feature/agent settings。

Clean uninstall 仅在所有 managed scaffold directory 均为空时删除 Cairn marketplace cache root，并保留任何 unmanaged content。它不会自动删除 source repository 及其 state、全局 `cairn-ai` package、package-manager cache，或当前 ownership manifest 之外的 legacy backup/settings。

Codex 使用 `skills/` 和 `commands/`。Claude Code 使用 `.claude/` 下的 mirrored commands 和 agent definitions。Antigravity 使用 `.agents/workflows` 和 global skills mirrors。

## Antigravity Compatibility

Antigravity 支持通过 `/workflow-name` 调用的 `SKILL.md` based Agent Skills and Workflows。Cairn 会为该 surface 安装这些 paths。

- Antigravity IDE: `~/.gemini/config/skills/cairn-*/SKILL.md`。
- Antigravity CLI: `~/.gemini/antigravity-cli/skills/cairn-*.md` 下的扁平 skill 文件。

Codex-only hooks 不会移植到 Antigravity。相同的 planning、memory、complexity triage 和 two-gate verification procedures 会通过 Skills 和 Workflows 运行。设置 `ANTIGRAVITY_HOME` 或 `ANTIGRAVITY_CLI_HOME` 可以覆盖 paths。

## Locale Policy

Cairn 的 reusable instructions 为了 global use 使用英文编写。除非用户明确要求其他语言，user-visible output 以及生成或更新的 documentation、plans、memory artifacts 应遵循 configured OS locale。这包括 `MEMORY.md`、`PLAN.md`、`docs/memory` 和 `docs/plan` 内容。CLI 会本地化 `en`、`ko`、`ja`、`zh`、`es`、`fr`、`de` 和 `pt` 的 common messages，不支持的 locales fallback 到 English。Codex hook `statusMessage` text 保持 static English，而 hook command output 为 English 或 Korean。

## Delegation

- `explorer`: 可用时处理 read-only codebase discovery、impact analysis、pattern search 和 read-only verification。
- `worker`: 处理具有明确 file ownership 的 bounded implementation 或 verification task。
- Main session: 当下一步立即依赖结果时，本地处理 urgent blocking work。

每个 delegation prompt 都使用六个 sections: TASK、EXPECTED OUTCOME、REQUIRED TOOLS、MUST DO、MUST NOT DO、CONTEXT。
