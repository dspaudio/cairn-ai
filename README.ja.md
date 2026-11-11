# Cairn

Cairn は Codex、Claude Code、Antigravity のためのトークン効率の高いマルチエージェント harness plugin です。

[English](README.md)

Cairn の基本方針は、hooks、永続状態、明示的な planning、focused delegation、stop-time guards といった有用な agent harness の動作を残すことです。Cairn は反復的な TDD verification loop を既定にしません。代わりに作業を小さな module task に分け、2 つの verification gate で証明します。

1. Module acceptance verification: 変更された module contract を証明します。
2. Surface integration verification: CLI、HTTP、browser、file artifacts など実際の surface を通して動作を証明します。

task が外部状態を変更する前に、Cairn は最も近い dry-run または check mode を記録して実行します。verification は制限されます。既定では各 task は 2 回の verification pass を持ち、その後は反復 loop を続けず blocker を記録するか task を分割します。

Cairn は tool readiness も作業の一部として扱います。LSP、typecheck、lint、dry-run、verification tools を repository stack に照らして確認します。installation は明示的な承認と固定された対応 installer がある場合だけ実行し、それ以外は blocker を報告します。

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
- `toolcheck --install` は明示的な承認と `--yes` を必要とし、非対応 installer は実行せず canonical `installer-unavailable` を返します。
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

- `MEMORY.md`: persistent domain knowledge の短い index。`## Domain Knowledge` の下に note ごとに 1 行(`- [<name>](docs/memory/<name>.md): <summary>`)を置き、repository の `## Policy` も含みます。
- `docs/memory/*.md`: domain ごとの詳細 knowledge。各 note は H1 の下に 1 行の `Summary:`(120 文字以内)を置き、index と hook がそれを表示します。
- `~/.cairn/projects/<project-id>/worktrees/<worktree-id>/state.json`: 中断復旧と scoped stop gate に使う user-home の project/worktree 別 active goal/task/evidence 状態。project working tree は runtime state を所有しません。
- `PLAN.md`: work plans の短い index。`## Active Plans` と `## Completed Plans` の下に plan ごとに 200 文字以内の 1 行を置きます。planning rules は `PLAN.md` ではなく `cairn-plan` skill にあります。
- `docs/plan/*.md`: detailed execution plans。
- `docs/plan/ARCHIVE.md`: `cairn plan index --archive` が `PLAN.md` から移した古い completed entries を新しい順に保持し、legacy `## Planning Rules` section の本文を `## Legacy Planning Rules` の下に置きます。最初の `## ` 見出しより前の list 行は index 済みとして扱われます。
- `~/.cairn/projects/<project-id>/worktrees/<worktree-id>/history.jsonl`: completed/cancelled goal ごとの要約 record(worktree ごとに最新 200 件)。`goal stats --history` が読みます。

`## Completed Plans` は新しい順に保ちます。`cairn plan index --archive` は先頭 20 件を残し、残りを何も削除せずに `docs/plan/ARCHIVE.md` へ移すため、古い順に並べた list では最新の plans が archive されます。先に `--dry-run` で確認してください。既存の `MEMORY.md`/`PLAN.md` は migration なしで動作します。`init` は既存 file を書き換えず、`check` は古い形式を warning としてのみ報告します。

`SessionStart` で hook は、どの memory notes があるか(name と `Summary:`、list が長い場合は name だけの 1 行)を agent に知らせ、active goal がなければ plan index の 1 行(plan 数、active plans、最新の completed plans、存在すれば `docs/plan/ARCHIVE.md`)を追加します。active・paused・blocked goal や別 session が所有する goal がある場合は memory list だけを載せ、別 session の capsule に plan 名は出しません。goal がないときの `UserPromptSubmit` は note 数を伝える 1 文だけを追加します。hook は index files と directory listing だけを読み、note 本文は読まず、何も書き込みません。notes と plans がない repository の hook 出力は以前と同じです。

`cairn-work` は `goal finish` の前に goal ごとに 1 回、memory promotion の決定を plan の Evidence に記録します。再利用できる repository knowledge ができた場合は `Memory promotion: docs/memory/<domain>.md`、そうでなければ `Memory promotion: none: <reason>` です。決定の記録は必須で、note の作成は任意です。goal が完了したのに plan file に記入済みの `Memory promotion:` 行がない場合、`goal finish` と `goal complete` は stderr に 1 行の reminder を出しますが、exit code と stdout は変わりません。

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

