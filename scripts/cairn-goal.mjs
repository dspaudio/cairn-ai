#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { lstatSync, readFileSync, readlinkSync, realpathSync, readdirSync } from "node:fs";
import { readFile, rename, rm } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { assertNoSymlinkComponents, safeMkdir, safeWriteFile, withStateLock } from "./cairn-safe-fs.mjs";

export const GOAL_STATE_VERSION = 2;
export const GOAL_STATUSES = new Set(["active", "paused", "blocked", "cancelled", "completed"]);
export const TASK_STATUSES = new Set(["pending", "active", "blocked", "completed"]);
export const PLAN_ID_MAX_LENGTH = 128;
export const TASK_ID_MAX_LENGTH = 64;
export const RECOVERY_REFERENCE_MAX_LENGTH = 160;

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
  return join(resolve(root), ".cairn", "state.json");
}

export async function readGoalState({ root = process.cwd() } = {}) {
  try {
    const path = goalStatePath(root);
    await assertNoSymlinkComponents(root, path);
    const text = await readFile(path, "utf8");
    return validateState(migrateState(JSON.parse(text)));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    if (error instanceof SyntaxError) throw new Error(`Cairn goal state is invalid JSON: ${error.message}`);
    throw error;
  }
}

export async function startGoal({ root = process.cwd(), goal, planId, tasks, completionCriteria = [], requiredEvidence = defaultGoalEvidence, ownerSessionId = null, evidencePolicy = "tool-bound" } = {}) {
  const normalizedGoal = requiredText(goal, "goal");
  const normalizedPlanId = boundedRequiredText(planId, "planId", PLAN_ID_MAX_LENGTH);
  if (!Array.isArray(tasks) || tasks.length === 0) throw new Error("tasks must contain at least one task");

  return withStateLock(root, async () => {
    const existing = await readGoalState({ root });
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

export async function writeGoalState({ root = process.cwd(), state } = {}) {
  return withStateLock(root, () => writeGoalStateUnlocked({ root, state }));
}

async function writeGoalStateUnlocked({ root = process.cwd(), state } = {}) {
  const validated = validateState(state);
  const path = goalStatePath(root);
  await safeMkdir(root, ".cairn");
  await assertNoSymlinkComponents(root, path);
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await safeWriteFile(root, temporaryPath, `${JSON.stringify(validated, null, 2)}\n`, "utf8");
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
    if (nextStatus === "completed") ensureGoalCanComplete(state, root);
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
  runner = spawnSync,
  timeoutMs = 600_000,
} = {}) {
  const normalizedArgv = validArgv(argv);
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
  const initialFingerprint = workspaceFingerprint(root, normalizedWatchPaths);
  const result = runner(normalizedArgv[0], normalizedArgv.slice(1), {
    cwd: resolve(root),
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    shell: false,
    timeout: validTimeout(timeoutMs),
  });
  if (result.error?.code === "ETIMEDOUT") throw new Error(`Verification timed out after ${timeoutMs}ms`);
  if (result.error) throw new Error(`Verification could not start: ${result.error.message}`);
  const exitCode = Number.isInteger(result.status) ? result.status : 1;
  const output = combinedOutput(result.stdout, result.stderr);
  if (exitCode !== 0) {
    const detail = boundedText(output, 2000);
    throw new Error(`Verification failed with exit ${exitCode}${detail ? `:\n${detail}` : ""}`);
  }

  const outputDigest = sha256(output);
  const fingerprint = workspaceFingerprint(root, normalizedWatchPaths);
  if (fingerprint !== initialFingerprint) throw new Error("Watched workspace changed during verification; evidence was not recorded");
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
  const command = normalizedArgv.map((value) => JSON.stringify(value)).join(" ");
  const state = await recordEvidence({
    root,
    taskId: normalizedTaskId,
    kind: normalizedKind,
    scope: normalizedScope,
    command,
    exitCode: 0,
    source: "tool",
    argv: normalizedArgv,
    outputDigest,
    summary: successSummary(output),
    workspaceFingerprint: fingerprint,
    watchPaths: normalizedWatchPaths,
    goalId: identity.goalId,
    planId: identity.planId,
    expectedIdentity: identity,
    expectedFingerprint: fingerprint,
  });
  return { state, evidence: state.receipts.at(-1) };
}

export function workspaceFingerprint(root = process.cwd(), watchPaths = []) {
  const workspaceRoot = resolve(root);
  const normalizedWatchPaths = normalizeWatchPaths(workspaceRoot, watchPaths);
  const gitPaths = normalizedWatchPaths.length === 0 ? listGitWorkspacePaths(workspaceRoot, normalizedWatchPaths) : null;
  const paths = normalizedWatchPaths.length > 0
    ? listFilesystemPaths(workspaceRoot, normalizedWatchPaths)
    : (gitPaths ?? listFilesystemPaths(workspaceRoot, normalizedWatchPaths));
  const hash = createHash("sha256");
  for (const path of [...new Set(paths)].sort()) hashWorkspacePath(hash, workspaceRoot, path);
  return `sha256:${hash.digest("hex")}`;
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
  const [firstCommand = "help", ...remaining] = args;
  const [command = "help", ...rest] = firstCommand === "goal" ? remaining : [firstCommand, ...remaining];
  const { options, positional, passthrough } = parseArgs(rest, command);
  const root = options.root ?? process.cwd();
  const emit = options.quiet ? () => {} : stdout;
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
      evidencePolicy: options.evidencePolicy ?? options["evidence-policy"] ?? "tool-bound",
    });
    emit(JSON.stringify(state));
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
    emit(JSON.stringify(state));
    return state;
  }
  if (command === "assign") {
    const state = await assignTask({ root, taskId: options.task ?? positional[0], agentId: options.agent ?? positional[1] ?? null });
    emit(JSON.stringify(state));
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
      goalId: options.goalId ?? options["goal-id"],
      planId: options.plan,
    });
    emit(JSON.stringify(state));
    return state;
  }
  if (command === "verify") {
    const result = await verifyAndRecord({
      root,
      taskId: options.task ?? positional[0],
      kind: options.kind,
      scope: options.scope,
      watchPaths: splitValues(options.watch),
      argv: passthrough,
      timeoutMs: options["timeout-ms"] === undefined ? 600_000 : positiveIntegerOption(options["timeout-ms"], "timeout-ms"),
    });
    emit(JSON.stringify({
      id: result.evidence.id,
      scope: result.evidence.scope,
      kind: result.evidence.kind,
      exitCode: result.evidence.exitCode,
      outputDigest: result.evidence.outputDigest,
      workspaceFingerprint: result.evidence.workspaceFingerprint,
    }));
    return result.state;
  }
  if (["pause", "resume", "block", "cancel", "complete"].includes(command)) {
    const state = await transitionGoal({
      root,
      status: { pause: "paused", resume: "active", block: "blocked", cancel: "cancelled", complete: "completed" }[command],
      blocker: options.reason,
    });
    emit(JSON.stringify(state));
    return state;
  }
  throw new Error("Usage: cairn-goal start|status|task|assign|receipt|verify|pause|resume|block|cancel|complete [--root PATH]");
}

