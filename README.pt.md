# Cairn

Cairn e um plugin de harness multiagente eficiente em tokens para Codex, Claude Code e Antigravity.

[English](README.md)

A ideia central e manter comportamentos uteis de agent harness: hooks, estado persistente, planejamento explicito, delegacao focada e guardas no momento de parada. Cairn nao torna loops repetidos de verificacao TDD o padrao. Em vez disso, divide o trabalho em pequenos module tasks e prova cada task com dois verification gates.

1. Module acceptance verification: prova o contrato do modulo alterado.
2. Surface integration verification: prova o comportamento por uma superficie real, como CLI, HTTP, navegador ou artefatos de arquivo.

Antes que um task altere estado externo, Cairn registra e executa o dry-run ou check mode mais proximo disponivel. A verificacao e limitada: cada task recebe duas verification passes por padrao; depois, o agente registra um blocker ou divide o task em vez de continuar um loop aberto.

Cairn tambem trata tool readiness como parte do trabalho. LSP, typecheck, lint, dry-run e verification tools sao verificados contra o stack do repositorio. A instalacao ocorre apenas com aprovacao explicita e um installer suportado e fixado; caso contrario, um blocker e informado.

## LazyCodex Attribution

Cairn e influenciado pelo LazyCodex (`https://github.com/code-yeongyu/lazycodex`). As ideias aproveitadas sao o formato de agent harness instalavel, Codex hook trust/setup handling, project memory, planning skills, executable workflow commands, diagnostics e skill/agent packaging entre local agent surfaces.

Cairn diverge intencionalmente do LazyCodex na execution policy. Ele nao adota o role-chain execution model nem open-ended completion loops do LazyCodex. Cairn usa Light/Heavy Path triage, delegacao limitada `explorer`/`worker`, dois verification gates e explicit stop conditions.

## Complexity Triage

Cada implementation task passa primeiro por complexity triage, antes de aplicar agent, plugin ou delegated workflow guidance. O triage e decidido a partir da exploracao do repositorio, do escopo esperado da mudanca e de sinais de risco, sem perguntar ao usuario por fatos descobriveis.

- Light Path: mudancas estreitas dentro de existing architecture layers. E o padrao. Implemente diretamente ou use um `worker` limitado, depois mantenha o verification gate.
- Heavy Path: new directory/module/layer, new domain model/service/abstraction, security/session/auth, external API/message queue/payment, DB schema/migration, concurrency/transaction/cache changes, cross-domain refactor ou explicit extra-care request.

O path escolhido e sua justificativa sao registrados em `docs/plan/<topic>.md` quando houver um plan artifact. Mesmo no Light Path, os dois verification gates permanecem.

## Tool Readiness

`cairn toolcheck` inspeciona o repositorio atual para stacks JavaScript, TypeScript, Python, PHP, Java, Kotlin, Swift, Go e Rust, depois verifica os LSP e verification tools correspondentes.

```sh
cairn toolcheck --root .
cairn toolcheck --install --yes --root .
```

- `toolcheck` informa detected stacks e missing tools.
- `toolcheck --install` exige aprovacao explicita e `--yes`; um installer sem suporte retorna o resultado canonico `installer-unavailable` sem ser executado.
- Os planos Cairn registram detected stack, required tools, install commands e blockers.
- Um LSP server ausente nao e motivo valido para pular precise codebase exploration antes de tentar installation ou um fallback symbol-aware equivalente.

## Dry-Run And Loop Policy

- Migrations e database changes usam `--pretend`, dry-run, schema diff, rollback feasibility checks ou o equivalente repository-native mais proximo antes de write/apply commands.
- Package, release, infrastructure, deployment, code generation e formatting work usam check, plan, diff, validate ou dry-run modes antes de alterar estado quando disponiveis.
- Se nao houver dry-run, o plan registra esse fato e escolhe o menor command reversivel ou test artifact disponivel.
- Se um verification gate falhar, Cairn diagnostica uma vez, reduz ou divide o task e executa novamente os dois gates.
- Depois de duas verification passes falhas para o mesmo task, Cairn registra o blocker em `docs/plan/<topic>.md` em vez de continuar um loop repetido.

## Model Guidance

Cairn aplica model-specific adjustment apenas a modelos Claude-family e Codex-family.

