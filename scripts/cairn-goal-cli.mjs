export async function runGoalCli(args, {
  stdout = console.log,
  defaultGoalEvidence,
  operations,
}) {
  const [firstCommand = "help", ...remaining] = args;
  const [command = "help", ...rest] = firstCommand === "goal" ? remaining : [firstCommand, ...remaining];
  const { options, positional, passthrough } = parseArgs(rest, command);
  const root = options.root ?? process.cwd();
  const emit = options.quiet ? () => {} : stdout;
  if (command === "start") {
    const tasks = parseTasks(options.tasks ?? positional.slice(0));
    const state = await operations.startGoal({
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
    const state = await operations.readGoalState({ root });
    stdout(JSON.stringify(state));
    return state;
  }
  if (command === "task") {
    if (positional[0] === "status" && options.status === undefined) {
      const state = await operations.readGoalState({ root });
      if (!state) {
        stdout(JSON.stringify(null));
        return null;
      }
      const requestedTaskId = options.task ?? positional[1];
      const task = requestedTaskId === undefined
        ? state.tasks.find((candidate) => candidate.status === "active") ?? null
        : state.tasks.find((candidate) => candidate.id === requestedTaskId);
      if (requestedTaskId !== undefined && task === undefined) throw new Error(`Unknown task: ${requestedTaskId}`);
      stdout(JSON.stringify(task));
      return task;
    }
    const taskAction = taskStatusFromAction(positional[0]);
    const state = await operations.setTaskStatus({
      root,
      taskId: options.task ?? (taskAction ? positional[1] : positional[0]),
      status: options.status ?? taskAction ?? positional[1],
      blocker: options.reason,
    });
    emit(JSON.stringify(state));
    return state;
  }
  if (command === "replan") {
    const state = await operations.replanGoal({ root, tasks: parseTasks(options.tasks ?? positional.slice(0)) });
    emit(JSON.stringify(state));
    return state;
  }
  if (command === "assign") {
    const state = await operations.assignTask({
      root,
      taskId: options.task ?? positional[0],
      agentId: options.agent ?? positional[1] ?? null,
    });
    emit(JSON.stringify(state));
    return state;
  }
  if (command === "receipt") {
    const state = await operations.recordReceipt({
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
    const result = await operations.verifyAndRecord({
      root,
      taskId: options.task ?? positional[0],
      kind: options.kind,
      scope: options.scope,
      watchPaths: splitValues(options.watch),
      argv: passthrough,
      timeoutMs: options["timeout-ms"] === undefined
        ? 600_000
        : positiveIntegerOption(options["timeout-ms"], "timeout-ms"),
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
    const state = await operations.transitionGoal({
      root,
      status: { pause: "paused", resume: "active", block: "blocked", cancel: "cancelled", complete: "completed" }[command],
      blocker: options.reason,
    });
    emit(JSON.stringify(state));
    return state;
  }
  throw new Error("Usage: cairn-goal start|status|task|replan|assign|receipt|verify|pause|resume|block|cancel|complete [--root PATH]");
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
    } else if (booleanOptions.has(key)) {
      options[key] = true;
    } else {
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
    replan: ["tasks"],
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
