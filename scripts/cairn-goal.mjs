#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { lstat, readFile, rename, rm } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runGoalCli } from "./cairn-goal-cli.mjs";
import {
  normalizeVerificationArgv,
  normalizeWatchPaths,
  runVerificationEvidence,
  workspaceFingerprint,
} from "./cairn-goal-evidence.mjs";
import { assertNoSymlinkComponents, safeMkdir, safeWriteFile, withStateLock } from "./cairn-safe-fs.mjs";
import { cairnHome, goalStateDirectory, worktreeId } from "./cairn-paths.mjs";

export { workspaceFingerprint } from "./cairn-goal-evidence.mjs";
export { worktreeId } from "./cairn-paths.mjs";

export const GOAL_STATE_VERSION = 2;
export const GOAL_STATUSES = new Set(["active", "paused", "blocked", "cancelled", "completed"]);
export const TASK_STATUSES = new Set(["pending", "active", "blocked", "completed"]);
export const PLAN_ID_MAX_LENGTH = 128;
export const TASK_ID_MAX_LENGTH = 64;
export const RECOVERY_REFERENCE_MAX_LENGTH = 160;
export const GOAL_STATE_CONTRACT = Object.freeze({
  completionCriteria: Object.freeze({ behavior: "advisory", enforced: false }),
  terminal: Object.freeze({
    statuses: Object.freeze(["cancelled", "completed"]),
    persistence: "deleted",
    readAfterTransition: null,
    transitionResult: "terminal-snapshot",
  }),
});

const terminalGoalStatuses = new Set(["cancelled", "completed"]);
const evidencePolicies = new Set(["declared", "tool-bound"]);
const defaultTaskEvidence = ["moduleAcceptance", "surfaceIntegration"];
const defaultGoalEvidence = ["finalReview"];
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

export function goalStatePath(root = process.cwd()) {
  return join(goalStateDirectory(root), "state.json");
}

