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

- `MEMORY.md`: indice curto de persistent domain knowledge.
- `docs/memory/*.md`: conhecimento detalhado por dominio.
- `.cairn/state.json`: estado git-ignored de goal, task e evidence record para retomada e stop gates com escopo.
- `PLAN.md`: indice curto de active and completed work topics.
- `docs/plan/*.md`: detailed execution plans.

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
```

- `cairn install`: instala de forma transacional custom marketplace source, versioned runtime, secoes config do Cairn e mirrors atuais.
- `cairn upgrade`: substitui apenas entradas intactas do ownership manifest apos staged validation e usa rollback em falhas.
- `cairn doctor`: valida ownership digests, features efetivos do Codex, status real do plugin e runtime locators sem reparar.
- `cairn uninstall`: remove apenas entradas gerenciadas intactas; alvos modified ou unmanaged sao preservados como conflict.
- `cairn toolcheck`: detecta repository stacks e verifica required tools; apenas um installer suportado e aprovado e executado, caso contrario `installer-unavailable`.
- `cairn-memory`: explora domain knowledge e atualiza `MEMORY.md`.
- `cairn-plan`: cria um decision-complete plan em `docs/plan/`.
- `cairn-work`: executa o proximo module task no `PLAN.md` atual com dois verification gates.
- `cairn-review`: revisa completed tasks contra plan, memory e evidence.

O custom marketplace lifecycle separa source e versioned runtime. Staged validation precede cada commit, o ownership manifest vincula todos os managed digests e uma falha aciona reverse-order rollback. Artifacts modified ou unmanaged sao preserved e relatados como conflict. O Cairn altera apenas suas TOML sections e nao forca feature/agent settings publicos.

Codex usa `skills/` e `commands/`. Claude Code usa comandos espelhados e agent definitions em `.claude/`. Antigravity usa `.agents/workflows` e global skills mirrors.

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
