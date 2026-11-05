const contextLimits = {
  goalTitle: 64,
  roadmapTaskId: 24,
  taskTitle: 40,
  roadmapWindow: 3,
};

export function prependContext(result, notice) {
  const specific = result.hookOutput?.hookSpecificOutput;
  if (!specific) return { ...result, message: `${notice}\n${result.message}` };
  return {
    ...result,
    message: `${notice}\n${result.message}`,
    hookOutput: {
      ...result.hookOutput,
      hookSpecificOutput: {
        ...specific,
        additionalContext: `${notice}\n${specific.additionalContext}`,
      },
    },
  };
}

export function contextResult({ ko, state, event }) {
  const base = kernelBase(ko);
  const idlePolicy = event === "user-prompt-submit"
    ? (ko
      ? " 비단순 구현이나 계획된 작업 재개는 cairn-plan과 plan/task를 복원·생성하세요. 대상이 확정된 Git/GitHub 상태·fetch·checkout·merge·push·PR 작업은 코드 수정·충돌 해결·파괴적 복구·릴리스/배포·설계가 필요하지 않으면 plan/goal 없이 실행하세요. 상담·설명·계획 전용도 goal 없이 처리하세요."
      : " For non-trivial implementation or planned-work continuation, load cairn-plan and restore/create its plan and task. Known-target Git/GitHub operations stay plan/goal-free unless they require code edits, conflict resolution, destructive recovery, release/deploy, or design. Consultation, explanation, and plan-only requests are also goal-free.")
    : (ko
      ? " 중요 작업 전에 cairn-plan을 로드하고 active plan과 current task를 복원하세요."
      : " Before non-trivial work, load cairn-plan and restore the active plan and current task.");
  const failClosed = ko
    ? " active state와 그 skill·plan·required task reference가 없거나 읽을 수 없거나 일치하지 않을 때만 중단하세요."
    : " Stop only if active state and its skill, plan, or required task ref is missing, unreadable, or inconsistent.";
  if (state && (state.goal.status === "paused" || state.goal.status === "blocked")) {
    return interruptedContextResult(event, ko, state);
  }
  if (!state || state.goal.status !== "active") return contextHookResult({ event, message: `${base}${idlePolicy}${failClosed}` });
  const task = state.tasks.find((item) => item.status === "active")
    ?? state.tasks.find((item) => item.status === "pending")
    ?? state.tasks.find((item) => item.status === "blocked");
  const planId = state.goal.planId;
  const phase = task ? "cairn-work" : "cairn-review";
  const activeHeader = ko
    ? `${base} ${phase}를 로드하고 정확한 plan ${planId}${task ? "과 아래 current task" : "의 완료 기준"}를 복원하세요. 압축·재시작·handoff 뒤 다시 읽으세요.${failClosed}`
    : `${base} Load ${phase}; restore exact plan ${planId}${task ? " and the current task below" : " completion criteria"}. Re-read after compaction/restart/handoff.${failClosed}`;
  if (!task) {
    return contextHookResult({
      event,
      message: [activeHeader, taskRoadmap(ko, state), activeGoalCompletionMessage(ko, state)].join("\n"),
    });
  }
  const taskId = task.id;
  const taskTitle = clipText(task.title, contextLimits.taskTitle);
  const continuation = taskId.length > 48
    ? (ko
      ? `정확한 current task: ${taskId}. 바인딩된 증거 뒤에만 완료하세요.`
      : `Exact task: ${taskId}. Complete after bound evidence.`)
    : (ko
      ? `현재: ${taskId} (${taskTitle}). 바인딩된 증거 뒤에만 완료하세요.`
      : `Current: ${taskId} (${taskTitle}). Complete only after bound evidence.`);
  const resume = event === "user-prompt-submit"
    ? (taskId.length > 48
      ? (ko
        ? "곁가지 질문·조향 뒤 위의 정확한 task를 재개하고 최종 검토까지 진행하세요(일시정지·중단·전환 요청 제외)."
        : "After side questions or steers, resume that exact task; advance to final review unless paused, stopped, or switched.")
      : (ko
        ? `곁가지 질문·조향 뒤 ${taskId}를 재개하고 남은 task를 최종 검토까지 진행하세요(일시정지·중단·전환 요청 제외).`
        : `After a side question or steer, resume ${taskId}, then advance remaining tasks to final review unless asked to pause, stop, or switch.`))
    : "";
  return contextHookResult({ event, message: [activeHeader, taskRoadmap(ko, state), continuation, resume].filter(Boolean).join("\n") });
}

function kernelBase(ko) {
  return ko ? "Cairn kernel: 루트 MEMORY.md는 선택 사항이며, 있으면 읽으세요." : "Cairn kernel: root MEMORY.md is optional; read it when present.";
}

