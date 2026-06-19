# PLAN

This file is a short index of active and completed work plans.

## Active Plans

- Link detailed plans under `docs/plan/`.

## Completed Plans

- Move completed topics here with evidence links.
- [Release 0.1.10 subagent lifecycle](docs/plan/release-0.1.10-subagent-lifecycle.md): PR #25 merged to `dev`, PR #26 merged to `main`, and `cairn-ai@0.1.10` published to npm.
- [Cairn subagent close on completion](docs/plan/cairn-subagent-close-on-completion.md): required delegated subagents to provide a final report before leaving, then close/release after evidence capture, then have the orchestrator review the final report and evidence before completion; verified with `node --test test/lifecycle.test.mjs`, `npm run check`, and `npm --cache /private/tmp/cairn-npm-cache pack --dry-run`.
- [Cairn subagent unavailable main fallback](docs/plan/cairn-subagent-unavailable-main-fallback.md): corrected unavailable-subagent fallback to main-agent takeover and made subagent progress reporting conditional on tool channel support; verified with `node --test test/lifecycle.test.mjs`, `npm run check`, and `npm --cache /private/tmp/cairn-npm-cache pack --dry-run`.
- [Cairn orchestrator-worker execution policy](docs/plan/cairn-orchestrator-worker-execution-policy.md): required main-agent orchestration, worker implementation delegation, subagent status reporting, and immediate user relay; verified with `node --test test/lifecycle.test.mjs`, `npm run check`, and `npm --cache /private/tmp/cairn-npm-cache pack --dry-run`.
- [Cairn stop gate plan index recheck](docs/plan/cairn-stop-gate-plan-index-recheck.md): stop hook now rechecks active, completed, and unindexed plan files; verified with `node --test test/lifecycle.test.mjs`, `npm run check`, and `npm --cache /private/tmp/cairn-npm-cache pack --dry-run`.
- [Release 0.1.9 Codex multi-agent settings](docs/plan/release-0.1.9-codex-multi-agent-settings.md): PR #22 merged to main, `cairn-ai@0.1.9` published to npm, and local Cairn installation upgraded.
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
