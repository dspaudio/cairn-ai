# Cairn

Cairn ist ein token-effizientes Multi-Agent-Harness-Plugin für Codex, Claude Code und Antigravity.

[English](README.md)

Die Grundidee ist, nützliches agent-harness-Verhalten beizubehalten: hooks, persistent state, explicit planning, focused delegation und stop-time guards. Cairn macht wiederholte TDD verification loops nicht zum Standard. Stattdessen teilt es Arbeit in kleine module tasks und belegt jeden task mit zwei verification gates.

1. Module acceptance verification: belegt den geänderten module contract.
2. Surface integration verification: belegt Verhalten über die echte surface, etwa CLI, HTTP, browser oder file artifacts.

Bevor ein task externen Zustand verändert, zeichnet Cairn den nächstliegenden dry-run oder check mode auf und führt ihn aus. Verification ist begrenzt: Jeder task erhält standardmäßig zwei verification passes; danach zeichnet der agent einen blocker auf oder teilt den task, statt eine offene Schleife fortzusetzen.

Cairn behandelt tool readiness ebenfalls als Teil der Arbeit. LSP, typecheck, lint, dry-run und verification tools werden gegen den repository stack geprüft. Installation erfolgt nur mit ausdrücklicher Zustimmung und einem gepinnten unterstützten installer; andernfalls wird ein blocker gemeldet.

## LazyCodex Attribution

Cairn ist von LazyCodex (`https://github.com/code-yeongyu/lazycodex`) beeinflusst. Übernommene Ideen sind die installierbare agent-harness-Form, Codex hook trust/setup handling, project memory, planning skills, executable workflow commands, diagnostics und skill/agent packaging über local agent surfaces hinweg.

Cairn weicht in der execution policy bewusst von LazyCodex ab. Es übernimmt nicht das role-chain execution model oder die open-ended completion loops von LazyCodex. Cairn verwendet Light/Heavy Path triage, begrenzte `explorer`/`worker` delegation, zwei verification gates und explicit stop conditions.

## Complexity Triage

Jede implementation task durchläuft zuerst complexity triage, bevor agent, plugin oder delegated workflow guidance angewendet werden. Triage wird aus repository exploration, erwartetem Änderungsumfang und risk signals entschieden, ohne den user nach auffindbaren Fakten zu fragen.

- Light Path: schmale Änderungen innerhalb existing architecture layers. Das ist der Standard. Direkt implementieren oder einen begrenzten `worker` verwenden, danach bleibt das verification gate bestehen.
- Heavy Path: new directory/module/layer, new domain model/service/abstraction, security/session/auth, external API/message queue/payment, DB schema/migration, concurrency/transaction/cache changes, cross-domain refactor oder explicit extra-care request.

Der gewählte path und die Begründung werden in `docs/plan/<topic>.md` festgehalten, wenn ein plan artifact existiert. Auch auf Light Path bleiben die zwei verification gates bestehen.

## Tool Readiness

`cairn toolcheck` untersucht das aktuelle repository auf JavaScript-, TypeScript-, Python-, PHP-, Java-, Kotlin-, Swift-, Go- und Rust-stacks und prüft die passenden LSP- und verification tools.

```sh
cairn toolcheck --root .
cairn toolcheck --install --yes --root .
```

- `toolcheck` meldet detected stacks und missing tools.
- `toolcheck --install` erfordert ausdrückliche Zustimmung und `--yes`; ein nicht unterstützter installer liefert das kanonische Ergebnis `installer-unavailable` und wird nicht ausgeführt.
- Cairn plans erfassen detected stack, required tools, install commands und blockers.
- Ein fehlender LSP server ist kein gültiger Grund, precise codebase exploration zu überspringen, bevor installation oder ein gleichwertiger symbol-aware fallback versucht wurde.

## Dry-Run And Loop Policy

- Migrations und database changes verwenden vor write/apply commands `--pretend`, dry-run, schema diff, rollback feasibility checks oder das nächstliegende repository-native equivalent.
- Package, release, infrastructure, deployment, code generation und formatting work verwenden, wenn verfügbar, check, plan, diff, validate oder dry-run modes, bevor Zustand verändert wird.
- Wenn kein dry-run existiert, hält der plan dies fest und wählt den kleinsten reversiblen command oder test artifact.
- Wenn ein verification gate fehlschlägt, diagnostiziert Cairn einmal, verkleinert oder teilt den task und führt beide gates erneut aus.
- Nach zwei fehlgeschlagenen verification passes für denselben task zeichnet Cairn den blocker in `docs/plan/<topic>.md` auf, statt eine wiederholte Schleife fortzusetzen.

## Model Guidance

Cairn wendet model-specific adjustment nur auf Claude-family und Codex-family models an.

- Claude-family: geeignet für long context, policy interpretation und plan/evidence review.
- Codex-family: geeignet für small implementation tasks, explicit file edits, command-based verification und bounded `worker` tasks.

Details stehen im installierten Plugin unter `cairn://docs/model-guidance/README.md`, `cairn://docs/model-guidance/claude.md` und `cairn://docs/model-guidance/codex.md`.

## Repository Artifacts

Das harness erstellt und pflegt diese files im Ziel-repository root.

- `MEMORY.md`: kurzer Index persistent domain knowledge.
- `docs/memory/*.md`: detailliertes Wissen je domain.
- `.cairn/state.json`: git-ignorierter Goal-, Task- und Evidence-Record-Status für Wiederaufnahme und scoped stop gates.
- `PLAN.md`: kurzer Index aktiver und abgeschlossener work topics.
- `docs/plan/*.md`: detailed execution plans.

