#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const GOAL_STATE_VERSION = 1;
export const GOAL_STATUSES = new Set(["active", "paused", "blocked", "cancelled", "completed"]);
export const TASK_STATUSES = new Set(["pending", "active", "blocked", "completed"]);

const terminalGoalStatuses = new Set(["cancelled", "completed"]);
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
  return join(resolve(root), ".cairn", "state.json");
}

export async function readGoalState({ root = process.cwd() } = {}) {
  try {
    const text = await readFile(goalStatePath(root), "utf8");
    return validateState(JSON.parse(text));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    if (error instanceof SyntaxError) throw new Error(`Cairn goal state is invalid JSON: ${error.message}`);
    throw error;
  }
}

export async function startGoal({ root = process.cwd(), goal, planId, tasks, completionCriteria = [], requiredEvidence = defaultGoalEvidence, ownerSessionId = null } = {}) {
  const normalizedGoal = requiredText(goal, "goal");
  const normalizedPlanId = requiredText(planId, "planId");
  if (!Array.isArray(tasks) || tasks.length === 0) throw new Error("tasks must contain at least one task");

  const existing = await readGoalState({ root });
  if (existing && !terminalGoalStatuses.has(existing.goal.status)) {
    throw new Error(`An active Cairn goal already exists (${existing.goal.id}); pause, block, cancel, or complete it first`);
  }

  const now = timestamp();
  const goalId = `goal-${randomUUID()}`;
  const normalizedTasks = tasks.map((task, index) => normalizeTask(task, index, index === 0 ? "active" : "pending"));
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
      ownerSessionId: optionalText(ownerSessionId, "ownerSessionId"),
      blocker: null,
      createdAt: now,
      updatedAt: now,
    },
    tasks: normalizedTasks,
    receipts: [],
  };
  await writeGoalState({ root, state });
  return state;
}

