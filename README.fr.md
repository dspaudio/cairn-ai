# Cairn

Cairn est un plugin de harness multi-agent économe en tokens pour Codex, Claude Code et Antigravity.

[English](README.md)

L'idée centrale est de conserver des comportements utiles d'agent harness : hooks, état persistant, planification explicite, délégation ciblée et gardes au moment de l'arrêt. Cairn ne fait pas des boucles répétées de vérification TDD le comportement par défaut. Il découpe plutôt le travail en petits module tasks et prouve chaque task avec deux verification gates.

1. Module acceptance verification : prouve le contrat du module modifié.
2. Surface integration verification : prouve le comportement via une surface réelle, comme CLI, HTTP, navigateur ou artefacts de fichiers.

Avant qu'un task ne modifie un état externe, Cairn enregistre et exécute le dry-run ou check mode disponible le plus proche. La vérification est bornée : chaque task reçoit deux verification passes par défaut, puis l'agent enregistre un blocker ou divise le task au lieu de continuer une boucle ouverte.

Cairn traite aussi la préparation des outils comme une partie du travail. LSP, typecheck, lint, dry-run et verification tools sont vérifiés par rapport au stack du repository. Si un outil requis manque, Cairn tente une installation project-local ou repository-native avant d'accepter un fallback.

## LazyCodex Attribution

Cairn est influencé par LazyCodex (`https://github.com/code-yeongyu/lazycodex`). Les idées reprises sont la forme d'agent harness installable, la gestion Codex hook trust/setup, project memory, planning skills, executable workflow commands, diagnostics et le skill/agent packaging entre local agent surfaces.

Cairn diverge volontairement de LazyCodex dans l'execution policy. Il n'adopte pas le role-chain execution model ni les open-ended completion loops de LazyCodex. Cairn utilise Light/Heavy Path triage, une délégation bornée `explorer`/`worker`, deux verification gates et des explicit stop conditions.

## Complexity Triage

Chaque implementation task passe d'abord par complexity triage, avant d'appliquer agent, plugin ou delegated workflow guidance. Le triage est décidé à partir de l'exploration du repository, de la portée attendue du changement et des signaux de risque, sans demander à l'utilisateur les faits découvrables.

- Light Path : changements étroits dans les existing architecture layers. C'est le comportement par défaut. Implémentez directement ou utilisez un `worker` borné, puis conservez le verification gate.
- Heavy Path : new directory/module/layer, new domain model/service/abstraction, security/session/auth, external API/message queue/payment, DB schema/migration, concurrency/transaction/cache changes, cross-domain refactor ou explicit extra-care request.

Le path choisi et sa justification sont enregistrés dans `docs/plan/<topic>.md` quand un plan artifact existe. Même en Light Path, les deux verification gates restent.

## Tool Readiness

`cairn toolcheck` inspecte le repository courant pour les stacks JavaScript, TypeScript, Python, PHP, Java, Kotlin, Swift, Go et Rust, puis vérifie les LSP et verification tools correspondants.

```sh
cairn toolcheck --root .
cairn toolcheck --install --yes --root .
```

- `toolcheck` signale les detected stacks et missing tools.
- `toolcheck --install` tente le chemin d'installation project-local ou repository-native le plus proche, comme les dev dependencies du package manager, les dev dependencies Composer, `uv`, Java LSP bootstrap, `go install` ou `rustup component add`.
- Les plans Cairn enregistrent detected stack, required tools, install commands et blockers.
- Un LSP server manquant n'est pas une raison valable pour ignorer precise codebase exploration tant qu'une installation ou un fallback symbol-aware équivalent n'a pas été tenté.

## Dry-Run And Loop Policy

- Migrations et database changes utilisent `--pretend`, dry-run, schema diff, rollback feasibility checks ou l'équivalent repository-native le plus proche avant les commandes write/apply.
- Package, release, infrastructure, deployment, code generation et formatting work utilisent check, plan, diff, validate ou dry-run modes avant de modifier l'état quand c'est disponible.
- Si aucun dry-run n'existe, le plan l'enregistre et choisit la plus petite commande réversible ou le test artifact disponible.
- Si une verification gate échoue, Cairn diagnostique une fois, réduit ou divise le task, puis relance les deux gates.
- Après deux verification passes échouées pour le même task, Cairn enregistre le blocker dans `docs/plan/<topic>.md` au lieu de continuer une boucle répétée.

## Model Guidance

Cairn applique des ajustements spécifiques uniquement aux modèles Claude-family et Codex-family.

- Claude-family : utile pour long context, policy interpretation et plan/evidence review.
- Codex-family : utile pour small implementation tasks, explicit file edits, command-based verification et bounded `worker` tasks.

