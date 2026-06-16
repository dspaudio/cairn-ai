# PLAN

This file is a short index of active and completed work plans.

## Active Plans

- Link detailed plans under `docs/plan/`.

## Completed Plans

- Move completed topics here with evidence links.
- [Release 0.1.8 Cairn policy updates](docs/plan/release-0.1.8-cairn-policy-updates.md): PR #19 merged to main, `cairn-ai@0.1.8` published to npm, and local Cairn installation upgraded.
- [Cairn recursive subagent policy](docs/plan/cairn-recursive-subagent-policy.md): allowed recursive bounded sub-task delegation in plugin, skills, commands, workflows, and agent definitions; verified with `npm test`, `npm run check`, and `npm pack --dry-run`.
- [Cairn planner decomposition policy](docs/plan/cairn-planner-decomposition-policy.md): required whole-work planning before task/sub-task classification; verified with `npm test`, `npm run check`, and `npm pack --dry-run`.
- [Cairn task terminology](docs/plan/cairn-task-terminology.md): renamed user-facing module slice terminology to task/sub-task and verified with `npm test`, `npm run check`, and `npm pack --dry-run`.
- [Cairn interruption resume policy](docs/plan/cairn-interruption-resume-policy.md): added side-question resume guidance to plugin/work surfaces and verified with `npm test`, `npm run check`, and `npm pack --dry-run`.
- [Cairn plugin model settings and Heavy Path test gate](docs/plan/cairn-plugin-model-settings-heavy-path-tests.md): removed Claude-only agent model pins, added Heavy Path test evidence stop gate, and verified with `npm test`, `npm run check`, and `npm pack --dry-run`.
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
