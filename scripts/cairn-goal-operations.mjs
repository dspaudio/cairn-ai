import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { cairnHome, worktreeId } from "./cairn-paths.mjs";
import { assertNoSymlinkComponents } from "./cairn-safe-fs.mjs";
import { goalStatePath, readGoalState, readGoalStateUnlocked, withGoalStateLock, writeGoalStateUnlocked } from "./cairn-goal-state.mjs";
import {
  GOAL_STATE_VERSION, PLAN_ID_MAX_LENGTH, assertRecoveryReferenceBudget, boundedRequiredText,
  defaultGoalEvidence, normalizeCriteria, normalizeTask, optionalText, requiredText,
  terminalGoalStatuses, timestamp, validEvidencePolicy, validGoalStatus, validTaskStatus, validateState,
} from "./cairn-goal-state-validation.mjs";
import {
  activateNextPendingTask, assertGoalMutable, ensureGoalCanComplete, ensureTaskCanComplete,
  mutateGoal, taskById,
} from "./cairn-goal-operations-mutations.mjs";

const goalTransitions = {
  active: new Set(["paused", "blocked", "cancelled", "completed"]),
  paused: new Set(["active", "blocked", "cancelled"]),
  blocked: new Set(["active", "paused", "cancelled"]),
  cancelled: new Set(),
  completed: new Set(),
};
const taskTransitions = {
  pending: new Set(["active", "blocked"]),
  active: new Set(["pending", "blocked", "completed"]),
  blocked: new Set(["pending", "active"]),
  completed: new Set(),
};

export async function startGoal({ root = process.cwd(), goal, planId, tasks, completionCriteria = [], requiredEvidence = defaultGoalEvidence, ownerSessionId = null, evidencePolicy = "tool-bound" } = {}) {
  const normalizedGoal = requiredText(goal, "goal");
  const normalizedPlanId = boundedRequiredText(planId, "planId", PLAN_ID_MAX_LENGTH);
  if (!Array.isArray(tasks) || tasks.length === 0) throw new Error("tasks must contain at least one task");
  return withGoalStateLock(root, async () => {
    let existing = await readGoalStateUnlocked(root);
    const currentWorktreeId = worktreeId(root);
    if (existing && existing.goal.worktreeId !== currentWorktreeId) {
      const path = goalStatePath(root);
      await assertNoSymlinkComponents(cairnHome(), path, { allowMissing: false });
      await rm(path);
      existing = null;
    }
    if (existing && !terminalGoalStatuses.has(existing.goal.status)) {
      throw new Error(`An active Cairn goal already exists (${existing.goal.id}); pause, block, cancel, or complete it first`);
    }
    const now = timestamp();
    const normalizedTasks = tasks.map((task, index) => normalizeTask(task, index, index === 0 ? "active" : "pending"));
    for (const task of normalizedTasks) assertRecoveryReferenceBudget(normalizedPlanId, task.id);
    const state = {
      schemaVersion: GOAL_STATE_VERSION,
      revision: 1,
      goal: {
        id: `goal-${randomUUID()}`,
        title: normalizedGoal,
        planId: normalizedPlanId,
        status: "active",
        completionCriteria: normalizeCriteria(completionCriteria),
        requiredEvidence: normalizeCriteria(requiredEvidence),
        evidencePolicy: validEvidencePolicy(evidencePolicy),
        worktreeId: currentWorktreeId,
        ownerSessionId: optionalText(ownerSessionId, "ownerSessionId"),
        blocker: null,
        createdAt: now,
        updatedAt: now,
      },
      tasks: normalizedTasks,
      receipts: [],
    };
    await writeGoalStateUnlocked({ root, state });
    return state;
  });
}

export async function reconcileWorktreeState({ root = process.cwd() } = {}) {
  const initial = await readGoalState({ root });
  if (!initial || initial.goal.worktreeId === worktreeId(root)) return { state: initial, removed: false };
  return withGoalStateLock(root, async () => {
    const state = await readGoalStateUnlocked(root);
    if (!state || state.goal.worktreeId === worktreeId(root)) return { state, removed: false };
    const staleWorktreeId = state.goal.worktreeId;
    const path = goalStatePath(root);
    await assertNoSymlinkComponents(cairnHome(), path, { allowMissing: false });
    await rm(path);
    return { state: null, removed: true, staleWorktreeId };
  });
}

