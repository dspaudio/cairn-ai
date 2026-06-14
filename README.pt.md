# Cairn

Cairn e um plugin de harness multiagente eficiente em tokens para Codex, Claude Code e Antigravity.

[English](README.md)

A ideia central e manter as partes uteis do LazyCodex: hooks, estado persistente, planejamento explicito, papeis de agentes e guardas no momento de parada. Cairn nao torna loops repetidos de verificacao TDD o padrao. Em vez disso, divide o trabalho em pequenos module slices e prova cada slice com dois verification gates.

1. Module acceptance verification: prova o contrato do modulo alterado.
2. Surface integration verification: prova o comportamento por uma superficie real, como CLI, HTTP, navegador ou artefatos de arquivo.

Antes que um slice altere estado externo, Cairn registra e executa o dry-run ou check mode mais proximo disponivel. A verificacao e limitada: cada slice recebe duas verification passes por padrao; depois, o agente registra um blocker ou divide o slice em vez de continuar um loop aberto.

Cairn tambem trata tool readiness como parte do trabalho. LSP, typecheck, lint, dry-run e verification tools sao verificados contra o stack do repositorio. Se uma ferramenta obrigatoria estiver ausente, Cairn tenta uma instalacao project-local ou repository-native antes de aceitar um fallback.

## Complexity Triage

Cada user task passa primeiro por complexity triage. O triage e decidido a partir da exploracao do repositorio, do escopo esperado da mudanca e de sinais de risco, sem perguntar ao usuario por fatos descobriveis.

- Fast route: single module, low risk, clear file scope e existing pattern obvio usam `planner -> builder`.
- Full route: multiple modules, impacto em data/permission/migration/external integration/architecture, ou domain policy pouco clara usam `architect -> planner -> reviewer -> builder -> reviewer`.

A route escolhida e sua justificativa sao registradas em `docs/plan/<topic>.md`. Mesmo na fast route, os dois verification gates permanecem apos a conclusao de `builder`.

## Tool Readiness

`cairn toolcheck` inspeciona o repositorio atual para stacks JavaScript, TypeScript, Python, PHP, Java, Kotlin, Swift, Go e Rust, depois verifica os LSP e verification tools correspondentes.

```sh
cairn toolcheck
cairn toolcheck --install
```

- `toolcheck` informa detected stacks e missing tools.
- `toolcheck --install` tenta o caminho de instalacao project-local ou repository-native mais proximo, como dev dependencies do package manager, dev dependencies do Composer, `uv`, Java LSP bootstrap, `go install` ou `rustup component add`.
- Os planos Cairn registram detected stack, required tools, install commands e blockers.
- Um LSP server ausente nao e motivo valido para pular precise codebase exploration antes de tentar installation ou um fallback symbol-aware equivalente.

## Dry-Run And Loop Policy

- Migrations e database changes usam `--pretend`, dry-run, schema diff, rollback feasibility checks ou o equivalente repository-native mais proximo antes de write/apply commands.
- Package, release, infrastructure, deployment, code generation e formatting work usam check, plan, diff, validate ou dry-run modes antes de alterar estado quando disponiveis.
- Se nao houver dry-run, o plan registra esse fato e escolhe o menor command reversivel ou test artifact disponivel.
- Se um verification gate falhar, Cairn diagnostica uma vez, reduz ou divide o slice e executa novamente os dois gates.
- Depois de duas verification passes falhas para o mesmo slice, Cairn registra o blocker em `docs/plan/<topic>.md` em vez de continuar um loop repetido.

## Model Guidance

Cairn aplica model-specific adjustment apenas a modelos Claude-family e Codex-family.

- Claude-family: preferido para `architect`, `planner` e `reviewer`. Use para long context, policy interpretation e plan/evidence review.
- Codex-family: preferido para `builder`, `worker` e `planner` estruturalmente claro. Use para small implementation slices, explicit file edits e command-based verification.

