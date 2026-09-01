import { createLifecycleLock, DEFAULT_LIFECYCLE_LOCK_TIMEOUT_MS } from "./cairn-lifecycle-lock.mjs";
import { createTransactionJournal } from "./cairn-lifecycle-transaction-journal.mjs";
import { createTransactionTargets } from "./cairn-lifecycle-transaction-targets.mjs";

export { DEFAULT_LIFECYCLE_LOCK_TIMEOUT_MS };

export function createTransactionManager(context) {
  const lock = createLifecycleLock(context);
  const journal = createTransactionJournal(context);
  const targets = createTransactionTargets({ ...context, writeTransactionJournal: journal.writeTransactionJournal });
  return { ...journal, ...lock, ...targets };
}