Les détails se trouvent dans le plugin installé sous `cairn://docs/model-guidance/README.md`, `cairn://docs/model-guidance/claude.md` et `cairn://docs/model-guidance/codex.md`.

## Repository Artifacts

Le harness crée et maintient ces fichiers à la racine du repository cible.

- `MEMORY.md` : index court de persistent domain knowledge.
- `docs/memory/*.md` : connaissances détaillées par domaine.
- `.cairn/state.json` : état git-ignored des goals, tasks et receipts pour la reprise et les stop gates ciblés.
- `PLAN.md` : index court des sujets actifs et terminés.
- `docs/plan/*.md` : detailed execution plans.

Les fichiers racine restent courts et les détails vont sous `docs/`, afin que les agents ne lisent que le contexte nécessaire.

## Commands

Le package publié peut être exécuté avec `bunx` ou avec des commandes `cairn` installées globalement.

```sh
bunx cairn-ai@latest install
bunx cairn-ai@latest upgrade
bunx cairn-ai@latest doctor
bunx cairn-ai@latest uninstall
bunx cairn-ai@latest toolcheck
```

Après une installation globale, des commandes courtes sont aussi disponibles.

```sh
bun add -g cairn-ai
cairn install
cairn upgrade
cairn doctor
cairn uninstall
cairn toolcheck
```

- `cairn install` : installe le plugin dans le Codex marketplace cache et configure hook trust state, Claude Code mirror files et Antigravity skills/workflows.
- `cairn upgrade` : met à jour installation, hook trust state, Claude Code mirror files et Antigravity skills/workflows depuis la source actuelle.
- `cairn doctor` : diagnostique Codex settings, installation, hook trust state, Claude Code mirror files et Antigravity mirror files.
- `cairn uninstall` : supprime Codex settings, cache, Claude Code mirror files et Antigravity mirror files ajoutés par Cairn.
- `cairn toolcheck` : détecte repository stacks et vérifie ou installe required LSP et verification tools.
- `cairn-memory` : explore domain knowledge et met à jour `MEMORY.md`.
- `cairn-plan` : crée un decision-complete plan sous `docs/plan/`.
- `cairn-work` : exécute le prochain module task du `PLAN.md` courant avec deux verification gates.
- `cairn-review` : relit completed tasks par rapport au plan, memory et evidence.

`install` et `upgrade` créent des backups `*.cairn-backup-*` avant de modifier `~/.codex/config.toml`. Le source plugin manifest reste validator-friendly ; seule la copie installée en cache reçoit un champ `hooks` pour activer les Codex hooks.

Codex utilise `skills/` et `commands/`. Claude Code utilise les commandes miroir et définitions d'agents sous `.claude/`. Antigravity utilise `.agents/workflows` et les global skills mirrors.

## Antigravity Compatibility

Antigravity prend en charge les Agent Skills et Workflows basés sur `SKILL.md`, invoqués comme `/workflow-name`. Cairn installe ces paths pour cette surface.

- Antigravity IDE : `~/.agents/skills/cairn-*`, `~/.agents/workflows/cairn-*.md`.
- Antigravity CLI : `~/.gemini/antigravity-cli/skills/cairn-*`, `~/.gemini/antigravity-cli/workflows/cairn-*.md`.

Les hooks propres à Codex ne sont pas portés vers Antigravity. À la place, les mêmes procédures planning, memory, complexity triage et two-gate verification s'exécutent via Skills et Workflows. Définissez `ANTIGRAVITY_HOME` ou `ANTIGRAVITY_CLI_HOME` pour remplacer les paths.

## Locale Policy

Les instructions réutilisables de Cairn sont écrites en anglais pour un usage global. La sortie visible par l'utilisateur ainsi que la documentation, les plans et les artifacts mémoire générés ou mis à jour doivent suivre l'OS locale configurée, sauf si l'utilisateur demande explicitement une autre langue. Cela inclut le contenu de `MEMORY.md`, `PLAN.md`, `docs/memory` et `docs/plan`. La CLI localise les messages communs pour `en`, `ko`, `ja`, `zh`, `es`, `fr`, `de` et `pt`, puis revient à English pour les locales non prises en charge. Le texte `statusMessage` des Codex hooks reste en anglais statique, tandis que hook command output est English ou Korean.

## Delegation

- `explorer` : gère read-only codebase discovery, impact analysis, pattern searches et read-only verification quand disponible.
- `worker` : gère des bounded implementation ou verification tasks avec file ownership clair.
- Main session : garde local l'urgent blocking work quand l'étape suivante dépend immédiatement du résultat.

Chaque delegation prompt utilise six sections : TASK, EXPECTED OUTCOME, REQUIRED TOOLS, MUST DO, MUST NOT DO, CONTEXT.
