# Cairn

Cairn es un plugin de harness multi-agente eficiente en tokens para Codex, Claude Code y Antigravity.

[English](README.md)

La idea central es conservar las partes útiles de LazyCodex: hooks, estado persistente, planificación explícita, roles de agentes y guardas al detenerse. Cairn no hace que los bucles repetidos de verificación TDD sean el comportamiento predeterminado. En su lugar, divide el trabajo en pequeños module slices y prueba cada slice con dos verification gates.

1. Module acceptance verification: prueba el contrato del módulo modificado.
2. Surface integration verification: prueba el comportamiento a través de una superficie real, como CLI, HTTP, navegador o artefactos de archivo.

Antes de que un slice modifique estado externo, Cairn registra y ejecuta el dry-run o check mode más cercano disponible. La verificación está acotada: cada slice tiene dos verification passes por defecto; después, el agente registra un blocker o divide el slice en lugar de continuar un bucle abierto.

Cairn también trata la preparación de herramientas como parte del trabajo. LSP, typecheck, lint, dry-run y verification tools se revisan contra el stack del repositorio. Si falta una herramienta requerida, Cairn intenta una instalación project-local o repository-native antes de aceptar un fallback.

## Complexity Triage

Cada tarea del usuario pasa primero por complexity triage. El triage se decide a partir de la exploración del repositorio, el alcance esperado del cambio y señales de riesgo, sin preguntar al usuario por hechos que se puedan descubrir.

- Fast route: un solo módulo, bajo riesgo, alcance de archivos claro y patrón existente obvio usan `planner -> builder`.
- Full route: varios módulos, impacto en datos/permisos/migraciones/integraciones externas/arquitectura, o política de dominio poco clara usan `architect -> planner -> reviewer -> builder -> reviewer`.

La ruta seleccionada y su justificación se registran en `docs/plan/<topic>.md`. Incluso en fast route, los dos verification gates se mantienen después de que termina `builder`.

## Tool Readiness

`cairn toolcheck` inspecciona el repositorio actual para stacks JavaScript, TypeScript, Python, PHP, Java, Kotlin, Swift, Go y Rust, y luego revisa los LSP y verification tools correspondientes.

```sh
cairn toolcheck
cairn toolcheck --install
```

- `toolcheck` reporta detected stacks y missing tools.
- `toolcheck --install` intenta la ruta de instalación project-local o repository-native más cercana, como dev dependencies del package manager, dev dependencies de Composer, `uv`, Java LSP bootstrap, `go install` o `rustup component add`.
- Los planes de Cairn registran detected stack, required tools, install commands y blockers.
- Que falte un LSP server no es razón válida para saltarse precise codebase exploration hasta intentar installation o un fallback symbol-aware equivalente.

## Dry-Run And Loop Policy

- Migrations y database changes usan `--pretend`, dry-run, schema diff, rollback feasibility checks o el equivalente repository-native más cercano antes de comandos write/apply.
- Package, release, infrastructure, deployment, code generation y formatting work usan check, plan, diff, validate o dry-run modes antes de mutar estado cuando están disponibles.
- Si no existe dry-run, el plan registra ese hecho y elige el comando reversible más pequeño o el artefacto de prueba disponible.
- Si falla un verification gate, Cairn diagnostica una vez, reduce o divide el slice y vuelve a ejecutar ambos gates.
- Después de dos verification passes fallidos para el mismo slice, Cairn registra el blocker en `docs/plan/<topic>.md` en lugar de continuar un bucle repetido.

## Model Guidance

Cairn solo aplica ajustes específicos de modelo a modelos Claude-family y Codex-family.

- Claude-family: preferido para `architect`, `planner` y `reviewer`. Úsalo para long context, policy interpretation y plan/evidence review.
- Codex-family: preferido para `builder`, `worker` y `planner` estructuralmente claro. Úsalo para small implementation slices, explicit file edits y command-based verification.

