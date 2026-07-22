# Cairn

Cairn es un plugin de harness multi-agente eficiente en tokens para Codex, Claude Code y Antigravity.

[English](README.md)

La idea central es conservar comportamientos útiles de agent harness: hooks, estado persistente, planificación explícita, delegación enfocada y guardas al detenerse. Cairn no hace que los bucles repetidos de verificación TDD sean el comportamiento predeterminado. En su lugar, divide el trabajo en pequeños module tasks y prueba cada task con dos verification gates.

1. Module acceptance verification: prueba el contrato del módulo modificado.
2. Surface integration verification: prueba el comportamiento a través de una superficie real, como CLI, HTTP, navegador o artefactos de archivo.

Antes de que un task modifique estado externo, Cairn registra y ejecuta el dry-run o check mode más cercano disponible. La verificación está acotada: cada task tiene dos verification passes por defecto; después, el agente registra un blocker o divide el task en lugar de continuar un bucle abierto.

Cairn también trata la preparación de herramientas como parte del trabajo. LSP, typecheck, lint, dry-run y verification tools se revisan contra el stack del repositorio. Solo se instala con aprobación explícita y un installer compatible y fijado; de lo contrario se registra un blocker.

## LazyCodex Attribution

Cairn está influido por LazyCodex (`https://github.com/code-yeongyu/lazycodex`). Las ideas tomadas son la forma de agent harness instalable, el manejo de Codex hook trust/setup, project memory, planning skills, executable workflow commands, diagnostics y skill/agent packaging entre local agent surfaces.

Cairn diverge intencionalmente de LazyCodex en la execution policy. No adopta el role-chain execution model ni los open-ended completion loops de LazyCodex. Cairn usa Light/Heavy Path triage, delegación acotada con `explorer`/`worker`, dos verification gates y explicit stop conditions.

## Complexity Triage

Cada implementation task pasa primero por complexity triage, antes de aplicar agent, plugin o delegated workflow guidance. El triage se decide a partir de la exploración del repositorio, el alcance esperado del cambio y señales de riesgo, sin preguntar al usuario por hechos que se puedan descubrir.

- Light Path: cambios estrechos dentro de existing architecture layers. Es el valor predeterminado. Implementa directamente o usa un `worker` acotado, y conserva el verification gate.
- Heavy Path: new directory/module/layer, new domain model/service/abstraction, security/session/auth, external API/message queue/payment, DB schema/migration, concurrency/transaction/cache changes, cross-domain refactor o una explicit extra-care request.

El path seleccionado y su justificación se registran en `docs/plan/<topic>.md` cuando existe un plan artifact. Incluso en Light Path, se mantienen los dos verification gates.

## Tool Readiness

`cairn toolcheck` inspecciona el repositorio actual para stacks JavaScript, TypeScript, Python, PHP, Java, Kotlin, Swift, Go y Rust, y luego revisa los LSP y verification tools correspondientes.

```sh
cairn toolcheck --root .
cairn toolcheck --install --yes --root .
```

- `toolcheck` reporta detected stacks y missing tools.
- `toolcheck --install` exige aprobación explícita y `--yes`; un installer no compatible devuelve el resultado canónico `installer-unavailable` y no se ejecuta.
- Los planes de Cairn registran detected stack, required tools, install commands y blockers.
- Que falte un LSP server no es razón válida para saltarse precise codebase exploration hasta intentar installation o un fallback symbol-aware equivalente.

## Dry-Run And Loop Policy

- Migrations y database changes usan `--pretend`, dry-run, schema diff, rollback feasibility checks o el equivalente repository-native más cercano antes de comandos write/apply.
- Package, release, infrastructure, deployment, code generation y formatting work usan check, plan, diff, validate o dry-run modes antes de mutar estado cuando están disponibles.
- Si no existe dry-run, el plan registra ese hecho y elige el comando reversible más pequeño o el artefacto de prueba disponible.
- Si falla un verification gate, Cairn diagnostica una vez, reduce o divide el task y vuelve a ejecutar ambos gates.
- Después de dos verification passes fallidos para el mismo task, Cairn registra el blocker en `docs/plan/<topic>.md` en lugar de continuar un bucle repetido.

## Model Guidance

Cairn solo aplica ajustes específicos de modelo a modelos Claude-family y Codex-family.

- Claude-family: útil para long context, policy interpretation y plan/evidence review.
- Codex-family: útil para small implementation tasks, explicit file edits, command-based verification y bounded `worker` tasks.

La guía detallada vive en el plugin instalado y se referencia como `cairn://docs/model-guidance/README.md`, `cairn://docs/model-guidance/claude.md` y `cairn://docs/model-guidance/codex.md`.

## Repository Artifacts

El harness crea y mantiene estos archivos en la raíz del repositorio objetivo.