- Claude-family: util para long context, policy interpretation e plan/evidence review.
- Codex-family: util para small implementation tasks, explicit file edits, command-based verification e bounded `worker` tasks.

A orientação detalhada fica no plugin instalado em `cairn://docs/model-guidance/README.md`, `cairn://docs/model-guidance/claude.md` e `cairn://docs/model-guidance/codex.md`.

## Repository Artifacts

O harness cria e mantem estes arquivos na raiz do repositorio alvo.

- `MEMORY.md`: indice curto de persistent domain knowledge: uma linha por nota em `## Domain Knowledge` (`- [<name>](docs/memory/<name>.md): <summary>`) mais a `## Policy` do repositorio.
- `docs/memory/*.md`: conhecimento detalhado por dominio. Cada nota comeca com uma linha `Summary:` (no maximo 120 caracteres) que o indice e o hook exibem.
- `~/.cairn/projects/<project-id>/worktrees/<worktree-id>/state.json`: active goal/task/evidence state no user-home, isolado por projeto e worktree, para retomada e scoped stop gates. O working tree nao possui runtime state.
- `PLAN.md`: indice curto de planos de trabalho: uma linha de ate 200 caracteres por plano em `## Active Plans` e `## Completed Plans`. As regras de planejamento ficam no skill `cairn-plan`, nao em `PLAN.md`.
- `docs/plan/*.md`: detailed execution plans.
- `docs/plan/ARCHIVE.md`: entradas concluidas antigas movidas de `PLAN.md` por `cairn plan index --archive`, da mais nova para a mais antiga, mais o corpo de uma secao legacy `## Planning Rules` sob `## Legacy Planning Rules`. Linhas de lista antes do seu primeiro titulo `## ` continuam contando como indexadas.
- `~/.cairn/projects/<project-id>/worktrees/<worktree-id>/history.jsonl`: um registro resumido por goal concluido ou cancelado (os 200 mais recentes por worktree) para `goal stats --history`.

Mantenha `## Completed Plans` da mais nova para a mais antiga. `cairn plan index --archive` mantem as primeiras 20 entradas e move o restante para `docs/plan/ARCHIVE.md` sem apagar nada; uma lista mantida da mais antiga para a mais nova arquivaria os planos mais recentes. Confira antes com `--dry-run`. `MEMORY.md`/`PLAN.md` existentes funcionam sem migracao: `init` nunca os reescreve e `check` apenas avisa sobre o formato antigo com warnings.

No `SessionStart`, o hook informa ao agente quais notas de memoria existem (nome e `Summary:`, ou uma linha so com nomes quando a lista e longa) e, sem goal ativo, adiciona uma linha sobre o indice de planos: quantidade de planos, planos ativos, os ultimos planos concluidos e `docs/plan/ARCHIVE.md` quando existe. Com um goal active, paused, blocked ou de outra sessao, so a lista de memoria e adicionada, e a capsula de outra sessao nunca mostra nomes de planos. Um `UserPromptSubmit` sem goal adiciona uma frase com a quantidade de notas. O hook le apenas os arquivos de indice e listagens de diretorio, nunca o corpo das notas, e nao escreve nada; um repositorio sem notas nem planos recebe a mesma saida de antes.

Antes de `goal finish`, `cairn-work` registra uma decisao de memory promotion por goal na Evidence do plano: `Memory promotion: docs/memory/<domain>.md` quando o goal gerou conhecimento reutilizavel do repositorio, ou `Memory promotion: none: <reason>` caso contrario. A decisao e obrigatoria; escrever uma nota e opcional. Quando um goal e concluido e o arquivo do plano nao tem uma linha `Memory promotion:` preenchida, `goal finish` e `goal complete` imprimem um lembrete de uma linha no stderr sem alterar o exit code nem o stdout.

Arquivos raiz ficam curtos e os detalhes vao para `docs/`, para que agentes leiam apenas o contexto necessario.

Para economizar tokens, crie primeiro um test contract com requisitos, invariantes, limites e modos de falha. Use o tool exit code de `goal verify -- <argv>` como autoridade, resuma o sucesso e expanda o contexto apenas em falhas. Inspecione o package lifecycle e execute normalmente `npm pack --dry-run`. Scripts content-producing ou desconhecidos nunca devem usar `--ignore-scripts`; use-o apenas quando os scripts estiverem ausentes ou comprovadamente content-neutral e a evidencia do full check continuar atual.

