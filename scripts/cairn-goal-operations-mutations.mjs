import { workspaceFingerprint } from "./cairn-goal-evidence.mjs";
import { readGoalStateUnlocked, withGoalStateLock, writeGoalStateUnlocked } from "./cairn-goal-state.mjs";
import { terminalGoalStatuses } from "./cairn-goal-state-validation.mjs";

export async function mutateGoal(root, mutate) {
  return withGoalStateLock(root, async () => {
    const state = await readGoalStateUnlocked(root);
    if (!state) throw new Error("No Cairn goal state exists; start a goal first");
    const next = await mutate(structuredClone(state));
    next.revision += 1;
    await writeGoalStateUnlocked({ root, state: next });
    return next;
  });
}

export function ensureTaskCanComplete(state, task, root) {
  for (const kind of task.requiredEvidence) ensureCurrentEvidence({ state, root, scope: "task", task, kind });
}

export function ensureGoalCanComplete(state, root) {
  const incomplete = state.tasks.filter((task) => task.status !== "completed");
  if (incomplete.length > 0) throw new Error(`Goal cannot be completed while tasks remain: ${incomplete.map((task) => task.id).join(", ")}`);
  for (const task of state.tasks) ensureTaskCanComplete(state, task, root);
  for (const kind of state.goal.requiredEvidence) ensureCurrentEvidence({ state, root, scope: "goal", kind });
}

function ensureCurrentEvidence({ state, root, scope, task, kind }) {
  const candidates = state.receipts.filter((receipt) => (
    receipt.scope === scope && receipt.kind === kind && (scope === "goal" || receipt.taskId === task.id)
  ));
  const subject = scope === "goal" ? "Goal" : `Task ${task.id}`;
  if (state.goal.evidencePolicy === "declared") {
    if (candidates.length === 0) throw new Error(`${subject} cannot be completed without successful, bound evidence record: ${kind}`);
    return;
  }
  const toolEvidence = candidates.filter((receipt) => receipt.source === "tool");
  if (toolEvidence.length === 0) throw new Error(`${subject} cannot be completed without tool-bound evidence record: ${kind}`);
  for (const receipt of [...toolEvidence].reverse()) {
    if (workspaceFingerprint(root, receipt.watchPaths) === receipt.workspaceFingerprint) return;
  }
  throw new Error(`${subject} has stale evidence record: ${kind}`);
}

export function activateNextPendingTask(state) {
  if (state.tasks.some((task) => task.status === "active")) return true;
  const next = state.tasks.find((task) => task.status === "pending");
  if (next) {
    next.status = "active";
    next.updatedAt = new Date().toISOString();
    return true;
  }
  return false;
}

export function assertGoalMutable(state) {
  if (terminalGoalStatuses.has(state.goal.status)) throw new Error(`Cannot change a ${state.goal.status} goal`);
}

export function taskById(state, taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) throw new Error(`Unknown task: ${taskId}`);
  return task;
}
