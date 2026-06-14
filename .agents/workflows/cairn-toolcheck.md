# cairn-toolcheck

Goal: detect repository stacks and check required LSP, typecheck, lint, dry-run, and verification tools.

Run the local command first:

```sh
node scripts/cairn.mjs toolcheck
```

If required tools are missing, attempt repository-native installation:

```sh
node scripts/cairn.mjs toolcheck --install
```

Record detected stacks, missing tools, install attempts, and blockers in the related `docs/plan/<topic>.md`.
