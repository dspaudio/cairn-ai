# Cairn

Cairn est un plugin de harness multi-agent économe en tokens pour Codex, Claude Code et Antigravity.

[English](README.md)

L'idée centrale est de conserver des comportements utiles d'agent harness : hooks, état persistant, planification explicite, délégation ciblée et gardes au moment de l'arrêt. Cairn ne fait pas des boucles répétées de vérification TDD le comportement par défaut. Il découpe plutôt le travail en petits module tasks et prouve chaque task avec deux verification gates.

1. Module acceptance verification : prouve le contrat du module modifié.
2. Surface integration verification : prouve le comportement via une surface réelle, comme CLI, HTTP, navigateur ou artefacts de fichiers.

Avant qu'un task ne modifie un état externe, Cairn enregistre et exécute le dry-run ou check mode disponible le plus proche. La vérification est bornée : chaque task reçoit deux verification passes par défaut, puis l'agent enregistre un blocker ou divise le task au lieu de continuer une boucle ouverte.

Cairn traite aussi la préparation des outils comme une partie du travail. LSP, typecheck, lint, dry-run et verification tools sont vérifiés par rapport au stack du repository. Une installation exige une approbation explicite et un installer pris en charge et épinglé ; sinon un blocker est signalé.

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
- `toolcheck --install` exige une approbation explicite et `--yes` ; un installer non pris en charge renvoie le résultat canonique `installer-unavailable` sans s'exécuter.
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

- `MEMORY.md` : index court de persistent domain knowledge : une ligne par note sous `## Domain Knowledge` (`- [<name>](docs/memory/<name>.md): <summary>`), plus la `## Policy` du dépôt.
- `docs/memory/*.md` : connaissances détaillées par domaine. Chaque note commence par une ligne `Summary:` (120 caractères au maximum) que l'index et le hook affichent.
- `~/.cairn/projects/<project-id>/worktrees/<worktree-id>/state.json` : état active goal/task/evidence dans user-home, isolé par projet et worktree, pour la reprise et les scoped stop gates. Le working tree ne possède pas le runtime state.
- `PLAN.md` : index court des plans de travail : une ligne de 200 caractères au plus par plan sous `## Active Plans` et `## Completed Plans`. Les règles de planification vivent dans le skill `cairn-plan`, pas dans `PLAN.md`.
- `docs/plan/*.md` : detailed execution plans.
- `docs/plan/ARCHIVE.md` : anciennes entrées terminées déplacées hors de `PLAN.md` par `cairn plan index --archive`, de la plus récente à la plus ancienne, plus le corps d'une section legacy `## Planning Rules` sous `## Legacy Planning Rules`. Les lignes de liste avant son premier titre `## ` comptent toujours comme indexées.
- `~/.cairn/projects/<project-id>/worktrees/<worktree-id>/history.jsonl` : un enregistrement de synthèse par goal terminé ou annulé (les 200 plus récents par worktree) pour `goal stats --history`.

Gardez `## Completed Plans` de la plus récente à la plus ancienne. `cairn plan index --archive` conserve les 20 premières entrées et déplace le reste vers `docs/plan/ARCHIVE.md` sans rien supprimer ; une liste tenue de la plus ancienne à la plus récente archiverait donc les plans les plus récents. Vérifiez d'abord avec `--dry-run`. Les `MEMORY.md`/`PLAN.md` existants fonctionnent sans migration : `init` ne les réécrit jamais et `check` signale l'ancien format uniquement par des warnings.

Au `SessionStart`, le hook indique à l'agent quelles notes de mémoire existent (nom et `Summary:`, ou une seule ligne de noms quand la liste est longue) et, sans goal actif, ajoute une ligne sur l'index des plans : nombre de plans, plans actifs, derniers plans terminés et `docs/plan/ARCHIVE.md` s'il existe. Avec un goal active, paused, blocked ou détenu par une autre session, seule la liste de mémoire est ajoutée, et la capsule d'une autre session n'affiche jamais de noms de plans. Un `UserPromptSubmit` sans goal ajoute une phrase avec le nombre de notes. Le hook lit uniquement les fichiers d'index et les listes de répertoires, jamais le corps des notes, et n'écrit rien ; un dépôt sans notes ni plans reçoit la même sortie qu'avant.

Avant `goal finish`, `cairn-work` consigne une décision de memory promotion par goal dans l'Evidence du plan : `Memory promotion: docs/memory/<domain>.md` quand le goal a produit une connaissance réutilisable du dépôt, sinon `Memory promotion: none: <reason>`. La décision est obligatoire ; écrire une note est facultatif. Quand un goal se termine et que son fichier de plan n'a pas de ligne `Memory promotion:` renseignée, `goal finish` et `goal complete` affichent un rappel d'une ligne sur stderr sans changer l'exit code ni stdout.

