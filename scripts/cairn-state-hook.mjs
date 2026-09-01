export function continuationReason(reason, payload) {
  const continuation = payload?.stop_hook_active ? " This turn was already continued; the active goal remains persisted for the next session." : "";
  return `${reason}${continuation}`;
}

export function stopHookOutput(gate, payload) {
  if (!gate.block) return { continue: true };
  const reason = continuationReason(gate.reason, payload);
  if (payload?.stop_hook_active) {
    return { continue: true, systemMessage: reason };
  }
  return { decision: "block", reason };
}

export function stopAllowedMessage({ ko, state, event }) {
  if (state?.goal?.status) {
    return ko
      ? `Cairn 종료 게이트: 목표 상태가 ${state.goal.status}이므로 종료를 허용합니다.`
      : `Cairn stop gate: goal status is ${state.goal.status}; allowing stop.`;
  }
  return ko
    ? `${event === "subagent-stop" ? "서브에이전트" : "작업"} 종료 게이트: 활성 Cairn 목표가 없어 종료를 허용합니다.`
    : `${event === "subagent-stop" ? "Subagent" : "Turn"} stop gate: no active Cairn goal; allowing stop.`;
}