- `cairn install`: custom marketplace source、versioned runtime、Cairn-owned config sections、現行 host mirrors を transaction で install します。
- `cairn upgrade`: staged validation 後、ownership manifest の未変更 entry だけを置換し、失敗時は rollback します。
- `cairn doctor`: ownership digests、effective Codex features、実際の plugin status、runtime locators を修復せず診断します。
- `cairn uninstall`: 未変更の managed entry だけを削除し、modified または unmanaged target は conflict として preserve します。
- `cairn toolcheck`: repository stacks と required tools を確認し、承認済み supported installer だけを実行します。それ以外は `installer-unavailable` です。
- `cairn cleanup --root <repo>`: 既定では legacy project-local `.cairn` residue を read-only で報告します。`--yes` は valid active state を user-home store に移行・調整し、known state/lock/tool residue のみ削除し、unknown files を保持して空の場合だけ directory を削除します。
- `cairn memory check|index [--root <repo>]`: `check` は `MEMORY.md` と `docs/memory/*.md` を照合して JSON report を 1 つ出力します。unindexed notes、dead links、duplicates、stale summaries、summary 内の制御文字、unsafe paths があれば exit 1 で、warnings は `--strict` のときだけ失敗します。entries は `## Domain Knowledge` の下の list 行です(その section がない古い file ではすべての list 行)。他の section の note link は言及であり、`index` は書き換えません。`index` は抜けている notes を追加し、`Summary:` が変わると link の後ろの summary 部分だけを置き換えます(link が複数ある行はそのまま)。その section 内で完全に一致する Cairn placeholder 行だけを削除し、entries や dead links は削除せず、それ以外は byte 単位で保持します。`--dry-run` で事前確認できます。挿入位置が閉じていない code fence の中なら、`index` は何も書かず `unclosed-fence` で exit 1 になります。usage error は exit 2 で、subcommand なしの `cairn memory` は従来の案内を出力します。
- `cairn plan check|index [--archive] [--root <repo>]`: `PLAN.md` と `docs/plan/*.md` に同じ check と index を適用し、entries は見出しが `Plans` で終わる `## ` section(`## Superseded Plans` など)の list 行です。`index` は checkbox がすべて checked の plan を `## Completed Plans` の先頭に、それ以外を `## Active Plans` に追加します。行を移動するのは `--archive` だけで、最新 20 件を超える completed entries(インデントされた段落を含む)と legacy `## Planning Rules` section の本文を `docs/plan/ARCHIVE.md` へ移します。`check` は `## Completed Plans` が 20 件を超えるか legacy `## Planning Rules` section が残っていると warning を出します。
- `cairn goal ...`: repository goal を管理します(`cairn goal --help`)。`goal stats --history [--limit N]` は repository のすべての worktree で終了した goals を集計します。completed/cancelled 数、所要時間の median と p90、task と receipt の median、rerun rate、memory promotion の決定数、completed goal が 4 件以上のときの older/newer `trend`、最近の goals です。history がなければ `{"schemaVersion":1,"scope":"repository","goals":0}` を出力します。`completionCriteria`(`goal start --criteria`)は `advisory` です。Cairn は記録するだけで強制せず、完了は required evidence だけで判定されます。
- `cairn-memory`: domain knowledge を探索し `MEMORY.md` を更新します。
- `cairn-plan`: `docs/plan/` に decision-complete plan を作成します。
- `cairn-work`: 現在の `PLAN.md` の次の module task を実行し、2 つの verification gates を取得します。
- `cairn-review`: plan、memory、evidence に照らして completed tasks を review します。

custom marketplace lifecycle は source と versioned runtime を分離します。各 commit 前に staged validation を行い、ownership manifest が全 managed digest を結び、失敗時は reverse-order rollback します。modified または unmanaged artifacts は preserve して conflict として報告します。Cairn-owned TOML sections だけを変更し、public feature/agent settings は強制しません。

Clean uninstall は、すべての managed scaffold directory が空の場合に限り Cairn marketplace cache root を削除し、unmanaged content は保持します。source repository と repository `MEMORY.md`/`PLAN.md`、user-home Cairn goal state、global `cairn-ai` package、package-manager cache、現在の ownership manifest 外の legacy backup/settings は自動削除しません。

Codex は `skills/` と `commands/` を使います。Claude Code は `.claude/` 配下の mirrored commands と agent definitions を使います。Antigravity は `.agents/workflows` と global skills mirrors を使います。

## Antigravity Compatibility

Antigravity は `/workflow-name` で呼び出される `SKILL.md` based Agent Skills and Workflows をサポートします。Cairn はこの surface に次の paths を install します。

- Antigravity IDE: `~/.gemini/config/skills/cairn-*/SKILL.md`。
- Antigravity CLI: `~/.gemini/antigravity-cli/skills/cairn-*.md` のフラットな skill files。

Codex-only hooks は Antigravity へ port されません。代わりに同じ planning、memory、complexity triage、two-gate verification procedures が Skills と Workflows を通して実行されます。paths を上書きするには `ANTIGRAVITY_HOME` または `ANTIGRAVITY_CLI_HOME` を設定してください。

## Locale Policy

Cairn の reusable instructions は global use のため英語で書かれています。user-visible output と生成または更新される documentation、plans、memory artifacts は、user が別の language を指定しない限り configured OS locale に従います。これには `MEMORY.md`、`PLAN.md`、`docs/memory`、`docs/plan` の内容が含まれます。CLI は `en`、`ko`、`ja`、`zh`、`es`、`fr`、`de`、`pt` の common messages を localize し、unsupported locales は English に fallback します。Codex hook `statusMessage` text は static English のまま、hook command output は English または Korean です。

## Delegation

- `explorer`: 利用可能な場合、read-only codebase discovery、impact analysis、pattern search、read-only verification を処理します。
- `worker`: 明確な file ownership を持つ bounded implementation または verification task を処理します。
- Main session: 次の step が結果に即座に依存する urgent blocking work を local で処理します。

すべての delegation prompt は TASK、EXPECTED OUTCOME、REQUIRED TOOLS、MUST DO、MUST NOT DO、CONTEXT の 6 sections を使います。