export async function readGoalState({ root = process.cwd() } = {}) {
  const state = await readCurrentGoalState(root);
  if (state) return state;
  return withGoalStateLock(root, () => readGoalStateUnlocked(root));
}

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
    const goalId = `goal-${randomUUID()}`;
    const normalizedTasks = tasks.map((task, index) => normalizeTask(task, index, index === 0 ? "active" : "pending"));
    for (const task of normalizedTasks) assertRecoveryReferenceBudget(normalizedPlanId, task.id);
    const state = {
      schemaVersion: GOAL_STATE_VERSION,
      revision: 1,
      goal: {
        id: goalId,
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
  if (!initial || initial.goal.worktreeId === worktreeId(root)) {
    return { state: initial, removed: false };
  }
  return withGoalStateLock(root, async () => {
    const state = await readGoalStateUnlocked(root);
    if (!state || state.goal.worktreeId === worktreeId(root)) {
      return { state, removed: false };
    }
    const staleWorktreeId = state.goal.worktreeId;
    const path = goalStatePath(root);
    await assertNoSymlinkComponents(cairnHome(), path, { allowMissing: false });
    await rm(path);
    return { state: null, removed: true, staleWorktreeId };
  });
}

export async function writeGoalState({ root = process.cwd(), state } = {}) {
  return withGoalStateLock(root, () => writeGoalStateUnlocked({ root, state }));
}

async function writeGoalStateUnlocked({ root = process.cwd(), state } = {}) {
  const validated = validateState(state);
  const path = goalStatePath(root);
  await ensureGoalStateDirectory(root);
  await assertNoSymlinkComponents(cairnHome(), path);
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await safeWriteFile(cairnHome(), temporaryPath, `${JSON.stringify(validated, null, 2)}\n`, "utf8");
    await rename(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
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
  return mutateGoal(root, (state) => {
    return applyGoalTransition(state, nextStatus, blocker, root);
  });
}

function applyGoalTransition(state, nextStatus, blocker, root) {
  const currentStatus = state.goal.status;
  if (currentStatus === nextStatus) return state;
  if (!goalTransitions[currentStatus].has(nextStatus)) {
    throw new Error(`Cannot transition goal from ${currentStatus} to ${nextStatus}`);
  }
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
    if (!taskTransitions[task.status].has(nextStatus)) {
      throw new Error(`Cannot transition task ${task.id} from ${task.status} to ${nextStatus}`);
    }
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
  if (!Array.isArray(tasks) || tasks.length === 0) {
    throw new Error("replan tasks must contain at least one incomplete task");
  }

  return mutateGoal(root, (state) => {
    assertGoalMutable(state);
    if (state.goal.status !== "active") throw new Error("Only an active goal can be replanned");

    const completedTasks = state.tasks.filter((task) => task.status === "completed");
    const completedIds = new Set(completedTasks.map((task) => task.id));
    const replacementTasks = tasks.map((task, index) => {
      const source = typeof task === "string" ? task : { ...task, status: undefined, blocker: undefined };
      const normalized = normalizeTask(source, index, index === 0 ? "active" : "pending");
      if (completedIds.has(normalized.id)) {
        throw new Error(`Replanned task conflicts with completed task id: ${normalized.id}`);
      }
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

export async function recordReceipt(options = {}) {
  if (options.source !== undefined && options.source !== "declared") {
    throw new Error("Only goal verify can create tool evidence");
  }
  return recordEvidence({ ...options, source: "declared" });
}

async function recordEvidence({
  root = process.cwd(),
  taskId,
  kind,
  scope = "task",
  command,
  exitCode,
  timestamp: receiptTimestamp,
  goalId,
  planId,
  source,
  argv,
  outputDigest,
  summary,
  workspaceFingerprint: fingerprint,
  watchPaths = [],
  expectedIdentity,
  expectedFingerprint,
} = {}) {
  const normalizedScope = validReceiptScope(scope);
  const normalizedTaskId = normalizedScope === "task" ? requiredText(taskId, "taskId") : undefined;
  const normalizedKind = requiredText(kind, "evidence kind");
  const normalizedCommand = validReceiptCommand(command);
  const normalizedSource = validReceiptSource(source);
  if (exitCode !== 0) throw new Error("evidence exitCode must be 0");
  const normalizedTimestamp = validTimestamp(receiptTimestamp ?? timestamp());
  const toolFields = normalizedSource === "tool"
    ? normalizeToolEvidence({ argv, outputDigest, summary, fingerprint, watchPaths })
    : {};
  return mutateGoal(root, (state) => {
    assertGoalMutable(state);
    const task = normalizedScope === "task" ? taskById(state, normalizedTaskId) : null;
    if (expectedIdentity && (
      state.goal.id !== expectedIdentity.goalId
      || state.goal.planId !== expectedIdentity.planId
    )) throw new Error("Goal identity changed during verification; evidence was not recorded");
    if (expectedIdentity && normalizedScope === "task" && (
      task?.id !== expectedIdentity.taskId
      || task?.status !== expectedIdentity.taskStatus
      || task?.assignedAgentId !== expectedIdentity.taskAgentId
    )) throw new Error("Verification task changed during verification; evidence was not recorded");
    if (expectedFingerprint && workspaceFingerprint(root, watchPaths) !== expectedFingerprint) {
      throw new Error("Watched workspace changed during verification; evidence was not recorded");
    }
    if (goalId !== undefined && goalId !== state.goal.id) throw new Error("evidence goalId does not match the active goal");
    if (planId !== undefined && planId !== state.goal.planId) throw new Error("evidence planId does not match the active goal");
    const receipt = {
      id: `receipt-${randomUUID()}`,
      scope: normalizedScope,
      kind: normalizedKind,
      ...(task ? { taskId: task.id } : {}),
      goalId: state.goal.id,
      planId: state.goal.planId,
      command: normalizedCommand,
      exitCode: 0,
      timestamp: normalizedTimestamp,
      source: normalizedSource,
      ...toolFields,
    };
    state.receipts.push(receipt);
    if (task) task.updatedAt = timestamp();
    state.goal.updatedAt = timestamp();
    return state;
  });
}

export async function verifyAndRecord({
  root = process.cwd(),
  taskId,
  kind,
  scope = "task",
  argv,
  watchPaths = [],
  runner,
  timeoutMs = 600_000,
} = {}) {
  const normalizedArgv = normalizeVerificationArgv(argv);
  const normalizedWatchPaths = normalizeWatchPaths(root, watchPaths);
  const normalizedScope = validReceiptScope(scope);
  const normalizedKind = requiredText(kind, "evidence kind");
  const initialState = await readGoalState({ root });
  if (!initialState) throw new Error("No Cairn goal state exists; start a goal first");
  assertGoalMutable(initialState);
  const normalizedTaskId = normalizedScope === "task" ? requiredText(taskId, "taskId") : undefined;
  const initialTask = normalizedScope === "task" ? taskById(initialState, normalizedTaskId) : null;
  if (initialTask && !["active", "completed"].includes(initialTask.status)) {
    throw new Error(`Verification task must be active or completed: ${initialTask.id}`);
  }
  const identity = {
    goalId: initialState.goal.id,
    planId: initialState.goal.planId,
    taskId: normalizedTaskId,
    taskStatus: initialTask?.status,
    taskAgentId: initialTask?.assignedAgentId,
  };
  const evidence = runVerificationEvidence({
    root,
    argv: normalizedArgv,
    watchPaths: normalizedWatchPaths,
    runner,
    timeoutMs,
  });
  const postState = await readGoalState({ root });
  if (!postState || postState.goal.id !== identity.goalId || postState.goal.planId !== identity.planId) {
    throw new Error("Goal identity changed during verification; evidence was not recorded");
  }
  if (normalizedScope === "task") {
    const postTask = taskById(postState, normalizedTaskId);
    if (postTask.status !== identity.taskStatus || postTask.assignedAgentId !== identity.taskAgentId) {
      throw new Error("Verification task changed during verification; evidence was not recorded");
    }
  }
  const state = await recordEvidence({
    root,
    taskId: normalizedTaskId,
    kind: normalizedKind,
    scope: normalizedScope,
    command: evidence.command,
    exitCode: 0,
    source: "tool",
    argv: evidence.argv,
    outputDigest: evidence.outputDigest,
    summary: evidence.summary,
    workspaceFingerprint: evidence.workspaceFingerprint,
    watchPaths: evidence.watchPaths,
    goalId: identity.goalId,
    planId: identity.planId,
    expectedIdentity: identity,
    expectedFingerprint: evidence.workspaceFingerprint,
  });
  return { state, evidence: state.receipts.at(-1) };
}

export function currentTask(state) {
  if (!state) return null;
  return state.tasks.find((task) => task.status === "active")
    ?? state.tasks.find((task) => task.status === "pending")
    ?? state.tasks.find((task) => task.status === "blocked")
    ?? null;
}

export function isGoalOwnedBySession(state, sessionId) {
  return !state?.goal?.ownerSessionId || state.goal.ownerSessionId === sessionId;
}

export function evaluateStop(state, { subagent = false, agentId } = {}) {
  if (!state || state.goal.status !== "active") return { block: false };
  const task = currentTask(state);
  if (!task) {
    return {
      block: true,
      reason: `Cairn goal "${state.goal.title}" has no incomplete task, but is still active. Verify completion criteria and explicitly mark the goal complete.`,
    };
  }
  if (subagent) {
    if (!agentId || task.assignedAgentId !== agentId) return { block: false };
    return {
      block: true,
      reason: `Cairn task ${task.id} (${task.title}) is assigned to this subagent and is ${task.status}. Continue only this assigned task, record a successful evidence record, then hand off.`,
    };
  }
  return {
    block: true,
    reason: `Cairn goal "${state.goal.title}" is active. Continue current task ${task.id} (${task.title}); its status is ${task.status}. Record a successful evidence record before marking it complete.`,
  };
}

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

async function mutateGoal(root, mutate) {
  return withGoalStateLock(root, async () => {
    const state = await readGoalStateUnlocked(root);
    if (!state) throw new Error("No Cairn goal state exists; start a goal first");
    const next = await mutate(structuredClone(state));
    next.revision += 1;
    await writeGoalStateUnlocked({ root, state: next });
    return next;
  });
}

async function withGoalStateLock(root, operation) {
  await ensureGoalStateDirectory(root);
  return withStateLock(goalStateDirectory(root), operation);
}

async function ensureGoalStateDirectory(root) {
  const home = cairnHome();
  let existingAncestor = home;
  while (true) {
    try {
      const stat = await lstat(existingAncestor);
      if (!stat.isDirectory()) throw new Error(`Cairn home ancestor is not a directory: ${existingAncestor}`);
      break;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const parent = dirname(existingAncestor);
      if (parent === existingAncestor) throw error;
      existingAncestor = parent;
    }
  }
  await safeMkdir(existingAncestor, relative(existingAncestor, goalStateDirectory(root)));
}

async function readGoalStateUnlocked(root) {
  return await readCurrentGoalState(root) ?? migrateLegacyGoalState(root);
}

async function readCurrentGoalState(root) {
  try {
    const path = goalStatePath(root);
    await assertNoSymlinkComponents(cairnHome(), path);
    return validateState(migrateState(JSON.parse(await readFile(path, "utf8"))));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    if (error instanceof SyntaxError) throw new Error(`Cairn goal state is invalid JSON: ${error.message}`);
    throw error;
  }
}

async function migrateLegacyGoalState(root) {
  const legacyPath = join(resolve(root), ".cairn", "state.json");
  try {
    await assertNoSymlinkComponents(root, legacyPath, { allowMissing: false });
    const state = validateState(migrateState(JSON.parse(await readFile(legacyPath, "utf8"))));
    await writeGoalStateUnlocked({ root, state });
    await rm(legacyPath);
    return state;
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    if (error instanceof SyntaxError) throw new Error(`Cairn goal state is invalid JSON: ${error.message}`);
    throw error;
  }
}

function normalizeTask(task, index, defaultStatus) {
  const source = typeof task === "string" ? { title: task } : task;
  if (!source || typeof source !== "object") throw new Error(`tasks[${index}] must be a string or object`);
  const id = source.id === undefined ? `task-${index + 1}` : boundedRequiredText(source.id, `tasks[${index}].id`, TASK_ID_MAX_LENGTH);
  const title = requiredText(source.title, `tasks[${index}].title`);
  return {
    id,
    title,
    status: source.status === undefined ? defaultStatus : validTaskStatus(source.status),
    assignedAgentId: source.assignedAgentId === undefined || source.assignedAgentId === null ? null : requiredText(source.assignedAgentId, `tasks[${index}].assignedAgentId`),
    requiredEvidence: normalizeCriteria(source.requiredEvidence ?? defaultTaskEvidence),
    blocker: null,
    createdAt: timestamp(),
    updatedAt: timestamp(),
  };
}

function migrateState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  if (value.schemaVersion !== 1) return value;
  return {
    ...value,
    schemaVersion: GOAL_STATE_VERSION,
    goal: {
      ...value.goal,
      evidencePolicy: value.goal?.evidencePolicy ?? "tool-bound",
    },
    receipts: Array.isArray(value.receipts)
      ? value.receipts.map((receipt) => ({ ...receipt, source: "declared" }))
      : value.receipts,
  };
}

function validateState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Cairn goal state must be an object");
  if (value.schemaVersion !== GOAL_STATE_VERSION) throw new Error(`Unsupported Cairn goal state schema version: ${value.schemaVersion}`);
  if (!Number.isSafeInteger(value.revision) || value.revision < 1) throw new Error("Cairn goal state revision must be a positive integer");
  if (!value.goal || typeof value.goal !== "object") throw new Error("Cairn goal state is missing goal");
  const goal = value.goal;
  requiredText(goal.id, "goal.id");
  requiredText(goal.title, "goal.title");
  const planId = boundedRequiredText(goal.planId, "goal.planId", PLAN_ID_MAX_LENGTH);
  validGoalStatus(goal.status);
  validEvidencePolicy(goal.evidencePolicy);
  validTimestamp(goal.createdAt);
  validTimestamp(goal.updatedAt);
  if (!Array.isArray(goal.completionCriteria)) throw new Error("goal.completionCriteria must be an array");
  if (!Array.isArray(goal.requiredEvidence) || goal.requiredEvidence.length === 0) throw new Error("goal.requiredEvidence must be a non-empty array");
  goal.requiredEvidence.forEach((kind, index) => requiredText(kind, `goal.requiredEvidence[${index}]`));
  if (goal.ownerSessionId !== null && goal.ownerSessionId !== undefined) requiredText(goal.ownerSessionId, "goal.ownerSessionId");
  if (goal.worktreeId !== null && goal.worktreeId !== undefined) requiredText(goal.worktreeId, "goal.worktreeId");
  if (goal.blocker !== null && goal.blocker !== undefined) requiredText(goal.blocker, "goal.blocker");
  if (!Array.isArray(value.tasks) || value.tasks.length === 0) throw new Error("Cairn goal state must contain tasks");
  if (!Array.isArray(value.receipts)) throw new Error("Cairn goal state evidence records (receipts) must be an array");
  const ids = new Set();
  let activeTasks = 0;
  for (const task of value.tasks) {
    if (!task || typeof task !== "object") throw new Error("Each task must be an object");
    const taskId = boundedRequiredText(task.id, "task.id", TASK_ID_MAX_LENGTH);
    assertRecoveryReferenceBudget(planId, taskId);
    if (ids.has(task.id)) throw new Error(`Duplicate task id: ${task.id}`);
    ids.add(task.id);
    requiredText(task.title, "task.title");
    validTaskStatus(task.status);
    if (task.status === "active") activeTasks += 1;
    if (task.assignedAgentId !== null && task.assignedAgentId !== undefined) requiredText(task.assignedAgentId, "task.assignedAgentId");
    if (!Array.isArray(task.requiredEvidence) || task.requiredEvidence.length === 0) throw new Error(`task ${task.id} requiredEvidence must be a non-empty array`);
    task.requiredEvidence.forEach((kind, index) => requiredText(kind, `task ${task.id} requiredEvidence[${index}]`));
    if (task.blocker !== null && task.blocker !== undefined) requiredText(task.blocker, `task ${task.id} blocker`);
    validTimestamp(task.createdAt);
    validTimestamp(task.updatedAt);
  }
  if (activeTasks > 1) throw new Error("Only one task may be active");
  for (const receipt of value.receipts) validateReceipt(receipt, value);
  return value;
}

function validateReceipt(receipt, state) {
  if (!receipt || typeof receipt !== "object") throw new Error("Each evidence record must be an object");
  requiredText(receipt.id, "evidence.id");
  const scope = validReceiptScope(receipt.scope);
  requiredText(receipt.kind, "evidence.kind");
  if (scope === "task") {
    requiredText(receipt.taskId, "evidence.taskId");
    if (!state.tasks.some((task) => task.id === receipt.taskId)) throw new Error(`Evidence record references unknown task: ${receipt.taskId}`);
  } else if (receipt.taskId !== undefined && receipt.taskId !== null) {
    throw new Error("goal-scope evidence record must not contain taskId");
  }
  if (receipt.goalId !== state.goal.id) throw new Error("evidence goalId does not match goal");
  if (receipt.planId !== state.goal.planId) throw new Error("evidence planId does not match goal");
  validReceiptCommand(receipt.command);
  if (receipt.exitCode !== 0) throw new Error("evidence exitCode must be 0");
  validTimestamp(receipt.timestamp);
  const source = validReceiptSource(receipt.source);
  if (source === "tool") {
    normalizeToolEvidence({
      argv: receipt.argv,
      outputDigest: receipt.outputDigest,
      summary: receipt.summary,
      fingerprint: receipt.workspaceFingerprint,
      watchPaths: receipt.watchPaths,
    });
  }
}

function ensureTaskCanComplete(state, task, root) {
  for (const kind of task.requiredEvidence) {
    ensureCurrentEvidence({ state, root, scope: "task", task, kind });
  }
}

function ensureGoalCanComplete(state, root) {
  const incomplete = state.tasks.filter((task) => task.status !== "completed");
  if (incomplete.length > 0) throw new Error(`Goal cannot be completed while tasks remain: ${incomplete.map((task) => task.id).join(", ")}`);
  for (const task of state.tasks) ensureTaskCanComplete(state, task, root);
  for (const kind of state.goal.requiredEvidence) {
    ensureCurrentEvidence({ state, root, scope: "goal", kind });
  }
}

function ensureCurrentEvidence({ state, root, scope, task, kind }) {
  const candidates = state.receipts.filter((receipt) => (
    receipt.scope === scope
    && receipt.kind === kind
    && (scope === "goal" || receipt.taskId === task.id)
  ));
  const subject = scope === "goal" ? "Goal" : `Task ${task.id}`;
  if (state.goal.evidencePolicy === "declared") {
    if (candidates.length === 0) {
      throw new Error(`${subject} cannot be completed without successful, bound evidence record: ${kind}`);
    }
    return;
  }

  const toolEvidence = candidates.filter((receipt) => receipt.source === "tool");
  if (toolEvidence.length === 0) {
    throw new Error(`${subject} cannot be completed without tool-bound evidence record: ${kind}`);
  }
  for (const receipt of [...toolEvidence].reverse()) {
    if (workspaceFingerprint(root, receipt.watchPaths) === receipt.workspaceFingerprint) return;
  }
  throw new Error(`${subject} has stale evidence record: ${kind}`);
}

function activateNextPendingTask(state) {
  if (state.tasks.some((task) => task.status === "active")) return true;
  const next = state.tasks.find((task) => task.status === "pending");
  if (next) {
    next.status = "active";
    next.updatedAt = timestamp();
    return true;
  }
  return false;
}

function assertGoalMutable(state) {
  if (terminalGoalStatuses.has(state.goal.status)) throw new Error(`Cannot change a ${state.goal.status} goal`);
}

function taskById(state, taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) throw new Error(`Unknown task: ${taskId}`);
  return task;
}

function requiredText(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

function boundedRequiredText(value, label, maxLength) {
  const text = requiredText(value, label);
  if (value !== text) throw new Error(`${label} must not have leading or trailing whitespace`);
  if (text.length > maxLength) throw new Error(`${label} must be at most ${maxLength} characters`);
  return text;
}

function assertRecoveryReferenceBudget(planId, taskId) {
  if (planId.length + taskId.length > RECOVERY_REFERENCE_MAX_LENGTH) {
    throw new Error(`planId and taskId must total at most ${RECOVERY_REFERENCE_MAX_LENGTH} characters for exact recovery context`);
  }
}

function validGoalStatus(value) {
  if (!GOAL_STATUSES.has(value)) throw new Error(`Invalid goal status: ${value}`);
  return value;
}

function validEvidencePolicy(value) {
  if (!evidencePolicies.has(value)) throw new Error(`Invalid evidence policy: ${value}`);
  return value;
}

function validTaskStatus(value) {
  if (!TASK_STATUSES.has(value)) throw new Error(`Invalid task status: ${value}`);
  return value;
}

function validReceiptScope(value) {
  if (value !== "task" && value !== "goal") throw new Error(`Invalid evidence scope: ${value}`);
  return value;
}

function validReceiptSource(value) {
  if (value !== "declared" && value !== "tool") throw new Error(`Invalid evidence source: ${value}`);
  return value;
}

function validReceiptCommand(value) {
  const command = requiredText(value, "evidence command");
  if (/\b(skip(?:ped)?|todo|tbd|n\/?a|not[ -]?run|not[ -]?applicable|placeholder)\b/i.test(command)) {
    throw new Error("evidence command cannot be skipped, placeholder, or incomplete");
  }
  return command;
}

function validTimestamp(value) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new Error("timestamp must be an ISO-8601 date string");
  return value;
}

function normalizeCriteria(criteria) {
  if (!Array.isArray(criteria)) throw new Error("completionCriteria must be an array");
  return criteria.map((item, index) => requiredText(item, `completionCriteria[${index}]`));
}

function normalizeToolEvidence({ argv, outputDigest, summary, fingerprint, watchPaths }) {
  const normalizedArgv = normalizeVerificationArgv(argv);
  const normalizedOutputDigest = validSha256(outputDigest, "evidence outputDigest");
  const normalizedSummary = requiredText(summary, "evidence summary");
  const normalizedFingerprint = validSha256(fingerprint, "evidence workspaceFingerprint");
  if (!Array.isArray(watchPaths)) throw new Error("evidence watchPaths must be an array");
  const normalizedWatchPaths = watchPaths.map((item, index) => requiredText(item, `evidence watchPaths[${index}]`));
  return {
    argv: normalizedArgv,
    outputDigest: normalizedOutputDigest,
    summary: normalizedSummary,
    workspaceFingerprint: normalizedFingerprint,
    watchPaths: normalizedWatchPaths,
  };
}

function validSha256(value, label) {
  if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${label} must be a sha256 digest`);
  }
  return value;
}

function optionalText(value, label) {
  return value === undefined || value === null ? null : requiredText(value, label);
}

function timestamp() {
  return new Date().toISOString();
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