## Commands

O pacote publicado pode ser executado com `bunx` ou comandos `cairn` instalados globalmente.

```sh
bunx cairn-ai@latest install
bunx cairn-ai@latest upgrade
bunx cairn-ai@latest doctor
bunx cairn-ai@latest uninstall
bunx cairn-ai@latest toolcheck
```

Apos a instalacao global, comandos curtos tambem ficam disponiveis.

```sh
bun add -g cairn-ai
cairn install
cairn upgrade
cairn doctor
cairn uninstall
cairn toolcheck
cairn auto-upgrade status
```

- `cairn install [--hosts all|codex,claude,antigravity]`: instala de forma transacional custom marketplace source, versioned runtime, secoes config do Cairn e mirrors atuais. O canonical runtime fica em `~/.cairn/install/` e o resto e instalado apenas para os hosts escolhidos. Sem `--hosts`, a primeira instalacao em um terminal pergunta os hosts; execucoes nao interativas e CI instalam todos.
- `cairn upgrade [--hosts all|codex,claude,antigravity]`: substitui apenas entradas intactas do ownership manifest apos staged validation e usa rollback em falhas. Mantem os hosts registrados, a menos que `--hosts` os altere, migra uma instalacao do Cairn 0.6.0 ou anterior e atualiza um Claude Code plugin cache que ainda tenha outra versao. Se a versao instalada for mais nova que esta CLI, `install` e `upgrade` recusam sem mudar nada; `--allow-downgrade` instala mesmo assim a versao desta CLI.
- `cairn doctor`: valida ownership digests, features efetivos do Codex, status real do plugin e runtime locators sem reparar. Imprime primeiro `Hosts: <ids>` e verifica apenas os hosts escolhidos (incluindo `Claude plugin cache version`). Uma instalacao legacy e relatada com a indicacao de migrar com `cairn upgrade`.
- `cairn uninstall`: primeiro compara cada entrada nao config do ownership manifest com seu installed digest e recusa todo o uninstall, sem mudar nada, se algum managed artifact foi modificado ou removido. Caso contrario, remove ou restaura as entradas gerenciadas e os retained runtimes, limpa os managed scaffolds vazios, preserva alvos unmanaged e seus diretorios pai e aplica rollback a falhas antes do commit. Tambem remove `~/.cairn/update/`, e mantem `~/.cairn/config.json` e `~/.cairn/projects/`. Uma instalacao com layout legacy e removida no lugar, sem migracao.
- `cairn auto-upgrade status|on|off|run`: `status` imprime em JSON a configuracao, a versao instalada, a ultima verificacao e o aviso pendente; `on`/`off` gravam `autoUpgrade` em `~/.cairn/config.json` e imprimem o mesmo relatorio; `run` consulta o npm agora, sem esperar o intervalo de 24 horas nem o backoff. Exit 0 e sucesso, 1 erro de execucao ou execucao com falha, 2 erro de uso.
- `cairn toolcheck`: detecta repository stacks e verifica required tools; apenas um installer suportado e aprovado e executado, caso contrario `installer-unavailable`.
- `cairn cleanup --root <repo>`: por padrao relata em modo read-only residuos legacy `.cairn` locais do projeto. `--yes` migra/reconcilia valid active state para o user-home store, remove apenas residuos conhecidos de state/lock/tool, preserva arquivos desconhecidos e remove o diretorio somente quando vazio.
- `cairn memory check|index [--root <repo>]`: `check` compara `MEMORY.md` com `docs/memory/*.md` e imprime um relatorio JSON; sai com 1 para notas nao indexadas, dead links, duplicatas, resumos desatualizados, caracteres de controle em resumos ou caminhos inseguros, e warnings so falham com `--strict`. Entradas sao linhas de lista sob `## Domain Knowledge` (ou todas as linhas de lista num arquivo antigo sem essa secao); um link de nota em outra secao e uma mencao que `index` nunca reescreve. `index` adiciona notas ausentes e, quando o `Summary:` muda, troca so o resumo apos o link (uma linha com varios links fica como esta); remove apenas linhas placeholder do Cairn que coincidem exatamente nessa secao, nunca apaga entradas nem dead links e preserva o restante byte a byte. `--dry-run` mostra uma previa. Se o ponto de insercao estiver dentro de um bloco de codigo nao fechado, `index` nao escreve nada e sai com 1 com `unclosed-fence`. Erros de uso saem com 2; `cairn memory` sem subcomando continua imprimindo a orientacao.
- `cairn plan check|index [--archive] [--root <repo>]`: o mesmo para `PLAN.md` e `docs/plan/*.md`, cujas entradas sao linhas de lista sob titulos `## ` que terminam em `Plans` (como `## Superseded Plans`). `index` coloca um plano com todas as caixas marcadas no topo de `## Completed Plans` e qualquer outro em `## Active Plans`; so `--archive` move linhas para `docs/plan/ARCHIVE.md`: entradas concluidas alem das 20 mais novas, com seus paragrafos recuados, e o corpo de uma secao legacy `## Planning Rules`. `check` avisa quando `## Completed Plans` passa de 20 entradas ou resta uma secao legacy `## Planning Rules`.
- `cairn goal ...`: gerencia o goal do repositorio (`cairn goal --help`). `goal stats --history [--limit N]` agrega os goals encerrados do repositorio em todos os worktrees: contagens completed/cancelled, mediana e p90 de duracao, medianas de tasks e receipts, taxa de reruns, decisoes de memory promotion, um `trend` older/newer a partir de 4 goals concluidos e os goals recentes; sem historico imprime `{"schemaVersion":1,"scope":"repository","goals":0}`. `completionCriteria` (`goal start --criteria`) e `advisory`: o Cairn registra mas nao o impoe, e a conclusao depende apenas da evidencia exigida.
- `cairn-memory`: explora domain knowledge e atualiza `MEMORY.md`.
- `cairn-plan`: cria um decision-complete plan em `docs/plan/`.
- `cairn-work`: executa o proximo module task no `PLAN.md` atual com dois verification gates.
- `cairn-review`: revisa completed tasks contra plan, memory e evidence.

