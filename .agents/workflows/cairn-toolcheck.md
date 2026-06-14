# cairn-toolcheck

Goal: detect repository stacks and check required LSP, typecheck, lint, dry-run, and verification tools.

Run the local command first:

```sh
scripts/cairn toolcheck
```

If required tools are missing, attempt repository-native installation:

```sh
scripts/cairn toolcheck --install
```

Record detected stacks, missing tools, install attempts, and blockers in the related `docs/plan/<topic>.md`.
