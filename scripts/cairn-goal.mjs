#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runGoalCli } from "./cairn-goal-cli.mjs";
import { assignTask, replanGoal, setTaskStatus, startGoal, transitionGoal } from "./cairn-goal-operations.mjs";
import { recordReceipt, verifyAndRecord } from "./cairn-goal-operations-evidence.mjs";
import { readGoalState } from "./cairn-goal-state.mjs";
import { defaultGoalEvidence } from "./cairn-goal-state-validation.mjs";

export { workspaceFingerprint } from "./cairn-goal-evidence.mjs";
export { worktreeId } from "./cairn-paths.mjs";
export {
  GOAL_STATE_CONTRACT,
  GOAL_STATE_VERSION,
  GOAL_STATUSES,
  PLAN_ID_MAX_LENGTH,
  RECOVERY_REFERENCE_MAX_LENGTH,
  TASK_ID_MAX_LENGTH,
  TASK_STATUSES,
} from "./cairn-goal-state-validation.mjs";
export { goalStatePath, readGoalState, writeGoalState } from "./cairn-goal-state.mjs";
export { assignTask, reconcileWorktreeState, replanGoal, setTaskStatus, startGoal, transitionGoal } from "./cairn-goal-operations.mjs";
export { recordReceipt, verifyAndRecord } from "./cairn-goal-operations-evidence.mjs";
export { currentTask, evaluateStop, isGoalOwnedBySession } from "./cairn-goal-policy.mjs";

export async function handleGoalCli(args = process.argv.slice(2), { stdout = console.log } = {}) {
  return runGoalCli(args, {
    stdout,
    defaultGoalEvidence,
    operations: {
      assignTask,
      readGoalState,
      recordReceipt,
      replanGoal,
      setTaskStatus,
      startGoal,
      transitionGoal,
      verifyAndRecord,
    },
  });
}

function isCliEntry() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  }
}

if (isCliEntry()) {
  try {
    await handleGoalCli();
  } catch (error) {
    console.error(`Cairn goal error: ${error.message}`);
    process.exitCode = 1;
  }
}