export async function transitionGoal({ root = process.cwd(), status, blocker } = {}) {
  const nextStatus = validGoalStatus(status);
  if (terminalGoalStatuses.has(nextStatus)) {
    return withGoalStateLock(root, async () => {
      const state = await readGoalStateUnlocked(root);
      if (!state) throw new Error("No Cairn goal state exists; start a goal first");
      const next = applyGoalTransition(structuredClone(state), nextStatus, blocker, root);
      next.revision += 1;
      validateState(next);
      const path = goalStatePath(root);
      await assertNoSymlinkComponents(cairnHome(), path, { allowMissing: false });
      await rm(path);
      return next;
    });
  }
  return mutateGoal(root, (state) => applyGoalTransition(state, nextStatus, blocker, root));
}

function applyGoalTransition(state, nextStatus, blocker, root) {
  const currentStatus = state.goal.status;
  if (currentStatus === nextStatus) return state;
  if (!goalTransitions[currentStatus].has(nextStatus)) throw new Error(`Cannot transition goal from ${currentStatus} to ${nextStatus}`);
  if (nextStatus === "completed") ensureGoalCanComplete(state, root);
  if (nextStatus === "blocked") state.goal.blocker = requiredText(blocker, "blocker");
  if (nextStatus === "active") state.goal.blocker = null;
  state.goal.status = nextStatus;
  state.goal.updatedAt = timestamp();
  return state;
}

export async function setTaskStatus({ root = process.cwd(), taskId, status, blocker } = {}) {
  const nextStatus = validTaskStatus(status);
  const normalizedTaskId = requiredText(taskId, "taskId");
  return mutateGoal(root, (state) => {
    assertGoalMutable(state);
    const task = taskById(state, normalizedTaskId);
    if (task.status === nextStatus) return state;
    if (!taskTransitions[task.status].has(nextStatus)) throw new Error(`Cannot transition task ${task.id} from ${task.status} to ${nextStatus}`);
    if (nextStatus === "active") {
      const anotherActive = state.tasks.find((item) => item.id !== task.id && item.status === "active");
      if (anotherActive) throw new Error(`Task ${anotherActive.id} is already active`);
    }
    if (nextStatus === "completed") ensureTaskCanComplete(state, task, root);
    if (nextStatus === "blocked") task.blocker = requiredText(blocker, "blocker");
    if (nextStatus === "active" || nextStatus === "pending") task.blocker = null;
    task.status = nextStatus;
    task.updatedAt = timestamp();
    if (nextStatus === "completed") activateNextPendingTask(state);
    if (nextStatus === "blocked" && !activateNextPendingTask(state)) {
      state.goal.status = "blocked";
      state.goal.blocker = task.blocker;
    }
    state.goal.updatedAt = timestamp();
    return state;
  });
}

export async function replanGoal({ root = process.cwd(), tasks } = {}) {
  if (!Array.isArray(tasks) || tasks.length === 0) throw new Error("replan tasks must contain at least one incomplete task");
  return mutateGoal(root, (state) => {
    assertGoalMutable(state);
    if (state.goal.status !== "active") throw new Error("Only an active goal can be replanned");
    const completedTasks = state.tasks.filter((task) => task.status === "completed");
    const completedIds = new Set(completedTasks.map((task) => task.id));
    const replacementTasks = tasks.map((task, index) => {
      const source = typeof task === "string" ? task : { ...task, status: undefined, blocker: undefined };
      const normalized = normalizeTask(source, index, index === 0 ? "active" : "pending");
      if (completedIds.has(normalized.id)) throw new Error(`Replanned task conflicts with completed task id: ${normalized.id}`);
      return normalized;
    });
    state.tasks = [...completedTasks, ...replacementTasks];
    state.receipts = state.receipts.filter((receipt) => receipt.scope === "task" && completedIds.has(receipt.taskId));
    state.goal.blocker = null;
    state.goal.updatedAt = timestamp();
    return state;
  });
}

export async function assignTask({ root = process.cwd(), taskId, agentId = null } = {}) {
  const normalizedTaskId = requiredText(taskId, "taskId");
  const normalizedAgentId = agentId === null ? null : requiredText(agentId, "agentId");
  return mutateGoal(root, (state) => {
    assertGoalMutable(state);
    const task = taskById(state, normalizedTaskId);
    task.assignedAgentId = normalizedAgentId;
    task.updatedAt = timestamp();
    state.goal.updatedAt = timestamp();
    return state;
  });
}
