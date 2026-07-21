# Cairn

Cairn は Codex、Claude Code、Antigravity のためのトークン効率の高いマルチエージェント harness plugin です。

[English](README.md)

Cairn の基本方針は、hooks、永続状態、明示的な planning、focused delegation、stop-time guards といった有用な agent harness の動作を残すことです。Cairn は反復的な TDD verification loop を既定にしません。代わりに作業を小さな module task に分け、2 つの verification gate で証明します。

1. Module acceptance verification: 変更された module contract を証明します。
2. Surface integration verification: CLI、HTTP、browser、file artifacts など実際の surface を通して動作を証明します。

task が外部状態を変更する前に、Cairn は最も近い dry-run または check mode を記録して実行します。verification は制限されます。既定では各 task は 2 回の verification pass を持ち、その後は反復 loop を続けず blocker を記録するか task を分割します。

Cairn は tool readiness も作業の一部として扱います。LSP、typecheck、lint、dry-run、verification tools を repository stack に照らして確認します。必要な tool がない場合、fallback を受け入れる前に project-local または repository-native installation を試みます。

## LazyCodex Attribution

Cairn は LazyCodex（`https://github.com/code-yeongyu/lazycodex`）の影響を受けています。影響を受けた部分は installable agent-harness shape、Codex hook trust/setup handling、project memory、planning skills、executable workflow commands、diagnostics、local agent surfaces 全体の skill/agent packaging です。

Cairn は execution policy では LazyCodex と異なります。LazyCodex の role-chain execution model や open-ended completion loop は採用しません。代わりに Light/Heavy Path triage、bounded `explorer`/`worker` delegation、2 つの verification gates、明示的な stop conditions を使います。

## Complexity Triage

すべての implementation task は、agent、plugin、delegated workflow guidance を適用する前に complexity triage を通ります。triage は user に質問せず、repository exploration、想定される変更範囲、risk signals から決定します。

- Light Path: 既存 architecture layer 内の狭い変更です。既定値であり、直接実装するか 1 つの bounded `worker` を使い、その後 verification gate を維持します。
- Heavy Path: new directory/module/layer、new domain model/service/abstraction、security/session/auth、external API/message queue/payment、DB schema/migration、concurrency/transaction/cache changes、cross-domain refactor、または extra-care request です。

選択した path と理由は plan artifact がある場合に `docs/plan/<topic>.md` に記録します。Light Path でも 2 つの verification gate は維持されます。

## Tool Readiness

`cairn toolcheck` は現在の repository から JavaScript、TypeScript、Python、PHP、Java、Kotlin、Swift、Go、Rust stacks を検出し、対応する LSP と verification tools を確認します。

```sh
cairn toolcheck --root .
cairn toolcheck --install --yes --root .
```

- `toolcheck` は detected stacks と missing tools を報告します。
- `toolcheck --install` は package-manager dev dependencies、Composer dev dependencies、`uv`、Java LSP bootstrap、`go install`、`rustup component add` など、最も近い project-local または repository-native install path を試みます。
- Cairn plans は detected stack、required tools、install commands、blockers を記録します。
- LSP server がないことだけでは precise codebase exploration を省略できません。installation または同等の symbol-aware fallback を先に試す必要があります。

## Dry-Run And Loop Policy

- Migrations と database changes は write/apply commands の前に `--pretend`、dry-run、schema diff、rollback feasibility checks、または最も近い repository-native equivalent を使います。
- Package、release、infrastructure、deployment、code generation、formatting work は可能な場合、状態変更の前に check、plan、diff、validate、dry-run modes を使います。
- dry-run がない場合、plan はその事実を記録し、最小で reversible な command または test artifact を選びます。
- verification gate が失敗した場合、Cairn は一度診断し、task を縮小または分割して両方の gate を再実行します。
- 同じ task で 2 回の verification pass が失敗した場合、反復 loop を続けず `docs/plan/<topic>.md` に blocker を記録します。

## Model Guidance

Cairn は Claude-family と Codex-family models にのみ model-specific adjustment を適用します。

- Claude-family: long context、policy interpretation、plan/evidence review に有用です。
- Codex-family: small implementation tasks、explicit file edits、command-based verification、bounded `worker` tasks に有用です。

詳細はインストール済みプラグインの `cairn://docs/model-guidance/README.md`、`cairn://docs/model-guidance/claude.md`、`cairn://docs/model-guidance/codex.md` にあります。

## Repository Artifacts

harness は対象 repository root に次の files を作成して維持します。