O custom marketplace lifecycle separa source e versioned runtime. Staged validation precede cada commit, o ownership manifest vincula todos os managed digests e uma falha aciona reverse-order rollback. Artifacts modified ou unmanaged sao preserved e relatados como conflict. O Cairn altera apenas suas TOML sections e nao forca feature/agent settings publicos.

Clean uninstall remove `~/.cairn/install/` e o Codex cache root `$CODEX_HOME/plugins/cache/cairn` somente quando todos os managed scaffold directories estao vazios; qualquer conteudo unmanaged e preservado. O source repository, repository `MEMORY.md`/`PLAN.md` e user-home Cairn goal state, o package global `cairn-ai`, package-manager caches e legacy backups/settings fora do ownership manifest atual nao sao removidos automaticamente.

Codex usa `skills/` e `commands/`. Claude Code usa comandos espelhados e agent definitions em `.claude/`. Antigravity usa `.agents/workflows` e global skills mirrors.

## Install Layout And Auto-Upgrade

O Cairn guarda a instalacao em `CAIRN_HOME` (padrao `~/.cairn`). Os caminhos de cada host continuam definidos separadamente por `CODEX_HOME`, `CLAUDE_HOME`, `ANTIGRAVITY_HOME`, `ANTIGRAVITY_CLI_HOME` e `CODEX_CONFIG_PATH`.

```text
~/.cairn/
  install/                  arquivos gerenciados pelo lifecycle
    lifecycle.json          ownership manifest (schema 2: hosts, origin, retained runtimes)
    lifecycle.lock, transaction.json, transactions/
    runtime/<version>/      canonical runtime usado por todos os runtime locators e pelos hooks do Claude Code
    codex/                  Codex local marketplace source
    claude/                 Claude Code local marketplace
  projects/                 goal state
  config.json               configuracoes do usuario ("autoUpgrade")
  update/                   estado do auto-upgrade
$CODEX_HOME/plugins/cache/cairn/cairn/<version>/   copia no Codex plugin cache (somente se Codex for escolhido)
```