La guía detallada vive en `docs/model-guidance/README.md`, `docs/model-guidance/claude.md` y `docs/model-guidance/codex.md`.

## Repository Artifacts

El harness crea y mantiene estos archivos en la raíz del repositorio objetivo.

- `MEMORY.md`: índice corto de conocimiento persistente del dominio.
- `docs/memory/*.md`: conocimiento detallado por dominio.
- `docs/model-guidance/*.md`: guía de ajuste de modelos Claude y Codex.
- `PLAN.md`: índice corto de temas activos y completados.
- `docs/plan/*.md`: planes de ejecución detallados.

Los archivos raíz se mantienen cortos y los detalles pasan a `docs/`, para que los agentes lean solo el contexto que necesitan.

## Commands

El paquete publicado puede ejecutarse con un estilo similar a LazyCodex.

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

- `cairn install`: instala el plugin en el Codex marketplace cache y configura hook trust state, mirror files de Claude Code y skills/workflows de Antigravity.
- `cairn upgrade`: actualiza la instalación, hook trust state, mirror files de Claude Code y skills/workflows de Antigravity desde la fuente actual.
- `cairn doctor`: diagnostica Codex settings, installation, hook trust state, mirror files de Claude Code y mirror files de Antigravity.
- `cairn uninstall`: elimina Codex settings, cache, mirror files de Claude Code y mirror files de Antigravity agregados por Cairn.
- `cairn toolcheck`: detecta repository stacks y revisa o instala required LSP y verification tools.
- `cairn-memory`: explora domain knowledge y actualiza `MEMORY.md`.
- `cairn-plan`: crea un decision-complete plan bajo `docs/plan/`.
- `cairn-work`: ejecuta el siguiente module slice del `PLAN.md` actual con dos verification gates.
- `cairn-review`: revisa completed slices contra plan, memory y evidence.

`install` y `upgrade` crean backups `*.cairn-backup-*` antes de modificar `~/.codex/config.toml`. El source plugin manifest permanece validator-friendly; solo la copia instalada en cache recibe un campo `hooks` para activar Codex hooks.

Codex usa `skills/` y `commands/`. Claude Code usa comandos reflejados y definiciones de agentes bajo `.claude/`. Antigravity usa `.agents/workflows` y mirrors globales de skills.

## Antigravity Compatibility

Antigravity soporta Agent Skills y Workflows basados en `SKILL.md` invocados como `/workflow-name`. Cairn instala estas rutas para esa superficie.

- Antigravity IDE: `~/.agents/skills/cairn-*`, `~/.agents/workflows/cairn-*.md`.
- Antigravity CLI: `~/.gemini/antigravity-cli/skills/cairn-*`, `~/.gemini/antigravity-cli/workflows/cairn-*.md`.

Los hooks exclusivos de Codex no se portan a Antigravity. En su lugar, los mismos procedimientos de planning, memory, complexity triage y two-gate verification se ejecutan mediante Skills y Workflows. Define `ANTIGRAVITY_HOME` o `ANTIGRAVITY_CLI_HOME` para sobrescribir las rutas.

## Locale Policy

Las instrucciones reutilizables de Cairn están escritas en inglés para uso global. El output visible para el usuario debe seguir el OS locale configurado, salvo que el usuario pida otro idioma explícitamente. La CLI localiza mensajes comunes para `en`, `ko`, `ja`, `zh`, `es`, `fr`, `de` y `pt`, y vuelve a English para locales no soportados. El texto `statusMessage` de Codex hooks permanece en inglés estático, mientras que hook command output es English o Korean.

## Agent Roles

- `architect`: resume system boundaries, risk y domain policy.
- `planner`: convierte explored facts en un decision-complete plan.
- `builder`: implementa un small module slice.
- `reviewer`: verifica behavior, policy y evidence.
- `worker`: maneja focused work como search, small edits y QA.

Cada delegation prompt usa seis secciones: TASK, EXPECTED OUTCOME, REQUIRED TOOLS, MUST DO, MUST NOT DO, CONTEXT.
