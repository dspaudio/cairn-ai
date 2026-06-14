# Cairn

Cairn ist ein token-effizientes Multi-Agent-Harness-Plugin für Codex, Claude Code und Antigravity.

[English](README.md)

Die Grundidee ist, die nützlichen Teile von LazyCodex beizubehalten: hooks, persistent state, explicit planning, agent roles und stop-time guards. Cairn macht wiederholte TDD verification loops nicht zum Standard. Stattdessen teilt es Arbeit in kleine module slices und belegt jeden slice mit zwei verification gates.

1. Module acceptance verification: belegt den geänderten module contract.
2. Surface integration verification: belegt Verhalten über die echte surface, etwa CLI, HTTP, browser oder file artifacts.

Bevor ein slice externen Zustand verändert, zeichnet Cairn den nächstliegenden dry-run oder check mode auf und führt ihn aus. Verification ist begrenzt: Jeder slice erhält standardmäßig zwei verification passes; danach zeichnet der agent einen blocker auf oder teilt den slice, statt eine offene Schleife fortzusetzen.

Cairn behandelt tool readiness ebenfalls als Teil der Arbeit. LSP, typecheck, lint, dry-run und verification tools werden gegen den repository stack geprüft. Fehlt ein erforderliches tool, versucht Cairn eine project-local oder repository-native installation, bevor ein fallback akzeptiert wird.

## Complexity Triage

Jede user task durchläuft zuerst complexity triage. Triage wird aus repository exploration, erwartetem Änderungsumfang und risk signals entschieden, ohne den user nach auffindbaren Fakten zu fragen.

- Fast route: single module, low risk, clear file scope und klares existing pattern verwenden `planner -> builder`.
- Full route: multiple modules, data/permission/migration/external integration/architecture impact oder unklare domain policy verwenden `architect -> planner -> reviewer -> builder -> reviewer`.

Die gewählte route und Begründung werden in `docs/plan/<topic>.md` festgehalten. Auch auf der fast route bleiben nach Abschluss von `builder` die zwei verification gates bestehen.

## Tool Readiness

`cairn toolcheck` untersucht das aktuelle repository auf JavaScript-, TypeScript-, Python-, PHP-, Java-, Kotlin-, Swift-, Go- und Rust-stacks und prüft die passenden LSP- und verification tools.

```sh
cairn toolcheck
cairn toolcheck --install
```

- `toolcheck` meldet detected stacks und missing tools.
- `toolcheck --install` versucht den nächstliegenden project-local oder repository-native install path, etwa package-manager dev dependencies, Composer dev dependencies, `uv`, Java LSP bootstrap, `go install` oder `rustup component add`.
- Cairn plans erfassen detected stack, required tools, install commands und blockers.
- Ein fehlender LSP server ist kein gültiger Grund, precise codebase exploration zu überspringen, bevor installation oder ein gleichwertiger symbol-aware fallback versucht wurde.

## Dry-Run And Loop Policy

- Migrations und database changes verwenden vor write/apply commands `--pretend`, dry-run, schema diff, rollback feasibility checks oder das nächstliegende repository-native equivalent.
- Package, release, infrastructure, deployment, code generation und formatting work verwenden, wenn verfügbar, check, plan, diff, validate oder dry-run modes, bevor Zustand verändert wird.
- Wenn kein dry-run existiert, hält der plan dies fest und wählt den kleinsten reversiblen command oder test artifact.
- Wenn ein verification gate fehlschlägt, diagnostiziert Cairn einmal, verkleinert oder teilt den slice und führt beide gates erneut aus.
- Nach zwei fehlgeschlagenen verification passes für denselben slice zeichnet Cairn den blocker in `docs/plan/<topic>.md` auf, statt eine wiederholte Schleife fortzusetzen.

## Model Guidance

Cairn wendet model-specific adjustment nur auf Claude-family und Codex-family models an.

- Claude-family: bevorzugt für `architect`, `planner` und `reviewer`. Geeignet für long context, policy interpretation und plan/evidence review.
- Codex-family: bevorzugt für `builder`, `worker` und strukturell klare `planner`. Geeignet für small implementation slices, explicit file edits und command-based verification.

