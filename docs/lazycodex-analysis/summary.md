# LazyCodex Analysis

## Inputs

- User-provided image: `LazyCodex / OmO - principle of the agent harness that keeps asking until completion`.
- Local source reference: `/Users/wknam/workspace/oh-my-openagent/packages/omo-codex/plugin`.

## Observed LazyCodex Structure

LazyCodex moves oh-my-openagent concepts onto the Codex plugin surface. The local OMO plugin exposes the following pieces.

- `UserPromptSubmit` hook: injects project rules and ultrawork triggers.
- `PostToolUse` hook: runs comment checker, LSP diagnostics, and project rule matching.
- `PostCompact` hook: rebuilds rule cache after context compaction.
- `Stop`, `SubagentStop` hooks: block premature completion and continue work.
- Skills such as `ulw-plan`, `start-work`, `ulw-loop`, `review-work`, `debugging`, and `programming`.

The user-provided image describes the same loop: prompt trigger, context injection, agent work, stop-time checklist, evidence capture, and completion claim.

## Strengths To Keep

- Persistent state outside model context.
- Hooks that re-inject rules and state after compaction.
- Clear agent roles.
- Stop-time guards that prevent partial completion.
- Evidence-based completion instead of optimistic reporting.

## Token Cost Cause

High token cost comes from forcing red-green TDD, broad QA, and repeated stop continuation onto every task. This is useful for high-risk changes, but excessive for every module slice.

## Model Guidance Scope

LazyCodex finely separates guidance by multiple model families. Cairn 0.1.0 narrows scope to Claude-family and Codex-family models only.

- Claude-family: preferred for long context interpretation, policy judgment, architecture review, and plan consistency review.
- Codex-family: preferred for small implementation slices, clear file edits, command-based verification, and repeatable task execution.
- Other model-family guidance such as Kimi or Gemini is not included in 0.1.0 scope.

## Cairn Direction

Cairn keeps persistent state and guards, but changes execution style.

- First step: precise codebase exploration creates compressed domain memory.
- Second step: planning splits work into small module slices with named contracts.
- Each slice normally passes only two verification gates.
  - Module acceptance verification.
  - Surface integration verification.
- Repeated loops run only on failure, not by default.

As a result, tokens go to exploration quality, domain policy, and plan clarity instead of repeatedly verifying the same slice.