- `MEMORY.md`: índice corto de conocimiento persistente del dominio.
- `docs/memory/*.md`: conocimiento detallado por dominio.
- `.cairn/state.json`: estado git-ignored de goal, task y evidence record para reanudación y stop gates acotados.
- `PLAN.md`: índice corto de temas activos y completados.
- `docs/plan/*.md`: planes de ejecución detallados.

Los archivos raíz se mantienen cortos y los detalles pasan a `docs/`, para que los agentes lean solo el contexto que necesitan.

Para ahorrar tokens, define primero un test contract con requisitos, invariantes, límites y modos de fallo. Usa el tool exit code de `goal verify -- <argv>` como autoridad, resume el éxito y amplía el contexto solo al fallar. Inspecciona el package lifecycle y ejecuta normalmente `npm pack --dry-run`. Los scripts content-producing o desconocidos nunca deben usar `--ignore-scripts`; úsalo solo si no hay scripts o son content-neutral demostrados y la evidencia del full check sigue vigente.

## Commands

El paquete publicado puede ejecutarse con `bunx` o con comandos `cairn` instalados globalmente.

```sh
bunx cairn-ai@latest install
bunx cairn-ai@latest upgrade
bunx cairn-ai@latest doctor
bunx cairn-ai@latest uninstall
bunx cairn-ai@latest toolcheck
```

Después de una instalación global, también están disponibles comandos cortos.

```sh
bun add -g cairn-ai
cairn install
cairn upgrade
cairn doctor
cairn uninstall
cairn toolcheck
```

- `cairn install`: instala de forma transaccional custom marketplace source, versioned runtime, secciones config propias de Cairn y mirrors actuales.
- `cairn upgrade`: reemplaza solo entradas sin modificar del ownership manifest tras staged validation y usa rollback al fallar.
- `cairn doctor`: valida ownership digests, features efectivos de Codex, el estado real del plugin y runtime locators sin reparar.
- `cairn uninstall`: elimina solo entradas gestionadas sin modificar; los objetivos modified o unmanaged se preservan como conflict.
- `cairn toolcheck`: detecta repository stacks y revisa required tools; solo ejecuta un installer compatible aprobado, o devuelve `installer-unavailable`.
- `cairn-memory`: explora domain knowledge y actualiza `MEMORY.md`.
- `cairn-plan`: crea un decision-complete plan bajo `docs/plan/`.
- `cairn-work`: ejecuta el siguiente module task del `PLAN.md` actual con dos verification gates.
- `cairn-review`: revisa completed tasks contra plan, memory y evidence.

El custom marketplace lifecycle mantiene separados source y versioned runtime. Staged validation precede cada commit, el ownership manifest vincula todos los managed digests y un fallo aplica reverse-order rollback. Los artifacts modified o unmanaged se preservan y se reportan como conflict. Cairn modifica solo sus propias TOML sections y no fuerza feature/agent settings públicos.

Codex usa `skills/` y `commands/`. Claude Code usa comandos reflejados y definiciones de agentes bajo `.claude/`. Antigravity usa `.agents/workflows` y mirrors globales de skills.

## Antigravity Compatibility

Antigravity soporta Agent Skills y Workflows basados en `SKILL.md` invocados como `/workflow-name`. Cairn instala estas rutas para esa superficie.

- Antigravity IDE: `~/.gemini/config/skills/cairn-*/SKILL.md`.
- Antigravity CLI: archivos skill planos en `~/.gemini/antigravity-cli/skills/cairn-*.md`.

Los hooks exclusivos de Codex no se portan a Antigravity. En su lugar, los mismos procedimientos de planning, memory, complexity triage y two-gate verification se ejecutan mediante Skills y Workflows. Define `ANTIGRAVITY_HOME` o `ANTIGRAVITY_CLI_HOME` para sobrescribir las rutas.

## Locale Policy

Las instrucciones reutilizables de Cairn están escritas en inglés para uso global. El output visible para el usuario y la documentation, los plans y los memory artifacts generados o actualizados deben seguir el OS locale configurado, salvo que el usuario pida otro idioma explícitamente. Esto incluye el contenido de `MEMORY.md`, `PLAN.md`, `docs/memory` y `docs/plan`. La CLI localiza mensajes comunes para `en`, `ko`, `ja`, `zh`, `es`, `fr`, `de` y `pt`, y vuelve a English para locales no soportados. El texto `statusMessage` de Codex hooks permanece en inglés estático, mientras que hook command output es English o Korean.

## Delegation

- `explorer`: maneja read-only codebase discovery, impact analysis, pattern searches y read-only verification cuando está disponible.
- `worker`: maneja bounded implementation o verification tasks con file ownership claro.
- Main session: mantiene local el urgent blocking work cuando el siguiente paso depende inmediatamente del resultado.

Cada delegation prompt usa seis secciones: TASK, EXPECTED OUTCOME, REQUIRED TOOLS, MUST DO, MUST NOT DO, CONTEXT.
