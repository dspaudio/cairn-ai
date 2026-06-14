# Cairn

Cairn est un plugin de harness multi-agent économe en tokens pour Codex, Claude Code et Antigravity.

[English](README.md)

L'idée centrale est de conserver les parties utiles de LazyCodex : hooks, état persistant, planification explicite, rôles d'agents et gardes au moment de l'arrêt. Cairn ne fait pas des boucles répétées de vérification TDD le comportement par défaut. Il découpe plutôt le travail en petits module slices et prouve chaque slice avec deux verification gates.

1. Module acceptance verification : prouve le contrat du module modifié.
2. Surface integration verification : prouve le comportement via une surface réelle, comme CLI, HTTP, navigateur ou artefacts de fichiers.

Avant qu'un slice ne modifie un état externe, Cairn enregistre et exécute le dry-run ou check mode disponible le plus proche. La vérification est bornée : chaque slice reçoit deux verification passes par défaut, puis l'agent enregistre un blocker ou divise le slice au lieu de continuer une boucle ouverte.

Cairn traite aussi la préparation des outils comme une partie du travail. LSP, typecheck, lint, dry-run et verification tools sont vérifiés par rapport au stack du repository. Si un outil requis manque, Cairn tente une installation project-local ou repository-native avant d'accepter un fallback.

## Complexity Triage

Chaque user task passe d'abord par complexity triage. Le triage est décidé à partir de l'exploration du repository, de la portée attendue du changement et des signaux de risque, sans demander à l'utilisateur les faits découvrables.

- Fast route : un seul module, faible risque, portée de fichiers claire et pattern existant évident utilisent `planner -> builder`.
- Full route : plusieurs modules, impact data/permission/migration/external integration/architecture, ou domain policy peu claire utilisent `architect -> planner -> reviewer -> builder -> reviewer`.

La route choisie et sa justification sont enregistrées dans `docs/plan/<topic>.md`. Même en fast route, les deux verification gates restent après la fin de `builder`.

## Tool Readiness

`cairn toolcheck` inspecte le repository courant pour les stacks JavaScript, TypeScript, Python, PHP, Java, Kotlin, Swift, Go et Rust, puis vérifie les LSP et verification tools correspondants.

```sh
cairn toolcheck
cairn toolcheck --install
```

- `toolcheck` signale les detected stacks et missing tools.
- `toolcheck --install` tente le chemin d'installation project-local ou repository-native le plus proche, comme les dev dependencies du package manager, les dev dependencies Composer, `uv`, Java LSP bootstrap, `go install` ou `rustup component add`.
- Les plans Cairn enregistrent detected stack, required tools, install commands et blockers.
- Un LSP server manquant n'est pas une raison valable pour ignorer precise codebase exploration tant qu'une installation ou un fallback symbol-aware équivalent n'a pas été tenté.

## Dry-Run And Loop Policy

- Migrations et database changes utilisent `--pretend`, dry-run, schema diff, rollback feasibility checks ou l'équivalent repository-native le plus proche avant les commandes write/apply.
- Package, release, infrastructure, deployment, code generation et formatting work utilisent check, plan, diff, validate ou dry-run modes avant de modifier l'état quand c'est disponible.
- Si aucun dry-run n'existe, le plan l'enregistre et choisit la plus petite commande réversible ou le test artifact disponible.
- Si une verification gate échoue, Cairn diagnostique une fois, réduit ou divise le slice, puis relance les deux gates.
- Après deux verification passes échouées pour le même slice, Cairn enregistre le blocker dans `docs/plan/<topic>.md` au lieu de continuer une boucle répétée.

## Model Guidance

Cairn applique des ajustements spécifiques uniquement aux modèles Claude-family et Codex-family.

- Claude-family : préféré pour `architect`, `planner` et `reviewer`. À utiliser pour long context, policy interpretation et plan/evidence review.
- Codex-family : préféré pour `builder`, `worker` et les `planner` structurellement clairs. À utiliser pour small implementation slices, explicit file edits et command-based verification.

Les détails se trouvent dans `docs/model-guidance/README.md`, `docs/model-guidance/claude.md` et `docs/model-guidance/codex.md`.

## Repository Artifacts

Le harness crée et maintient ces fichiers à la racine du repository cible.

- `MEMORY.md` : index court de persistent domain knowledge.
- `docs/memory/*.md` : connaissances détaillées par domaine.
- `docs/model-guidance/*.md` : guidance d'ajustement pour les modèles Claude et Codex.
- `PLAN.md` : index court des sujets actifs et terminés.
- `docs/plan/*.md` : detailed execution plans.

Les fichiers racine restent courts et les détails vont sous `docs/`, afin que les agents ne lisent que le contexte nécessaire.

## Commands

Le package publié peut être exécuté dans le même style que LazyCodex.

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
- `cairn-work` : exécute le prochain module slice du `PLAN.md` courant avec deux verification gates.
- `cairn-review` : relit completed slices par rapport au plan, memory et evidence.

`install` et `upgrade` créent des backups `*.cairn-backup-*` avant de modifier `~/.codex/config.toml`. Le source plugin manifest reste validator-friendly ; seule la copie installée en cache reçoit un champ `hooks` pour activer les Codex hooks.

Codex utilise `skills/` et `commands/`. Claude Code utilise les commandes miroir et définitions d'agents sous `.claude/`. Antigravity utilise `.agents/workflows` et les global skills mirrors.

## Antigravity Compatibility

Antigravity prend en charge les Agent Skills et Workflows basés sur `SKILL.md`, invoqués comme `/workflow-name`. Cairn installe ces paths pour cette surface.

- Antigravity IDE : `~/.agents/skills/cairn-*`, `~/.agents/workflows/cairn-*.md`.
- Antigravity CLI : `~/.gemini/antigravity-cli/skills/cairn-*`, `~/.gemini/antigravity-cli/workflows/cairn-*.md`.

Les hooks propres à Codex ne sont pas portés vers Antigravity. À la place, les mêmes procédures planning, memory, complexity triage et two-gate verification s'exécutent via Skills et Workflows. Définissez `ANTIGRAVITY_HOME` ou `ANTIGRAVITY_CLI_HOME` pour remplacer les paths.

## Locale Policy

Les instructions réutilisables de Cairn sont écrites en anglais pour un usage global. La sortie visible par l'utilisateur doit suivre l'OS locale configurée, sauf si l'utilisateur demande explicitement une autre langue. La CLI localise les messages communs pour `en`, `ko`, `ja`, `zh`, `es`, `fr`, `de` et `pt`, puis revient à English pour les locales non prises en charge. Le texte `statusMessage` des Codex hooks reste en anglais statique, tandis que hook command output est English ou Korean.

## Agent Roles

- `architect` : résume system boundaries, risk et domain policy.
- `planner` : convertit explored facts en decision-complete plan.
- `builder` : implémente un small module slice.
- `reviewer` : vérifie behavior, policy et evidence.
- `worker` : gère focused work comme search, small edits et QA.

Chaque delegation prompt utilise six sections : TASK, EXPECTED OUTCOME, REQUIRED TOOLS, MUST DO, MUST NOT DO, CONTEXT.
