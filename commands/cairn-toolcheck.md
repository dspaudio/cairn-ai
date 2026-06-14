# cairn-toolcheck

Goal: detect repository stacks and check required LSP, typecheck, lint, dry-run, and verification tools.

From a globally installed package:

```sh
bunx cairn-ai@latest toolcheck
bunx cairn-ai@latest toolcheck --install
```

From this repository:

```sh
node scripts/cairn.mjs toolcheck
node scripts/cairn.mjs toolcheck --install
```

Use `--install` when a required tool is missing. Record detected stacks, missing tools, install attempts, and blockers in the related `docs/plan/<topic>.md`.
