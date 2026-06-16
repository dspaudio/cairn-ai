#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { runState } from "./cairn-state.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));

export async function main(command = "help", args = [], { runner = spawnSync } = {}) {
  if (["install", "upgrade", "doctor", "uninstall"].includes(command)) {
    const result = runner(process.execPath, [join(scriptDir, "cairn-lifecycle.mjs"), command, ...args], { stdio: "inherit" });
    process.exitCode = result.status ?? 1;
    return;
  }
  if (command === "init") {
    console.log(await runState("manual"));
    return;
  }
  if (command === "toolcheck") {
    const result = runner(process.execPath, [join(scriptDir, "cairn-toolcheck.mjs"), ...args], { stdio: "inherit" });
    process.exitCode = result.status ?? 1;
    return;
  }
  if (["memory", "plan", "work", "review"].includes(command)) {
    console.log(message(command));
    return;
  }
  console.log(message("usage"));
}

export function message(key, locale = localeValue()) {
  const family = localeFamily(locale);
  return messages[family]?.[key] ?? messages.en[key];
}

export function localeFamily(locale = localeValue()) {
  const normalized = locale.toLowerCase();
  for (const family of ["ko", "ja", "zh", "es", "fr", "de", "pt"]) {
    if (normalized.startsWith(family)) return family;
  }
  return "en";
}

function localeValue() {
  return [process.env.LC_ALL, process.env.LC_MESSAGES, process.env.LANG]
    .find((value) => typeof value === "string" && value.length > 0) ?? Intl.DateTimeFormat().resolvedOptions().locale;
}

function isCliEntry() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  }
}