Details stehen in `docs/model-guidance/README.md`, `docs/model-guidance/claude.md` und `docs/model-guidance/codex.md`.

## Repository Artifacts

Das harness erstellt und pflegt diese files im Ziel-repository root.

- `MEMORY.md`: kurzer Index persistent domain knowledge.
- `docs/memory/*.md`: detailliertes Wissen je domain.
- `docs/model-guidance/*.md`: Claude- und Codex-model adjustment guidance.
- `PLAN.md`: kurzer Index aktiver und abgeschlossener work topics.
- `docs/plan/*.md`: detailed execution plans.

Root files bleiben kurz, Details wandern unter `docs/`, damit agents nur den benötigten context lesen.

## Commands

Das veröffentlichte package kann im Stil von LazyCodex ausgeführt werden.

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

- `cairn install`: installiert das plugin in den Codex marketplace cache und konfiguriert hook trust state, Claude Code mirror files und Antigravity skills/workflows.
- `cairn upgrade`: aktualisiert installation, hook trust state, Claude Code mirror files und Antigravity skills/workflows aus der aktuellen source.
- `cairn doctor`: diagnostiziert Codex settings, installation, hook trust state, Claude Code mirror files und Antigravity mirror files.
- `cairn uninstall`: entfernt von Cairn hinzugefügte Codex settings, cache, Claude Code mirror files und Antigravity mirror files.
- `cairn toolcheck`: erkennt repository stacks und prüft oder installiert required LSP und verification tools.
- `cairn-memory`: erkundet domain knowledge und aktualisiert `MEMORY.md`.
- `cairn-plan`: erstellt einen decision-complete plan unter `docs/plan/`.
- `cairn-work`: führt den nächsten module slice im aktuellen `PLAN.md` mit zwei verification gates aus.
- `cairn-review`: prüft completed slices gegen plan, memory und evidence.

`install` und `upgrade` erstellen `*.cairn-backup-*` backups, bevor `~/.codex/config.toml` verändert wird. Das source plugin manifest bleibt validator-friendly; nur die installed cache copy erhält ein `hooks` field zur Aktivierung von Codex hooks.

Codex verwendet `skills/` und `commands/`. Claude Code verwendet gespiegelte commands und agent definitions unter `.claude/`. Antigravity verwendet `.agents/workflows` und globale skills mirrors.

## Antigravity Compatibility

Antigravity unterstützt `SKILL.md`-basierte Agent Skills und Workflows, die als `/workflow-name` aufgerufen werden. Cairn installiert für diese Oberfläche die folgenden paths.

- Antigravity IDE: `~/.agents/skills/cairn-*`, `~/.agents/workflows/cairn-*.md`.
- Antigravity CLI: `~/.gemini/antigravity-cli/skills/cairn-*`, `~/.gemini/antigravity-cli/workflows/cairn-*.md`.

Codex-only hooks werden nicht nach Antigravity portiert. Stattdessen laufen dieselben planning-, memory-, complexity triage- und two-gate verification procedures über Skills und Workflows. Setze `ANTIGRAVITY_HOME` oder `ANTIGRAVITY_CLI_HOME`, um paths zu überschreiben.

## Locale Policy

Cairns reusable instructions sind für global use auf Englisch geschrieben. User-visible output folgt der konfigurierten OS locale, sofern der user nicht ausdrücklich eine andere Sprache verlangt. Die CLI lokalisiert common messages für `en`, `ko`, `ja`, `zh`, `es`, `fr`, `de` und `pt` und fällt bei unsupported locales auf English zurück. Codex hook `statusMessage` text bleibt static English, während hook command output English oder Korean ist.

## Agent Roles

- `architect`: fasst system boundaries, risk und domain policy zusammen.
- `planner`: wandelt explored facts in einen decision-complete plan um.
- `builder`: implementiert einen small module slice.
- `reviewer`: prüft behavior, policy und evidence.
- `worker`: erledigt focused work wie search, small edits und QA.

Jeder delegation prompt verwendet sechs sections: TASK, EXPECTED OUTCOME, REQUIRED TOOLS, MUST DO, MUST NOT DO, CONTEXT.
