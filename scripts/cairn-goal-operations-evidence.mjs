import { randomUUID } from "node:crypto";
import { normalizeVerificationArgv, normalizeWatchPaths, runVerificationEvidence, workspaceFingerprint } from "./cairn-goal-evidence.mjs";
import { readGoalState } from "./cairn-goal-state.mjs";
import {
  normalizeToolEvidence, requiredText, timestamp, validReceiptCommand, validReceiptScope,
  validReceiptSource, validTimestamp,
} from "./cairn-goal-state-validation.mjs";
import { assertGoalMutable, mutateGoal, taskById } from "./cairn-goal-operations-mutations.mjs";

export async function recordReceipt(options = {}) {
  if (options.source !== undefined && options.source !== "declared") throw new Error("Only goal verify can create tool evidence");
  return recordEvidence({ ...options, source: "declared" });
}

async function recordEvidence({
  root = process.cwd(), taskId, kind, scope = "task", command, exitCode,
  timestamp: receiptTimestamp, goalId, planId, source, argv, outputDigest,
  summary, workspaceFingerprint: fingerprint, watchPaths = [], expectedIdentity,
  expectedFingerprint,
} = {}) {
  const normalizedScope = validReceiptScope(scope);
  const normalizedTaskId = normalizedScope === "task" ? requiredText(taskId, "taskId") : undefined;
  const normalizedKind = requiredText(kind, "evidence kind");
  const normalizedCommand = validReceiptCommand(command);
  const normalizedSource = validReceiptSource(source);
  if (exitCode !== 0) throw new Error("evidence exitCode must be 0");
  const normalizedTimestamp = validTimestamp(receiptTimestamp ?? timestamp());
  const toolFields = normalizedSource === "tool" ? normalizeToolEvidence({ argv, outputDigest, summary, fingerprint, watchPaths }) : {};
  return mutateGoal(root, (state) => {
    assertGoalMutable(state);
    const task = normalizedScope === "task" ? taskById(state, normalizedTaskId) : null;
    if (expectedIdentity && (state.goal.id !== expectedIdentity.goalId || state.goal.planId !== expectedIdentity.planId)) {
      throw new Error("Goal identity changed during verification; evidence was not recorded");
    }
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
  root = process.cwd(), taskId, kind, scope = "task", argv, watchPaths = [],
  runner, timeoutMs = 600_000,
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