const messages = {
  en: {
    memory: "Use the cairn-memory skill. Keep MEMORY.md as a short index and write details to docs/memory/<domain>.md.",
    plan: "Use the cairn-plan skill before non-trivial implementation. Every agent must first read the project-root MEMORY.md for domain knowledge and repository policy. Understand the whole work first, then classify it into executable tasks and sub-tasks. Keep PLAN.md as an index, write detailed plans to docs/plan/<topic>.md, and record Light/Heavy Path triage before any mutation.",
    work: "Use the cairn-work skill only after a plan exists. Every agent must first read the project-root MEMORY.md for domain knowledge and repository policy. Execute one module task using the recorded Light/Heavy Path route, and capture dry-run/check, module, and surface evidence. If the user asks a side question while work is active, answer briefly and then resume unless they explicitly ask to pause, stop, or switch tasks.",
    review: "Use the cairn-review skill. Compare evidence against PLAN.md and MEMORY.md.",
    usage: "Usage: cairn install|upgrade|doctor|uninstall|init|memory|plan|work|review|toolcheck",
  },
  ko: {
    memory: "cairn-memory 스킬을 사용하세요. MEMORY.md는 짧은 색인으로, 상세 내용은 docs/memory/<domain>.md에 기록합니다.",
    plan: "중요 구현 전에는 cairn-plan 스킬을 사용하세요. 모든 에이전트는 도메인 지식과 저장소 정책을 위해 프로젝트 루트 MEMORY.md를 먼저 읽어야 합니다. 먼저 전체 작업을 파악한 뒤 실행 가능한 task와 필요한 sub-task로 분류합니다. PLAN.md는 색인으로, 상세 계획은 docs/plan/<topic>.md에 기록하며 파일 변경 전 Light/Heavy Path 트리아지를 남깁니다.",
    work: "계획이 있을 때만 cairn-work 스킬을 사용하세요. 모든 에이전트는 도메인 지식과 저장소 정책을 위해 프로젝트 루트 MEMORY.md를 먼저 읽어야 합니다. 기록된 Light/Heavy Path 경로로 하나의 모듈 작업을 실행하며 dry-run/check, 모듈, 표면 증거를 확보합니다. 작업 중 사용자가 곁가지 질문을 하면 짧게 답한 뒤, 명시적으로 일시중지/중단/작업 전환을 요청한 경우가 아니면 이전 active work를 계속합니다.",
    review: "cairn-review 스킬을 사용하세요. PLAN.md와 MEMORY.md 기준으로 증거를 비교합니다.",
    usage: "사용법: cairn install|upgrade|doctor|uninstall|init|memory|plan|work|review|toolcheck",
  },
  ja: {
    memory: "cairn-memory スキルを使用してください。MEMORY.md は短い索引にし、詳細は docs/memory/<domain>.md に記録します。",
    plan: "cairn-plan スキルを使用してください。PLAN.md は索引にし、詳細計画は docs/plan/<topic>.md に記録します。",
    work: "cairn-work スキルを使用してください。1つのモジュールスライスを実行し、モジュール証拠と表面証拠を取得します。",
    review: "cairn-review スキルを使用してください。PLAN.md と MEMORY.md に照らして証拠を比較します。",
    usage: "使い方: cairn install|upgrade|doctor|uninstall|init|memory|plan|work|review|toolcheck",
  },
  zh: {
    memory: "使用 cairn-memory skill。将 MEMORY.md 保持为简短索引，并将详细内容写入 docs/memory/<domain>.md。",
    plan: "使用 cairn-plan skill。将 PLAN.md 保持为索引，并将详细计划写入 docs/plan/<topic>.md。",
    work: "使用 cairn-work skill。执行一个模块切片，并收集模块证据。",
    review: "使用 cairn-review skill。根据 PLAN.md 和 MEMORY.md 对比证据。",
    usage: "用法: cairn install|upgrade|doctor|uninstall|init|memory|plan|work|review|toolcheck",
  },
  es: {
    memory: "Usa la skill cairn-memory. Mantén MEMORY.md como un índice breve y escribe los detalles en docs/memory/<domain>.md.",
    plan: "Usa la skill cairn-plan. Mantén PLAN.md como índice y escribe los planes detallados en docs/plan/<topic>.md.",
    work: "Usa la skill cairn-work. Ejecuta un solo segmento de módulo y captura evidencia de módulo y de superficie.",
    review: "Usa la skill cairn-review. Compara la evidencia con PLAN.md y MEMORY.md.",
    usage: "Uso: cairn install|upgrade|doctor|uninstall|init|memory|plan|work|review|toolcheck",
  },
  fr: {
    memory: "Utilisez la skill cairn-memory. Gardez MEMORY.md comme index court et écrivez les détails dans docs/memory/<domain>.md.",
    plan: "Utilisez la skill cairn-plan. Gardez MEMORY.md comme index et écrivez les plans détaillés dans docs/plan/<topic>.md.",
    work: "Utilisez la skill cairn-work. Exécutez une tranche de module et capturez les preuves de module et de surface.",
    review: "Utilisez la skill cairn-review. Comparez les preuves avec PLAN.md et MEMORY.md.",
    usage: "Utilisation: cairn install|upgrade|doctor|uninstall|init|memory|plan|work|review|toolcheck",
  },
  de: {
    memory: "Verwenden Sie die Skill cairn-memory. Halten Sie MEMORY.md als kurzen Index und schreiben Sie Details nach docs/memory/<domain>.md.",
    plan: "Verwenden Sie die Skill cairn-plan. Halten Sie MEMORY.md als Index und schreiben Sie Detailpläne nach docs/plan/<topic>.md.",
    work: "Verwenden Sie die Skill cairn-work. Führen Sie einen Modulabschnitt aus und erfassen Sie Modul- und Oberflächenbelege.",
    review: "Verwenden Sie die Skill cairn-review. Vergleichen Sie Belege mit PLAN.md und MEMORY.md.",
    usage: "Verwendung: cairn install|upgrade|doctor|uninstall|init|memory|plan|work|review|toolcheck",
  },
  pt: {
    memory: "Use a skill cairn-memory. Mantenha MEMORY.md como um índice curto e escreva detalhes em docs/memory/<domain>.md.",
    plan: "Use a skill cairn-plan. Mantenha MEMORY.md como índice e escreva planos detalhados em docs/plan/<topic>.md.",
    work: "Use a skill cairn-work. Execute uma fatia de módulo e capture evidências de módulo e de superfície.",
    review: "Use a skill cairn-review. Compare evidências com PLAN.md e MEMORY.md.",
    usage: "Uso: cairn install|upgrade|doctor|uninstall|init|memory|plan|work|review|toolcheck",
  },
};

if (isCliEntry()) {
  const [command = "help", ...args] = process.argv.slice(2);
  await main(command, args);
}