Root files bleiben kurz, Details wandern unter `docs/`, damit agents nur den benötigten context lesen.

Für geringe Tokenkosten entsteht zuerst ein test contract aus Anforderungen, Invarianten, Grenzen und Fehlermodi. Der tool exit code von `goal verify -- <argv>` ist maßgeblich; Erfolge bleiben kurz, nur Fehler erweitern den Kontext. Package lifecycle scripts werden geprüft; standardmäßig läuft ein normales `npm pack --dry-run`. Content-producing oder unbekannte scripts dürfen `--ignore-scripts` nie verwenden; es ist nur bei fehlenden oder nachweislich content-neutral scripts und frischer full-check evidence erlaubt.

## Commands

Das veröffentlichte package kann mit `bunx` oder global installierten `cairn` commands ausgeführt werden.

```sh
bunx cairn-ai@latest install
bunx cairn-ai@latest upgrade
bunx cairn-ai@latest doctor
bunx cairn-ai@latest uninstall
bunx cairn-ai@latest toolcheck
```

Nach globaler installation sind auch kurze commands verfügbar.

```sh
bun add -g cairn-ai
cairn install
cairn upgrade
cairn doctor
cairn uninstall
cairn toolcheck
```

- `cairn install`: installiert transaktional custom marketplace source, versioned runtime, Cairn-eigene config sections und aktuelle host mirrors.
- `cairn upgrade`: ersetzt nur unveränderte Einträge des ownership manifest nach staged validation und nutzt rollback bei Fehlern.
- `cairn doctor`: prüft ownership digests, effektive Codex features, den tatsächlichen plugin status und runtime locators ohne Reparatur.
- `cairn uninstall`: entfernt nur unveränderte verwaltete Einträge; modified oder unmanaged Ziele bleiben als conflict erhalten.
- `cairn toolcheck`: erkennt repository stacks und prüft required tools; Installation läuft nur für einen genehmigten unterstützten installer, sonst gilt `installer-unavailable`.
- `cairn-memory`: erkundet domain knowledge und aktualisiert `MEMORY.md`.
- `cairn-plan`: erstellt einen decision-complete plan unter `docs/plan/`.
- `cairn-work`: führt den nächsten module task im aktuellen `PLAN.md` mit zwei verification gates aus.
- `cairn-review`: prüft completed tasks gegen plan, memory und evidence.

Der custom marketplace lifecycle hält source und versioned runtime getrennt. Staged validation geht jedem commit voraus, das ownership manifest bindet alle managed digests, und ein Fehler führt zu reverse-order rollback. Modified oder unmanaged artifacts werden preserved und als conflict gemeldet. Cairn ändert nur eigene TOML sections und erzwingt keine öffentlichen feature/agent settings.

Clean uninstall entfernt den Cairn marketplace cache root nur, wenn alle managed scaffold directories leer sind; unmanaged Inhalte bleiben erhalten. Source repository und repository state, das globale `cairn-ai` package, package-manager caches sowie legacy backups/settings außerhalb des aktuellen ownership manifest werden nicht automatisch gelöscht.

Codex verwendet `skills/` und `commands/`. Claude Code verwendet gespiegelte commands und agent definitions unter `.claude/`. Antigravity verwendet `.agents/workflows` und globale skills mirrors.

## Antigravity Compatibility

Antigravity unterstützt `SKILL.md`-basierte Agent Skills und Workflows, die als `/workflow-name` aufgerufen werden. Cairn installiert für diese Oberfläche die folgenden paths.

- Antigravity IDE: `~/.gemini/config/skills/cairn-*/SKILL.md`.
- Antigravity CLI: flache Skill-Dateien unter `~/.gemini/antigravity-cli/skills/cairn-*.md`.

Codex-only hooks werden nicht nach Antigravity portiert. Stattdessen laufen dieselben planning-, memory-, complexity triage- und two-gate verification procedures über Skills und Workflows. Setze `ANTIGRAVITY_HOME` oder `ANTIGRAVITY_CLI_HOME`, um paths zu überschreiben.

## Locale Policy

Cairns reusable instructions sind für global use auf Englisch geschrieben. User-visible output sowie erstellte oder aktualisierte documentation, plans und memory artifacts folgen der konfigurierten OS locale, sofern der user nicht ausdrücklich eine andere Sprache verlangt. Das umfasst Inhalte in `MEMORY.md`, `PLAN.md`, `docs/memory` und `docs/plan`. Die CLI lokalisiert common messages für `en`, `ko`, `ja`, `zh`, `es`, `fr`, `de` und `pt` und fällt bei unsupported locales auf English zurück. Codex hook `statusMessage` text bleibt static English, während hook command output English oder Korean ist.

## Delegation

- `explorer`: erledigt read-only codebase discovery, impact analysis, pattern searches und read-only verification, wenn verfügbar.
- `worker`: erledigt bounded implementation oder verification tasks mit klarem file ownership.
- Main session: hält urgent blocking work lokal, wenn der nächste Schritt sofort vom Ergebnis abhängt.

Jeder delegation prompt verwendet sechs sections: TASK, EXPECTED OUTCOME, REQUIRED TOOLS, MUST DO, MUST NOT DO, CONTEXT.