A orientacao detalhada fica em `docs/model-guidance/README.md`, `docs/model-guidance/claude.md` e `docs/model-guidance/codex.md`.

## Repository Artifacts

O harness cria e mantem estes arquivos na raiz do repositorio alvo.

- `MEMORY.md`: indice curto de persistent domain knowledge.
- `docs/memory/*.md`: conhecimento detalhado por dominio.
- `docs/model-guidance/*.md`: Claude and Codex model adjustment guidance.
- `PLAN.md`: indice curto de active and completed work topics.
- `docs/plan/*.md`: detailed execution plans.

Arquivos raiz ficam curtos e os detalhes vao para `docs/`, para que agentes leiam apenas o contexto necessario.

## Commands

O pacote publicado pode ser executado no mesmo estilo do LazyCodex.

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

- `cairn install`: instala o plugin no Codex marketplace cache e configura hook trust state, Claude Code mirror files e Antigravity skills/workflows.
- `cairn upgrade`: atualiza installation, hook trust state, Claude Code mirror files e Antigravity skills/workflows a partir da source atual.
- `cairn doctor`: diagnostica Codex settings, installation, hook trust state, Claude Code mirror files e Antigravity mirror files.
- `cairn uninstall`: remove Codex settings, cache, Claude Code mirror files e Antigravity mirror files adicionados pelo Cairn.
- `cairn toolcheck`: detecta repository stacks e verifica ou instala required LSP e verification tools.
- `cairn-memory`: explora domain knowledge e atualiza `MEMORY.md`.
- `cairn-plan`: cria um decision-complete plan em `docs/plan/`.
- `cairn-work`: executa o proximo module slice no `PLAN.md` atual com dois verification gates.
- `cairn-review`: revisa completed slices contra plan, memory e evidence.

`install` e `upgrade` criam backups `*.cairn-backup-*` antes de modificar `~/.codex/config.toml`. O source plugin manifest permanece validator-friendly; apenas a installed cache copy recebe um campo `hooks` para ativar Codex hooks.

Codex usa `skills/` e `commands/`. Claude Code usa comandos espelhados e agent definitions em `.claude/`. Antigravity usa `.agents/workflows` e global skills mirrors.

## Antigravity Compatibility

Antigravity suporta Agent Skills e Workflows baseados em `SKILL.md` chamados como `/workflow-name`. Cairn instala estes paths para essa superficie.

- Antigravity IDE: `~/.agents/skills/cairn-*`, `~/.agents/workflows/cairn-*.md`.
- Antigravity CLI: `~/.gemini/antigravity-cli/skills/cairn-*`, `~/.gemini/antigravity-cli/workflows/cairn-*.md`.

Codex-only hooks nao sao portados para Antigravity. Em vez disso, os mesmos procedimentos de planning, memory, complexity triage e two-gate verification rodam por Skills e Workflows. Defina `ANTIGRAVITY_HOME` ou `ANTIGRAVITY_CLI_HOME` para sobrescrever paths.

## Locale Policy

As instrucoes reutilizaveis do Cairn sao escritas em English para global use. User-visible output deve seguir o OS locale configurado, a menos que o usuario peca explicitamente outro idioma. A CLI localiza mensagens comuns para `en`, `ko`, `ja`, `zh`, `es`, `fr`, `de` e `pt`, e volta para English em unsupported locales. O texto `statusMessage` dos Codex hooks permanece static English, enquanto hook command output e English ou Korean.

## Agent Roles

- `architect`: resume system boundaries, risk e domain policy.
- `planner`: converte explored facts em um decision-complete plan.
- `builder`: implementa um small module slice.
- `reviewer`: verifica behavior, policy e evidence.
- `worker`: lida com focused work como search, small edits e QA.

Todo delegation prompt usa seis sections: TASK, EXPECTED OUTCOME, REQUIRED TOOLS, MUST DO, MUST NOT DO, CONTEXT.
