import { normalizeVerificationArgv } from "./cairn-goal-evidence.mjs";

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
export const terminalGoalStatuses = new Set(["cancelled", "completed"]);
export const defaultTaskEvidence = ["moduleAcceptance", "surfaceIntegration"];
export const defaultGoalEvidence = ["finalReview"];

const evidencePolicies = new Set(["declared", "tool-bound"]);

export function validateState(value) {
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
  if (validReceiptSource(receipt.source) === "tool") {
    normalizeToolEvidence({ argv: receipt.argv, outputDigest: receipt.outputDigest, summary: receipt.summary, fingerprint: receipt.workspaceFingerprint, watchPaths: receipt.watchPaths });
  }
}

export function normalizeTask(task, index, defaultStatus) {
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

export function migrateState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.schemaVersion !== 1) return value;
  return {
    ...value,
    schemaVersion: GOAL_STATE_VERSION,
    goal: { ...value.goal, evidencePolicy: value.goal?.evidencePolicy ?? "tool-bound" },
    receipts: Array.isArray(value.receipts) ? value.receipts.map((receipt) => ({ ...receipt, source: "declared" })) : value.receipts,
  };
}

export function requiredText(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

export function boundedRequiredText(value, label, maxLength) {
  const text = requiredText(value, label);
  if (value !== text) throw new Error(`${label} must not have leading or trailing whitespace`);
  if (text.length > maxLength) throw new Error(`${label} must be at most ${maxLength} characters`);
  return text;
}

export function assertRecoveryReferenceBudget(planId, taskId) {
  if (planId.length + taskId.length > RECOVERY_REFERENCE_MAX_LENGTH) throw new Error(`planId and taskId must total at most ${RECOVERY_REFERENCE_MAX_LENGTH} characters for exact recovery context`);
}

export function validGoalStatus(value) {
  if (!GOAL_STATUSES.has(value)) throw new Error(`Invalid goal status: ${value}`);
  return value;
}

export function validEvidencePolicy(value) {
  if (!evidencePolicies.has(value)) throw new Error(`Invalid evidence policy: ${value}`);
  return value;
}

export function validTaskStatus(value) {
  if (!TASK_STATUSES.has(value)) throw new Error(`Invalid task status: ${value}`);
  return value;
}

export function validReceiptScope(value) {
  if (value !== "task" && value !== "goal") throw new Error(`Invalid evidence scope: ${value}`);
  return value;
}

export function validReceiptSource(value) {
  if (value !== "declared" && value !== "tool") throw new Error(`Invalid evidence source: ${value}`);
  return value;
}

export function validReceiptCommand(value) {
  const command = requiredText(value, "evidence command");
  if (/\b(skip(?:ped)?|todo|tbd|n\/?a|not[ -]?run|not[ -]?applicable|placeholder)\b/i.test(command)) throw new Error("evidence command cannot be skipped, placeholder, or incomplete");
  return command;
}

export function validTimestamp(value) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new Error("timestamp must be an ISO-8601 date string");
  return value;
}

export function normalizeCriteria(criteria) {
  if (!Array.isArray(criteria)) throw new Error("completionCriteria must be an array");
  return criteria.map((item, index) => requiredText(item, `completionCriteria[${index}]`));
}

export function normalizeToolEvidence({ argv, outputDigest, summary, fingerprint, watchPaths }) {
  const normalizedArgv = normalizeVerificationArgv(argv);
  const normalizedOutputDigest = validSha256(outputDigest, "evidence outputDigest");
  const normalizedSummary = requiredText(summary, "evidence summary");
  const normalizedFingerprint = validSha256(fingerprint, "evidence workspaceFingerprint");
  if (!Array.isArray(watchPaths)) throw new Error("evidence watchPaths must be an array");
  return {
    argv: normalizedArgv,
    outputDigest: normalizedOutputDigest,
    summary: normalizedSummary,
    workspaceFingerprint: normalizedFingerprint,
    watchPaths: watchPaths.map((item, index) => requiredText(item, `evidence watchPaths[${index}]`)),
  };
}

function validSha256(value, label) {
  if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value)) throw new Error(`${label} must be a sha256 digest`);
  return value;
}

export function optionalText(value, label) {
  return value === undefined || value === null ? null : requiredText(value, label);
}

export function timestamp() {
  return new Date().toISOString();
}