- `MEMORY.md`: persistent domain knowledge の短い index。
- `docs/memory/*.md`: domain ごとの詳細 knowledge。
- `.cairn/state.json`: 再開と scoped stop gate のための git-ignored goal/task/evidence-record 状態。
- `PLAN.md`: active/completed work topics の短い index。
- `docs/plan/*.md`: detailed execution plans。

root files は短く保ち、詳細は `docs/` に移すことで、agents が必要な context だけを読めるようにします。

トークン効率のため、実装前に要件・不変条件・境界・失敗モードを test contract にします。`goal verify -- <argv>` の tool exit code を判定基準にし、成功は短く、失敗時だけ context を広げます。package lifecycle を確認し、通常の `npm pack --dry-run` を既定にします。content-producing または不明な script では `--ignore-scripts` を使わず、script がないか content-neutral と証明され、full-check evidence が新鮮な場合だけ使用します。

## Commands

published package は `bunx` または global install された `cairn` command で実行できます。

```sh
bunx cairn-ai@latest install
bunx cairn-ai@latest upgrade
bunx cairn-ai@latest doctor
bunx cairn-ai@latest uninstall
bunx cairn-ai@latest toolcheck
```

global installation 後は short commands も使えます。

```sh
bun add -g cairn-ai
cairn install
cairn upgrade
cairn doctor
cairn uninstall
cairn toolcheck
```

- `cairn install`: Codex marketplace cache に plugin を install し、hook trust state、Claude Code mirror files、Antigravity skills/workflows を設定します。
- `cairn upgrade`: 現在の source から installation、hook trust state、Claude Code mirror files、Antigravity skills/workflows を更新します。
- `cairn doctor`: Codex settings、installation、hook trust state、Claude Code mirror files、Antigravity mirror files を診断します。
- `cairn uninstall`: Cairn が追加した Codex settings、cache、Claude Code mirror files、Antigravity mirror files を削除します。
- `cairn toolcheck`: repository stacks を検出し、required LSP と verification tools を確認または install します。
- `cairn-memory`: domain knowledge を探索し `MEMORY.md` を更新します。
- `cairn-plan`: `docs/plan/` に decision-complete plan を作成します。
- `cairn-work`: 現在の `PLAN.md` の次の module task を実行し、2 つの verification gates を取得します。
- `cairn-review`: plan、memory、evidence に照らして completed tasks を review します。

`install` と `upgrade` は `~/.codex/config.toml` を変更する前に `*.cairn-backup-*` backups を作ります。source plugin manifest は validator-friendly のままにし、Codex hooks を有効化する `hooks` field は installed cache copy にだけ追加されます。

Codex は `skills/` と `commands/` を使います。Claude Code は `.claude/` 配下の mirrored commands と agent definitions を使います。Antigravity は `.agents/workflows` と global skills mirrors を使います。

## Antigravity Compatibility

Antigravity は `/workflow-name` で呼び出される `SKILL.md` based Agent Skills and Workflows をサポートします。Cairn はこの surface に次の paths を install します。

- Antigravity IDE: `~/.agents/skills/cairn-*`, `~/.agents/workflows/cairn-*.md`.
- Antigravity CLI: `~/.gemini/antigravity-cli/skills/cairn-*`, `~/.gemini/antigravity-cli/workflows/cairn-*.md`.

Codex-only hooks は Antigravity へ port されません。代わりに同じ planning、memory、complexity triage、two-gate verification procedures が Skills と Workflows を通して実行されます。paths を上書きするには `ANTIGRAVITY_HOME` または `ANTIGRAVITY_CLI_HOME` を設定してください。

## Locale Policy

Cairn の reusable instructions は global use のため英語で書かれています。user-visible output と生成または更新される documentation、plans、memory artifacts は、user が別の language を指定しない限り configured OS locale に従います。これには `MEMORY.md`、`PLAN.md`、`docs/memory`、`docs/plan` の内容が含まれます。CLI は `en`、`ko`、`ja`、`zh`、`es`、`fr`、`de`、`pt` の common messages を localize し、unsupported locales は English に fallback します。Codex hook `statusMessage` text は static English のまま、hook command output は English または Korean です。

## Delegation

- `explorer`: 利用可能な場合、read-only codebase discovery、impact analysis、pattern search、read-only verification を処理します。
- `worker`: 明確な file ownership を持つ bounded implementation または verification task を処理します。
- Main session: 次の step が結果に即座に依存する urgent blocking work を local で処理します。

すべての delegation prompt は TASK、EXPECTED OUTCOME、REQUIRED TOOLS、MUST DO、MUST NOT DO、CONTEXT の 6 sections を使います。