async function mutateGoal(root, mutate) {
  return withStateLock(root, async () => {
    const state = await readGoalState({ root });
    if (!state) throw new Error("No Cairn goal state exists; start a goal first");
    const next = await mutate(structuredClone(state));
    next.revision += 1;
    await writeGoalStateUnlocked({ root, state: next });
    return next;
  });
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
  const normalizedArgv = validArgv(argv);
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

function validArgv(argv) {
  if (!Array.isArray(argv) || argv.length === 0) throw new Error("verification command must follow -- as argv");
  return argv.map((item, index) => {
    if (typeof item !== "string") throw new Error(`verification argv[${index}] must be a string`);
    if (index === 0 && item.trim().length === 0) throw new Error("verification executable must be a non-empty string");
    return item;
  });
}

function validSha256(value, label) {
  if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${label} must be a sha256 digest`);
  }
  return value;
}

function normalizeWatchPaths(root, watchPaths) {
  if (!Array.isArray(watchPaths)) throw new Error("watchPaths must be an array");
  const workspaceRoot = resolve(root);
  return [...new Set(watchPaths.map((item, index) => {
    const source = requiredText(item, `watchPaths[${index}]`);
    const absolutePath = resolve(workspaceRoot, source);
    const relativePath = relative(workspaceRoot, absolutePath);
    if (relativePath === ".." || relativePath.startsWith(`..${sep}`)) {
      throw new Error(`watch path must remain inside the workspace: ${source}`);
    }
    const normalizedPath = relativePath === "" ? "." : relativePath.split(sep).join("/");
    if (isInternalStatePath(normalizedPath)) throw new Error(`watch path cannot target internal Cairn or Git state: ${source}`);
    return normalizedPath;
  }))];
}

function listGitWorkspacePaths(root, watchPaths) {
  const args = ["-C", root, "ls-files", "-z", "--cached", "--others", "--exclude-standard"];
  if (watchPaths.length > 0) args.push("--", ...watchPaths);
  const result = spawnSync("git", args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0 || result.error) return null;
  const paths = result.stdout.split("\0").filter(Boolean).filter((path) => !isInternalStatePath(path));
  for (const watchPath of watchPaths) {
    try {
      if (!lstatSync(join(root, ...watchPath.split("/"))).isDirectory() && !paths.includes(watchPath)) paths.push(watchPath);
    } catch (error) {
      if (error?.code === "ENOENT") paths.push(watchPath);
      else throw error;
    }
  }
  return paths;
}

function listFilesystemPaths(root, watchPaths) {
  const paths = [];
  const visit = (relativePath) => {
    if (isInternalStatePath(relativePath)) return;
    const absolutePath = relativePath === "." ? root : join(root, ...relativePath.split("/"));
    let stat;
    try {
      stat = lstatSync(absolutePath);
    } catch (error) {
      if (error?.code === "ENOENT") {
        paths.push(relativePath);
        return;
      }
      throw error;
    }
    if (!stat.isDirectory()) {
      paths.push(relativePath);
      return;
    }
    const entries = readdirSync(absolutePath).sort();
    if (entries.length === 0) paths.push(relativePath);
    for (const entry of entries) {
      const child = relativePath === "." ? entry : `${relativePath}/${entry}`;
      visit(child);
    }
  };
  for (const path of watchPaths.length > 0 ? watchPaths : ["."]) visit(path);
  return paths;
}

function hashWorkspacePath(hash, root, relativePath) {
  const absolutePath = relativePath === "." ? root : join(root, ...relativePath.split("/"));
  hash.update(`${relativePath}\0`);
  let stat;
  try {
    stat = lstatSync(absolutePath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      hash.update("missing\0");
      return;
    }
    throw error;
  }
  hash.update(`${stat.mode}\0`);
  if (stat.isSymbolicLink()) {
    hash.update(`symlink\0${readlinkSync(absolutePath)}\0`);
  } else if (stat.isFile()) {
    hash.update("file\0");
    hash.update(readFileSync(absolutePath));
    hash.update("\0");
  } else if (stat.isDirectory()) {
    hash.update("directory\0");
  } else {
    hash.update("other\0");
  }
}

function isInternalStatePath(path) {
  const firstSegment = path.split("/")[0];
  return firstSegment === ".git" || firstSegment === ".cairn";
}

function combinedOutput(stdout, stderr) {
  return [stdout, stderr].filter((value) => typeof value === "string" && value.length > 0).join("\n").trim();
}

function boundedText(value, maxLength) {
  const text = String(value ?? "").trim();
  if (text.length <= maxLength) return text;
  return `…${text.slice(-(maxLength - 1))}`;
}

function successSummary(output) {
  const text = String(output ?? "");
  const outputBytes = Buffer.byteLength(text);
  const outputLines = text.length === 0 ? 0 : text.split(/\r?\n/).length;
  return `verification passed; outputBytes=${outputBytes}; outputLines=${outputLines}`;
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function optionalText(value, label) {
  return value === undefined || value === null ? null : requiredText(value, label);
}

function timestamp() {
  return new Date().toISOString();
}

function parseArgs(args, command) {
  const options = {};
  const positional = [];
  const passthrough = [];
  const booleanOptions = new Set(["quiet"]);
  const allowed = allowedOptions(command);
  const seenCanonicalOptions = new Set();
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--") {
      passthrough.push(...args.slice(index + 1));
      break;
    }
    if (!value.startsWith("--")) {
      positional.push(value);
      continue;
    }
    const option = value.slice(2);
    const equalsIndex = option.indexOf("=");
    const key = equalsIndex === -1 ? option : option.slice(0, equalsIndex);
    const inline = equalsIndex === -1 ? undefined : option.slice(equalsIndex + 1);
    if (!allowed.has(key)) throw new Error(`Unknown option for ${command}: --${key}`);
    const canonicalKey = canonicalOptionKey(key);
    if (seenCanonicalOptions.has(canonicalKey)) throw new Error(`--${canonicalKey} may only be provided once`);
    seenCanonicalOptions.add(canonicalKey);
    if (inline !== undefined) {
      if (!booleanOptions.has(key) && inline.length === 0) throw new Error(`--${key} requires a value`);
      if (booleanOptions.has(key) && !["true", "false"].includes(inline)) throw new Error(`--${key} must be true or false`);
      options[key] = booleanOptions.has(key) ? inline !== "false" : inline;
    }
    else if (booleanOptions.has(key)) options[key] = true;
    else {
      const next = args[index + 1];
      if (next === undefined || next === "--" || next.startsWith("--")) throw new Error(`--${key} requires a value`);
      options[key] = next;
      index += 1;
    }
  }
  return { options, positional, passthrough };
}

function canonicalOptionKey(key) {
  return {
    exitCode: "exit-code",
    exit: "exit-code",
    goalId: "goal-id",
    evidencePolicy: "evidence-policy",
  }[key] ?? key;
}

function allowedOptions(command) {
  const common = ["root", "quiet"];
  const byCommand = {
    start: ["goal", "plan", "tasks", "criteria", "requiredEvidence", "session", "evidencePolicy", "evidence-policy"],
    status: [],
    task: ["task", "status", "reason"],
    assign: ["task", "agent"],
    receipt: ["task", "kind", "scope", "command", "exitCode", "exit-code", "exit", "timestamp", "goalId", "goal-id", "plan"],
    verify: ["task", "kind", "scope", "watch", "timeout-ms"],
    pause: [],
    resume: [],
    block: ["reason"],
    cancel: [],
    complete: [],
    help: [],
  };
  return new Set([...common, ...(byCommand[command] ?? [])]);
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

function positiveIntegerOption(value, label) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result <= 0 || result > 3_600_000) {
    throw new Error(`${label} must be an integer between 1 and 3600000`);
  }
  return result;
}

function validTimeout(value) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("timeoutMs must be a positive integer");
  return value;
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
