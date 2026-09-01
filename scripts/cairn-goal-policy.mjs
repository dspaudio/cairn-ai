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