function interruptedContextResult(event, ko, state) {
  const task = state.tasks.find((item) => item.status === "active")
    ?? state.tasks.find((item) => item.status === "pending")
    ?? state.tasks.find((item) => item.status === "blocked");
  const taskContext = task
    ? (ko
      ? `현재 task: ${task.id} (${clipText(task.title, contextLimits.taskTitle)}), 상태 ${task.status}.`
      : `Current task: ${task.id} (${clipText(task.title, contextLimits.taskTitle)}), status ${task.status}.`)
    : (ko ? "현재 task: 없음." : "Current task: none.");
  const blocker = state.goal.blocker ?? task?.blocker ?? (ko ? "없음" : "none");
  const recovery = ko
    ? "goal 상태를 자동으로 바꾸지 마세요. 정확한 context를 복원하고 원인을 처리한 뒤 goal resume을 명시적으로 실행하고 현재 task를 이어가세요."
    : "Do not change goal status automatically. Restore this exact context, address the interruption, then run goal resume explicitly and continue the current task.";
  const message = ko
    ? `${kernelBase(ko)} 정확한 plan: ${state.goal.planId}. ${taskContext} Goal 상태: ${state.goal.status}. Blocker: ${blocker}. ${recovery}`
    : `${kernelBase(ko)} Exact plan: ${state.goal.planId}. ${taskContext} Goal status: ${state.goal.status}. Blocker: ${blocker}. ${recovery}`;
  return contextHookResult({ event, message });
}

export function foreignSessionContextResult({ ko, event, sessionId }) {
  const claim = typeof sessionId === "string" && sessionId.length > 0
    ? (ko
      ? ` 이 session이 같은 작업을 이어받는 경우(재개·압축·handoff·fork)에만 cairn goal claim --session ${JSON.stringify(sessionId)} --root <repoRoot>로 소유권을 넘겨받고 이어가세요.`
      : ` Only if this session continues that same work (resume, compaction, handoff, fork), take ownership with cairn goal claim --session ${JSON.stringify(sessionId)} --root <repoRoot>, then continue.`)
    : "";
  const message = ko
    ? `Cairn kernel: 루트 MEMORY.md는 선택 사항이며, 있으면 읽으세요. 저장소 goal을 다른 session이 소유합니다. cairn goal status로 상태를 확인하고 소유권이 해결될 때까지 Cairn 작업을 시작·수정·위임·완료하지 마세요.${claim} 이 capsule은 goal, plan, task 상세를 노출하지 않습니다.`
    : `Cairn kernel: root MEMORY.md is optional; read it when present. A repository goal is owned by another session. Inspect cairn goal status; until ownership is resolved, do not start, edit, delegate, or complete Cairn work.${claim} This capsule does not expose goal, plan, or task details.`;
  return contextHookResult({ event, message });
}

function taskRoadmap(ko, state) {
  const formatTask = (task, index) => `${index + 1}. ${clipText(task.id, contextLimits.roadmapTaskId)} [${task.status}] ${clipText(task.title, contextLimits.taskTitle)}`;
  if (state.tasks.length <= contextLimits.roadmapWindow) {
    return `${ko ? "작업 단계" : "Work steps"}:\n${state.tasks.map(formatTask).join("\n")}`;
  }

  const currentIndex = Math.max(0, state.tasks.findIndex((task) => task.status === "active" || task.status === "pending"));
  const counts = Object.fromEntries([...TASK_STATUS_NAMES].map((status) => [status, state.tasks.filter((task) => task.status === status).length]));
  const countSummary = Object.entries(counts).filter(([, count]) => count > 0).map(([status, count]) => `${status} ${count}`).join(", ");
  const omitted = state.tasks.length - 1;
  const header = ko
    ? `작업 단계 (${state.tasks.length}개; ${countSummary})`
    : `Work steps (${state.tasks.length}; ${countSummary})`;
  const omission = ko ? `… ${omitted}개 단계 생략` : `… ${omitted} steps omitted`;
  const currentPosition = currentIndex + 1;
  const upcoming = state.tasks.slice(currentIndex + 1).filter((task) => task.status === "pending").slice(0, 2)
    .map((task) => clipText(task.id, contextLimits.roadmapTaskId));
  const next = upcoming.length > 0 ? `; ${ko ? "다음" : "next"} ${upcoming.join(", ")}` : "";
  return `${header}. ${ko ? `현재 위치 ${currentPosition}` : `Current position ${currentPosition}`}; ${omission}${next}`;
}

function contextHookResult({ event, message }) {
  return {
    status: 0,
    message,
    hookOutput: {
      hookSpecificOutput: {
        hookEventName: event === "session-start" ? "SessionStart" : "UserPromptSubmit",
        additionalContext: message,
      },
    },
  };
}

function activeGoalCompletionMessage(ko, state) {
  const goalTitle = clipText(state.goal.title, contextLimits.goalTitle);
  return ko
    ? `활성 목표 "${goalTitle}"의 모든 task가 완료되었습니다. 완료 기준을 확인하고 명시적으로 complete 상태로 전이하세요.`
    : `All tasks for active goal "${goalTitle}" are complete. Verify criteria and explicitly transition the goal to completed.`;
}

const TASK_STATUS_NAMES = ["active", "pending", "blocked", "completed"];

function clipText(value, maxLength) {
  const text = String(value ?? "");
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
}
