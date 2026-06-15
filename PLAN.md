# PLAN

This file is a short index of active and completed work plans.

## Active Plans

- Link detailed plans under `docs/plan/`.

## Completed Plans

- Move completed topics here with evidence links.
- [Cairn verification infrastructure](docs/plan/cairn-verification-infrastructure.md): lifecycle/toolcheck regression tests, fixtures, CI, and packaging dry-run evidence.
- [Release 0.1.7 stop gate](docs/plan/release-0.1.7-stop-gate.md): PR #17 merged to main, `cairn-ai@0.1.7` published to npm, and local Cairn installation upgraded.

## Planning Rules

- Plans must be decision-complete before implementation.
- Split implementation into small module slices.
- Detect repository stack and required LSP/check tools before implementation.
- Install or bootstrap missing required tools before declaring them unavailable.
- Each slice normally passes exactly two gates.
  - Module acceptance verification.
  - Surface integration verification.
- Run dry-run or check mode before external-state mutation when available.
- Use at most two verification passes per slice by default.
- If a gate fails, diagnose once, shrink or split the slice, and rerun both gates.
- After two failed passes, record the blocker in `docs/plan/<topic>.md`.