Les fichiers racine restent courts et les détails vont sous `docs/`, afin que les agents ne lisent que le contexte nécessaire.

Pour économiser les tokens, définissez d'abord un test contract couvrant exigences, invariants, limites et modes d'échec. Prenez le tool exit code de `goal verify -- <argv>` comme autorité, résumez les succès et n'élargissez le contexte qu'en cas d'échec. Inspectez le package lifecycle et exécutez normalement `npm pack --dry-run`. Les scripts content-producing ou inconnus ne doivent jamais utiliser `--ignore-scripts`; utilisez-le seulement si les scripts sont absents ou prouvés content-neutral et si la preuve du full check reste valide.

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
cairn auto-upgrade status
```

- `cairn install [--hosts all|codex,claude,antigravity]` : installe transactionnellement custom marketplace source, versioned runtime, sections config propres à Cairn et mirrors actuels. Le canonical runtime se trouve sous `~/.cairn/install/` et le reste n'est installé que pour les hosts choisis. Sans `--hosts`, une première installation dans un terminal demande les hosts ; les exécutions non interactives et la CI installent tous les hosts.
- `cairn upgrade [--hosts all|codex,claude,antigravity]` : remplace uniquement les entrées intactes du ownership manifest après staged validation, avec rollback en cas d'échec. Conserve les hosts enregistrés sauf si `--hosts` les change, migre une installation faite par Cairn 0.6.0 ou antérieur et met à jour un Claude Code plugin cache resté sur une autre version. Si la version installée est plus récente que cette CLI, `install` et `upgrade` refusent sans rien changer ; `--allow-downgrade` installe quand même la version de cette CLI.
- `cairn doctor` : valide ownership digests, features Codex effectives, état réel du plugin et runtime locators sans réparation. Affiche d'abord `Hosts: <ids>` et ne vérifie que les hosts choisis (y compris `Claude plugin cache version`). Une installation legacy est signalée avec l'indication de la migrer par `cairn upgrade`.
- `cairn uninstall` : compare d'abord chaque entrée non config du ownership manifest à son installed digest et refuse tout l'uninstall, sans rien changer, si un managed artifact a été modifié ou supprimé. Sinon, supprime ou restaure les entrées gérées et les retained runtimes, nettoie les managed scaffolds vides, préserve les cibles unmanaged et leurs répertoires parents, et applique un rollback aux échecs avant commit. Supprime aussi `~/.cairn/update/`, et conserve `~/.cairn/config.json` et `~/.cairn/projects/`. Une installation au layout legacy est supprimée sur place, sans migration.
- `cairn auto-upgrade status|on|off|run` : `status` affiche en JSON le réglage, la version installée, la dernière vérification et la notification en attente ; `on`/`off` écrivent `autoUpgrade` dans `~/.cairn/config.json` et affichent le même rapport ; `run` interroge npm immédiatement, sans attendre l'intervalle de 24 heures ni le backoff. Exit 0 signifie succès, 1 une erreur d'exécution ou une exécution échouée, 2 une erreur d'usage.
- `cairn toolcheck` : détecte repository stacks et vérifie required tools ; seul un installer approuvé et pris en charge s'exécute, sinon `installer-unavailable`.
- `cairn cleanup --root <repo>` : signale par défaut, en lecture seule, les résidus legacy `.cairn` locaux au projet. `--yes` migre/réconcilie le valid active state vers le stockage user-home, supprime uniquement les résidus connus state/lock/tool, préserve les fichiers inconnus et ne supprime le répertoire que s'il est vide.
- `cairn memory check|index [--root <repo>]` : `check` compare `MEMORY.md` à `docs/memory/*.md` et affiche un rapport JSON ; il sort avec 1 en cas de notes non indexées, dead links, doublons, résumés périmés, caractères de contrôle dans les résumés ou chemins non sûrs, et les warnings n'échouent qu'avec `--strict`. Les entrées sont les lignes de liste sous `## Domain Knowledge` (ou toutes les lignes de liste d'un ancien fichier sans cette section) ; un lien vers une note dans une autre section est une mention que `index` ne réécrit jamais. `index` ajoute les notes manquantes et, si le `Summary:` a changé, remplace seulement le résumé après le lien (une ligne à plusieurs liens reste telle quelle) ; il ne supprime que les lignes placeholder de Cairn exactement identiques dans cette section, jamais d'entrées ni de dead links, et conserve le reste octet pour octet. `--dry-run` donne un aperçu. Si le point d'insertion est dans un bloc de code non fermé, `index` n'écrit rien et sort avec 1 avec `unclosed-fence`. Les erreurs d'usage sortent avec 2 ; `cairn memory` sans sous-commande affiche toujours le guide.
- `cairn plan check|index [--archive] [--root <repo>]` : la même chose pour `PLAN.md` et `docs/plan/*.md`, dont les entrées sont les lignes de liste sous les titres `## ` finissant par `Plans` (comme `## Superseded Plans`). `index` place un plan dont toutes les cases sont cochées en tête de `## Completed Plans` et tout autre plan dans `## Active Plans` ; seul `--archive` déplace des lignes vers `docs/plan/ARCHIVE.md` : les entrées terminées au-delà des 20 plus récentes, avec leurs paragraphes indentés, et le corps d'une section legacy `## Planning Rules`. `check` avertit quand `## Completed Plans` dépasse 20 entrées ou qu'une section legacy `## Planning Rules` subsiste.
- `cairn goal ...` : gère le goal du dépôt (`cairn goal --help`). `goal stats --history [--limit N]` agrège les goals terminés du dépôt sur tous ses worktrees : nombres completed/cancelled, médiane et p90 de durée, médianes de tasks et de receipts, taux de reruns, décisions de memory promotion, un `trend` older/newer dès 4 goals terminés et les goals récents ; sans historique il affiche `{"schemaVersion":1,"scope":"repository","goals":0}`. `completionCriteria` (`goal start --criteria`) est `advisory` : Cairn l'enregistre sans l'imposer, et la complétion dépend uniquement des preuves requises.
- `cairn-memory` : explore domain knowledge et met à jour `MEMORY.md`.
- `cairn-plan` : crée un decision-complete plan sous `docs/plan/`.
- `cairn-work` : exécute le prochain module task du `PLAN.md` courant avec deux verification gates.
- `cairn-review` : relit completed tasks par rapport au plan, memory et evidence.

Le custom marketplace lifecycle sépare source et versioned runtime. Staged validation précède chaque commit, le ownership manifest lie tous les managed digests et un échec déclenche un reverse-order rollback. Les artifacts modified ou unmanaged sont preserved et signalés comme conflict. Cairn ne modifie que ses propres TOML sections et ne force aucun feature/agent setting public.

Clean uninstall supprime `~/.cairn/install/` et le Codex cache root `$CODEX_HOME/plugins/cache/cairn` uniquement lorsque tous les managed scaffold directories sont vides ; tout contenu unmanaged est conservé. Il ne supprime ni le source repository, les `MEMORY.md`/`PLAN.md` du repository ou le Cairn goal state de user-home, ni le package global `cairn-ai`, les package-manager caches ou les legacy backups/settings hors du ownership manifest courant.

Codex utilise `skills/` et `commands/`. Claude Code utilise les commandes miroir et définitions d'agents sous `.claude/`. Antigravity utilise `.agents/workflows` et les global skills mirrors.

## Install Layout And Auto-Upgrade

Cairn place son installation sous `CAIRN_HOME` (par défaut `~/.cairn`). Les chemins de chaque host restent définis séparément par `CODEX_HOME`, `CLAUDE_HOME`, `ANTIGRAVITY_HOME`, `ANTIGRAVITY_CLI_HOME` et `CODEX_CONFIG_PATH`.

```text
~/.cairn/
  install/                  fichiers gérés par le lifecycle
    lifecycle.json          ownership manifest (schema 2: hosts, origin, retained runtimes)
    lifecycle.lock, transaction.json, transactions/
    runtime/<version>/      canonical runtime utilisé par tous les runtime locators et les hooks Claude Code
    codex/                  Codex local marketplace source
    claude/                 Claude Code local marketplace
  projects/                 goal state
  config.json               réglages utilisateur ("autoUpgrade")
  update/                   état de l'auto-upgrade
$CODEX_HOME/plugins/cache/cairn/cairn/<version>/   copie dans le Codex plugin cache (seulement si Codex est choisi)
```

- Hosts : seuls `install` et `upgrade` acceptent `--hosts`, avec `all` ou une liste séparée par des virgules de `codex`, `claude` et `antigravity`. La sélection est enregistrée dans le ownership manifest et suivie par `upgrade`, `doctor` et `uninstall`. On la change avec `cairn upgrade --hosts <list>` ; un fichier géré modifié d'un host retiré entraîne un refus. Le prompt interactif (tous par défaut, Claude Code seul, Codex seul, Antigravity seul ou une liste) n'apparaît que si rien n'est encore installé.
- Migration : une installation faite par Cairn 0.6.0 ou antérieur (tout sous `$CODEX_HOME/plugins/cache/cairn`) passe sous `~/.cairn/install/` en un seul `cairn upgrade`, qui réenregistre aussi le plugin Claude Code depuis le nouveau chemin du marketplace. Une migration échouée ou interrompue est restaurée, et des fichiers gérés modifiés la refusent sans rien changer. L'installation legacy migre avec tous les hosts ; un `--hosts` partiel se choisit donc à l'exécution suivante. Ensuite, gérez l'installation uniquement avec un Cairn CLI qui connaît ce layout et redémarrez les sessions ouvertes pendant la migration.
- Rétention : un upgrade qui change de version garde le canonical runtime précédent et la copie du Codex cache pendant 3 jours (au plus 3 de chaque type) pour que les sessions démarrées avant continuent de fonctionner. Le install ou upgrade suivant supprime ceux qui ont expiré, et uninstall les supprime tous. Une copie du Codex cache égale ou supérieure à la nouvelle version n'est jamais gardée, car Codex charge la version la plus haute du cache.
- Claude Code plugin cache : s'il contient encore une autre version, `cairn upgrade` le met à jour avec `claude plugin marketplace update cairn` et `claude plugin update cairn@cairn --scope user`. En cas d'échec, l'installation mise à jour est conservée, les commandes pour terminer à la main sont affichées et la sortie est exit 1.
- Auto-upgrade : activé par défaut. Au plus une fois toutes les 24 heures (et pas dans les 24 heures qui suivent un install ou un upgrade), `SessionStart` lance un processus détaché qui lit la dernière version de `cairn-ai` sur npm, installe cette version exacte avec `--ignore-scripts` dans `~/.cairn/update/stage/`, la vérifie, puis exécute son `cairn-lifecycle.mjs upgrade --auto`. Toutes les nouvelles versions sont appliquées, major comprises, sans jamais de downgrade. Le `SessionStart` suivant affiche le résultat (`updated`, `failed` ou `manual`) en une ligne, une seule fois. Rien ne s'exécute pour une installation depuis un git checkout (`origin: "checkout"`) ni depuis un source checkout.
- Désactiver : `cairn auto-upgrade off`, `CAIRN_AUTO_UPGRADE=0` (ou `false`, `off`, `no`) ou `"autoUpgrade": false` dans `~/.cairn/config.json`. Un `config.json` illisible le désactive aussi. L'état et le log de la dernière exécution se trouvent dans `~/.cairn/update/`.

## Antigravity Compatibility

Antigravity prend en charge les Agent Skills et Workflows basés sur `SKILL.md`, invoqués comme `/workflow-name`. Cairn installe ces paths pour cette surface.

- Antigravity IDE : `~/.gemini/config/skills/cairn-*/SKILL.md`.
- Antigravity CLI : fichiers skill plats sous `~/.gemini/antigravity-cli/skills/cairn-*.md`.

Les hooks propres à Codex ne sont pas portés vers Antigravity. À la place, les mêmes procédures planning, memory, complexity triage et two-gate verification s'exécutent via Skills et Workflows. Définissez `ANTIGRAVITY_HOME` ou `ANTIGRAVITY_CLI_HOME` pour remplacer les paths.

## Locale Policy

Les instructions réutilisables de Cairn sont écrites en anglais pour un usage global. La sortie visible par l'utilisateur ainsi que la documentation, les plans et les artifacts mémoire générés ou mis à jour doivent suivre l'OS locale configurée, sauf si l'utilisateur demande explicitement une autre langue. Cela inclut le contenu de `MEMORY.md`, `PLAN.md`, `docs/memory` et `docs/plan`. La CLI localise les messages communs pour `en`, `ko`, `ja`, `zh`, `es`, `fr`, `de` et `pt`, puis revient à English pour les locales non prises en charge. Le texte `statusMessage` des Codex hooks reste en anglais statique, tandis que hook command output est English ou Korean.

## Delegation

- `explorer` : gère read-only codebase discovery, impact analysis, pattern searches et read-only verification quand disponible.
- `worker` : gère des bounded implementation ou verification tasks avec file ownership clair.
- Main session : garde local l'urgent blocking work quand l'étape suivante dépend immédiatement du résultat.

Chaque delegation prompt utilise six sections : TASK, EXPECTED OUTCOME, REQUIRED TOOLS, MUST DO, MUST NOT DO, CONTEXT.
