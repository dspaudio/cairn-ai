# Cairn

Cairn は Codex、Claude Code、Antigravity のためのトークン効率の高いマルチエージェント harness plugin です。

[English](README.md)

Cairn の基本方針は、LazyCodex の有用な要素である hooks、永続状態、明示的な planning、agent roles、stop-time guards を残すことです。Cairn は反復的な TDD verification loop を既定にしません。代わりに作業を小さな module slice に分け、2 つの verification gate で証明します。

1. Module acceptance verification: 変更された module contract を証明します。
2. Surface integration verification: CLI、HTTP、browser、file artifacts など実際の surface を通して動作を証明します。

slice が外部状態を変更する前に、Cairn は最も近い dry-run または check mode を記録して実行します。verification は制限されます。既定では各 slice は 2 回の verification pass を持ち、その後は反復 loop を続けず blocker を記録するか slice を分割します。

Cairn は tool readiness も作業の一部として扱います。LSP、typecheck、lint、dry-run、verification tools を repository stack に照らして確認します。必要な tool がない場合、fallback を受け入れる前に project-local または repository-native installation を試みます。

## Complexity Triage

すべての user task は最初に complexity triage を通ります。triage は user に質問せず、repository exploration、想定される変更範囲、risk signals から決定します。

- Fast route: single module、low risk、clear file scope、明確な existing pattern の場合は `planner -> builder` を使います。
- Full route: multiple modules、data/permission/migration/external integration/architecture impact、または domain policy が不明確な場合は `architect -> planner -> reviewer -> builder -> reviewer` を使います。

選択した route と理由は `docs/plan/<topic>.md` に記録します。Fast route でも `builder` 完了後の 2 つの verification gate は維持されます。

## Tool Readiness

`cairn toolcheck` は現在の repository から JavaScript、TypeScript、Python、PHP、Java、Kotlin、Swift、Go、Rust stacks を検出し、対応する LSP と verification tools を確認します。

```sh
cairn toolcheck
cairn toolcheck --install
```

- `toolcheck` は detected stacks と missing tools を報告します。
- `toolcheck --install` は package-manager dev dependencies、Composer dev dependencies、`uv`、Java LSP bootstrap、`go install`、`rustup component add` など、最も近い project-local または repository-native install path を試みます。
- Cairn plans は detected stack、required tools、install commands、blockers を記録します。
- LSP server がないことだけでは precise codebase exploration を省略できません。installation または同等の symbol-aware fallback を先に試す必要があります。

## Dry-Run And Loop Policy

- Migrations と database changes は write/apply commands の前に `--pretend`、dry-run、schema diff、rollback feasibility checks、または最も近い repository-native equivalent を使います。
- Package、release、infrastructure、deployment、code generation、formatting work は可能な場合、状態変更の前に check、plan、diff、validate、dry-run modes を使います。
- dry-run がない場合、plan はその事実を記録し、最小で reversible な command または test artifact を選びます。
- verification gate が失敗した場合、Cairn は一度診断し、slice を縮小または分割して両方の gate を再実行します。
- 同じ slice で 2 回の verification pass が失敗した場合、反復 loop を続けず `docs/plan/<topic>.md` に blocker を記録します。

## Model Guidance

Cairn は Claude-family と Codex-family models にのみ model-specific adjustment を適用します。

- Claude-family: `architect`、`planner`、`reviewer` に適しています。long context、policy interpretation、plan/evidence review に使います。
- Codex-family: `builder`、`worker`、構造が明確な `planner` に適しています。small implementation slices、explicit file edits、command-based verification に使います。

詳細は `docs/model-guidance/README.md`、`docs/model-guidance/claude.md`、`docs/model-guidance/codex.md` にあります。

## Repository Artifacts

harness は対象 repository root に次の files を作成して維持します。

- `MEMORY.md`: persistent domain knowledge の短い index。
- `docs/memory/*.md`: domain ごとの詳細 knowledge。
- `docs/model-guidance/*.md`: Claude と Codex model adjustment guidance。
- `PLAN.md`: active/completed work topics の短い index。
- `docs/plan/*.md`: detailed execution plans。

root files は短く保ち、詳細は `docs/` に移すことで、agents が必要な context だけを読めるようにします。

## Commands

published package は LazyCodex と同じような形式で実行できます。

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
- `cairn-work`: 現在の `PLAN.md` の次の module slice を実行し、2 つの verification gates を取得します。
- `cairn-review`: plan、memory、evidence に照らして completed slices を review します。

`install` と `upgrade` は `~/.codex/config.toml` を変更する前に `*.cairn-backup-*` backups を作ります。source plugin manifest は validator-friendly のままにし、Codex hooks を有効化する `hooks` field は installed cache copy にだけ追加されます。

Codex は `skills/` と `commands/` を使います。Claude Code は `.claude/` 配下の mirrored commands と agent definitions を使います。Antigravity は `.agents/workflows` と global skills mirrors を使います。

## Antigravity Compatibility

Antigravity は `/workflow-name` で呼び出される `SKILL.md` based Agent Skills and Workflows をサポートします。Cairn はこの surface に次の paths を install します。

- Antigravity IDE: `~/.agents/skills/cairn-*`, `~/.agents/workflows/cairn-*.md`.
- Antigravity CLI: `~/.gemini/antigravity-cli/skills/cairn-*`, `~/.gemini/antigravity-cli/workflows/cairn-*.md`.

Codex-only hooks は Antigravity へ port されません。代わりに同じ planning、memory、complexity triage、two-gate verification procedures が Skills と Workflows を通して実行されます。paths を上書きするには `ANTIGRAVITY_HOME` または `ANTIGRAVITY_CLI_HOME` を設定してください。

## Locale Policy

Cairn の reusable instructions は global use のため英語で書かれています。user-visible output は user が別の language を指定しない限り configured OS locale に従います。CLI は `en`、`ko`、`ja`、`zh`、`es`、`fr`、`de`、`pt` の common messages を localize し、unsupported locales は English に fallback します。Codex hook `statusMessage` text は static English のまま、hook command output は English または Korean です。

## Agent Roles

- `architect`: system boundaries、risk、domain policy を要約します。
- `planner`: explored facts を decision-complete plan に変換します。
- `builder`: 1 つの small module slice を実装します。
- `reviewer`: behavior、policy、evidence を検証します。
- `worker`: search、small edits、QA など focused work を処理します。

すべての delegation prompt は TASK、EXPECTED OUTCOME、REQUIRED TOOLS、MUST DO、MUST NOT DO、CONTEXT の 6 sections を使います。