export async function writeGoalState({ root = process.cwd(), state } = {}) {
  const validated = validateState(state);
  const path = goalStatePath(root);
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(validated, null, 2)}\n`, "utf8");
    await rename(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
}

export async function transitionGoal({ root = process.cwd(), status, blocker } = {}) {
  const nextStatus = validGoalStatus(status);
  return mutateGoal(root, (state) => {
    const currentStatus = state.goal.status;
    if (currentStatus === nextStatus) return state;
    if (!goalTransitions[currentStatus].has(nextStatus)) {
      throw new Error(`Cannot transition goal from ${currentStatus} to ${nextStatus}`);
    }
    if (nextStatus === "completed") ensureGoalCanComplete(state);
    if (nextStatus === "blocked") state.goal.blocker = requiredText(blocker, "blocker");
    if (nextStatus === "active") state.goal.blocker = null;
    state.goal.status = nextStatus;
    state.goal.updatedAt = timestamp();
    return state;
  });
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
    if (nextStatus === "completed") ensureTaskCanComplete(state, task);
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

export async function recordReceipt({ root = process.cwd(), taskId, kind, scope = "task", command, exitCode, timestamp: receiptTimestamp, goalId, planId } = {}) {
  const normalizedScope = validReceiptScope(scope);
  const normalizedTaskId = normalizedScope === "task" ? requiredText(taskId, "taskId") : undefined;
  const normalizedKind = requiredText(kind, "receipt kind");
  const normalizedCommand = validReceiptCommand(command);
  if (exitCode !== 0) throw new Error("receipt exitCode must be 0");
  const normalizedTimestamp = validTimestamp(receiptTimestamp ?? timestamp());
  return mutateGoal(root, (state) => {
    assertGoalMutable(state);
    const task = normalizedScope === "task" ? taskById(state, normalizedTaskId) : null;
    if (goalId !== undefined && goalId !== state.goal.id) throw new Error("receipt goalId does not match the active goal");
    if (planId !== undefined && planId !== state.goal.planId) throw new Error("receipt planId does not match the active goal");
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
    };
    state.receipts.push(receipt);
    if (task) task.updatedAt = timestamp();
    state.goal.updatedAt = timestamp();
    return state;
  });
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
      reason: `Cairn task ${task.id} (${task.title}) is assigned to this subagent and is ${task.status}. Continue only this assigned task, record a successful receipt, then hand off.`,
    };
  }
  return {
    block: true,
    reason: `Cairn goal "${state.goal.title}" is active. Continue current task ${task.id} (${task.title}); its status is ${task.status}. Record a successful receipt before marking it complete.`,
  };
}

export async function handleGoalCli(args = process.argv.slice(2), { stdout = console.log } = {}) {
  const [firstCommand = "help", ...remaining] = args;
  const [command = "help", ...rest] = firstCommand === "goal" ? remaining : [firstCommand, ...remaining];
  const { options, positional } = parseArgs(rest);
  const root = options.root ?? process.cwd();
  if (command === "start") {
    const tasks = parseTasks(options.tasks ?? positional.slice(0));
    const state = await startGoal({
      root,
      goal: options.goal,
      planId: options.plan,
      tasks,
      completionCriteria: splitValues(options.criteria),
      requiredEvidence: options.requiredEvidence ? splitValues(options.requiredEvidence) : defaultGoalEvidence,
      ownerSessionId: options.session,
    });
    stdout(JSON.stringify(state));
    return state;
  }
  if (command === "status") {
    const state = await readGoalState({ root });
    stdout(JSON.stringify(state));
    return state;
  }
  if (command === "task") {
    const taskAction = taskStatusFromAction(positional[0]);
    const state = await setTaskStatus({
      root,
      taskId: options.task ?? (taskAction ? positional[1] : positional[0]),
      status: options.status ?? taskAction ?? positional[1],
      blocker: options.reason,
    });
    stdout(JSON.stringify(state));
    return state;
  }
  if (command === "assign") {
    const state = await assignTask({ root, taskId: options.task ?? positional[0], agentId: options.agent ?? positional[1] ?? null });
    stdout(JSON.stringify(state));
    return state;
  }
  if (command === "receipt") {
    const state = await recordReceipt({
      root,
      taskId: options.task ?? positional[0],
      kind: options.kind,
      scope: options.scope,
      command: options.command,
      exitCode: numberOption(options.exitCode ?? options["exit-code"] ?? options.exit),
      timestamp: options.timestamp,
      goalId: options.goalId,
      planId: options.plan,
    });
    stdout(JSON.stringify(state));
    return state;
  }
  if (["pause", "resume", "block", "cancel", "complete"].includes(command)) {
    const state = await transitionGoal({
      root,
      status: { pause: "paused", resume: "active", block: "blocked", cancel: "cancelled", complete: "completed" }[command],
      blocker: options.reason,
    });
    stdout(JSON.stringify(state));
    return state;
  }
  throw new Error("Usage: cairn-goal start|status|task|assign|receipt|pause|resume|block|cancel|complete [--root PATH]");
}

async function mutateGoal(root, mutate) {
  const state = await readGoalState({ root });
  if (!state) throw new Error("No Cairn goal state exists; start a goal first");
  const next = await mutate(structuredClone(state));
  next.revision += 1;
  await writeGoalState({ root, state: next });
  return next;
}

function normalizeTask(task, index, defaultStatus) {
  const source = typeof task === "string" ? { title: task } : task;
  if (!source || typeof source !== "object") throw new Error(`tasks[${index}] must be a string or object`);
  const id = source.id === undefined ? `task-${index + 1}` : requiredText(source.id, `tasks[${index}].id`);
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

function validateState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Cairn goal state must be an object");
  if (value.schemaVersion !== GOAL_STATE_VERSION) throw new Error(`Unsupported Cairn goal state schema version: ${value.schemaVersion}`);
  if (!Number.isSafeInteger(value.revision) || value.revision < 1) throw new Error("Cairn goal state revision must be a positive integer");
  if (!value.goal || typeof value.goal !== "object") throw new Error("Cairn goal state is missing goal");
  const goal = value.goal;
  requiredText(goal.id, "goal.id");
  requiredText(goal.title, "goal.title");
  requiredText(goal.planId, "goal.planId");
  validGoalStatus(goal.status);
  validTimestamp(goal.createdAt);
  validTimestamp(goal.updatedAt);
  if (!Array.isArray(goal.completionCriteria)) throw new Error("goal.completionCriteria must be an array");
  if (!Array.isArray(goal.requiredEvidence) || goal.requiredEvidence.length === 0) throw new Error("goal.requiredEvidence must be a non-empty array");
  goal.requiredEvidence.forEach((kind, index) => requiredText(kind, `goal.requiredEvidence[${index}]`));
  if (goal.ownerSessionId !== null && goal.ownerSessionId !== undefined) requiredText(goal.ownerSessionId, "goal.ownerSessionId");
  if (goal.blocker !== null && goal.blocker !== undefined) requiredText(goal.blocker, "goal.blocker");
  if (!Array.isArray(value.tasks) || value.tasks.length === 0) throw new Error("Cairn goal state must contain tasks");
  if (!Array.isArray(value.receipts)) throw new Error("Cairn goal state receipts must be an array");
  const ids = new Set();
  let activeTasks = 0;
  for (const task of value.tasks) {
    if (!task || typeof task !== "object") throw new Error("Each task must be an object");
    requiredText(task.id, "task.id");
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
  if (!receipt || typeof receipt !== "object") throw new Error("Each receipt must be an object");
  requiredText(receipt.id, "receipt.id");
  const scope = validReceiptScope(receipt.scope);
  requiredText(receipt.kind, "receipt.kind");
  if (scope === "task") {
    requiredText(receipt.taskId, "receipt.taskId");
    if (!state.tasks.some((task) => task.id === receipt.taskId)) throw new Error(`Receipt references unknown task: ${receipt.taskId}`);
  } else if (receipt.taskId !== undefined && receipt.taskId !== null) {
    throw new Error("goal-scope receipt must not contain taskId");
  }
  if (receipt.goalId !== state.goal.id) throw new Error("receipt goalId does not match goal");
  if (receipt.planId !== state.goal.planId) throw new Error("receipt planId does not match goal");
  validReceiptCommand(receipt.command);
  if (receipt.exitCode !== 0) throw new Error("receipt exitCode must be 0");
  validTimestamp(receipt.timestamp);
}

function ensureTaskCanComplete(state, task) {
  const missingKinds = task.requiredEvidence.filter((kind) => !state.receipts.some((item) => (
    item.scope === "task" && item.kind === kind && item.taskId === task.id && validReceiptForTask(item, state, task)
  )));
  if (missingKinds.length > 0) throw new Error(`Task ${task.id} cannot be completed without successful, bound receipts: ${missingKinds.join(", ")}`);
}

function ensureGoalCanComplete(state) {
  const incomplete = state.tasks.filter((task) => task.status !== "completed");
  if (incomplete.length > 0) throw new Error(`Goal cannot be completed while tasks remain: ${incomplete.map((task) => task.id).join(", ")}`);
  for (const task of state.tasks) ensureTaskCanComplete(state, task);
  const missingKinds = state.goal.requiredEvidence.filter((kind) => !state.receipts.some((receipt) => (
    receipt.scope === "goal" && receipt.kind === kind && validReceiptForGoal(receipt, state)
  )));
  if (missingKinds.length > 0) throw new Error(`Goal cannot be completed without successful, bound receipts: ${missingKinds.join(", ")}`);
}

function validReceiptForTask(receipt, state, task) {
  try {
    validateReceipt(receipt, state);
    return receipt.taskId === task.id;
  } catch {
    return false;
  }
}

function validReceiptForGoal(receipt, state) {
  try {
    validateReceipt(receipt, state);
    return receipt.scope === "goal";
  } catch {
    return false;
  }
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

function validGoalStatus(value) {
  if (!GOAL_STATUSES.has(value)) throw new Error(`Invalid goal status: ${value}`);
  return value;
}

function validTaskStatus(value) {
  if (!TASK_STATUSES.has(value)) throw new Error(`Invalid task status: ${value}`);
  return value;
}

function taskStatusFromAction(value) {
  return {
    start: "active",
    activate: "active",
    active: "active",
    complete: "completed",
    completed: "completed",
    block: "blocked",
    blocked: "blocked",
    pending: "pending",
  }[value] ?? null;
}

function validReceiptScope(value) {
  if (value !== "task" && value !== "goal") throw new Error(`Invalid receipt scope: ${value}`);
  return value;
}

function validReceiptCommand(value) {
  const command = requiredText(value, "receipt command");
  if (/\b(skip(?:ped)?|todo|tbd|n\/?a|not[ -]?run|not[ -]?applicable|placeholder)\b/i.test(command)) {
    throw new Error("receipt command cannot be skipped, placeholder, or incomplete evidence");
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

function optionalText(value, label) {
  return value === undefined || value === null ? null : requiredText(value, label);
}

function timestamp() {
  return new Date().toISOString();
}

function parseArgs(args) {
  const options = {};
  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (!value.startsWith("--")) {
      positional.push(value);
      continue;
    }
    const [key, inline] = value.slice(2).split("=", 2);
    options[key] = inline ?? args[++index];
  }
  return { options, positional };
}

function parseTasks(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || value.trim().length === 0) throw new Error("Provide tasks with --tasks JSON or positional task titles");
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) throw new Error("--tasks JSON must be an array");
    return parsed;
  } catch (error) {
    if (error instanceof SyntaxError) return value.split("|").map((item) => item.trim()).filter(Boolean);
    throw error;
  }
}

function splitValues(value) {
  if (!value) return [];
  return String(value).split("|").map((item) => item.trim()).filter(Boolean);
}

function numberOption(value) {
  if (value === undefined) return undefined;
  const result = Number(value);
  if (!Number.isInteger(result)) throw new Error("exitCode must be an integer");
  return result;
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