- Hosts: apenas `install` e `upgrade` aceitam `--hosts`, com `all` ou uma lista separada por virgulas de `codex`, `claude` e `antigravity`. A selecao fica no ownership manifest e `upgrade`, `doctor` e `uninstall` a seguem. Ela muda com `cairn upgrade --hosts <list>`; um arquivo gerenciado modificado de um host removido causa recusa. O prompt interativo (todos por padrao, apenas Claude Code, apenas Codex, apenas Antigravity ou uma lista) aparece somente quando nada esta instalado.
- Migracao: uma instalacao do Cairn 0.6.0 ou anterior (tudo em `$CODEX_HOME/plugins/cache/cairn`) passa para `~/.cairn/install/` com um unico `cairn upgrade`, que tambem registra de novo o plugin do Claude Code a partir do novo caminho do marketplace. Uma migracao com falha ou interrompida e restaurada, e arquivos gerenciados modificados a recusam sem mudancas. A instalacao legacy migra com todos os hosts; um `--hosts` parcial fica para a execucao seguinte. Depois, gerencie a instalacao apenas com um Cairn CLI que conheca este layout e reinicie as sessoes abertas durante a migracao.
- Retencao: um upgrade que muda a versao mantem o canonical runtime anterior e a copia do Codex cache por 3 dias (no maximo 3 de cada tipo) para que sessoes iniciadas antes continuem funcionando. O install ou upgrade seguinte remove os vencidos, e uninstall remove todos. Uma copia do Codex cache igual ou superior a nova versao nunca e mantida, porque o Codex carrega a versao mais alta do cache.
- Claude Code plugin cache: se ainda tiver outra versao, `cairn upgrade` o atualiza com `claude plugin marketplace update cairn` e `claude plugin update cairn@cairn --scope user`. Se falhar, a instalacao atualizada e mantida, os comandos para concluir manualmente sao impressos e a saida e exit 1.
- Auto-upgrade: ativado por padrao. No maximo uma vez a cada 24 horas (e nao nas 24 horas apos um install ou upgrade), `SessionStart` inicia um processo separado que le a versao mais recente de `cairn-ai` no npm, instala essa versao exata com `--ignore-scripts` em `~/.cairn/update/stage/`, verifica e executa o `cairn-lifecycle.mjs upgrade --auto` dela. Todas as versoes novas sao aplicadas, inclusive major, e nunca ha downgrade. O `SessionStart` seguinte mostra o resultado (`updated`, `failed` ou `manual`) em uma linha, uma unica vez. Nao funciona para instalacoes a partir de um git checkout (`origin: "checkout"`) nem ao executar de um source checkout.
- Desativar: `cairn auto-upgrade off`, `CAIRN_AUTO_UPGRADE=0` (ou `false`, `off`, `no`) ou `"autoUpgrade": false` em `~/.cairn/config.json`. Um `config.json` ilegivel tambem desativa. O estado e o log da ultima execucao ficam em `~/.cairn/update/`.

## Antigravity Compatibility

Antigravity suporta Agent Skills e Workflows baseados em `SKILL.md` chamados como `/workflow-name`. Cairn instala estes paths para essa superficie.

- Antigravity IDE: `~/.gemini/config/skills/cairn-*/SKILL.md`.
- Antigravity CLI: arquivos skill planos em `~/.gemini/antigravity-cli/skills/cairn-*.md`.

Codex-only hooks nao sao portados para Antigravity. Em vez disso, os mesmos procedimentos de planning, memory, complexity triage e two-gate verification rodam por Skills e Workflows. Defina `ANTIGRAVITY_HOME` ou `ANTIGRAVITY_CLI_HOME` para sobrescrever paths.

## Locale Policy

As instrucoes reutilizaveis do Cairn sao escritas em English para global use. User-visible output e documentation, plans e memory artifacts gerados ou atualizados devem seguir o OS locale configurado, a menos que o usuario peca explicitamente outro idioma. Isso inclui conteudo em `MEMORY.md`, `PLAN.md`, `docs/memory` e `docs/plan`. A CLI localiza mensagens comuns para `en`, `ko`, `ja`, `zh`, `es`, `fr`, `de` e `pt`, e volta para English em unsupported locales. O texto `statusMessage` dos Codex hooks permanece static English, enquanto hook command output e English ou Korean.

## Delegation

- `explorer`: lida com read-only codebase discovery, impact analysis, pattern searches e read-only verification quando disponivel.
- `worker`: lida com bounded implementation ou verification tasks com file ownership claro.
- Main session: mantem urgent blocking work local quando o proximo passo depende imediatamente do resultado.

Todo delegation prompt usa seis sections: TASK, EXPECTED OUTCOME, REQUIRED TOOLS, MUST DO, MUST NOT DO, CONTEXT.
