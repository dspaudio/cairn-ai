import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { cairnConfigProjection, readSharedConfigSnapshot, removeCairnConfig } from "./cairn-lifecycle-config.mjs";

export function createTransactionJournal(context) {
  const {
    marketplaceRoot, ownershipPath, pluginName, releaseVersion, transactionPath,
    transactionRoot, expectedManagedTarget, targetDigest,
  } = context;
async function createTransaction() {
  const id = randomUUID();
  const root = join(transactionRoot, id);
  const transaction = {
    schemaVersion: 1,
    id,
    state: "active",
    root,
    stageRoot: join(root, "stage"),
    backupRoot: join(root, "backup"),
    entries: [],
  };
  await mkdir(transaction.backupRoot, { recursive: true });
  await writeTransactionJournal(transaction);
  return transaction;
}

async function rollback(transaction) {
  await rollbackEntries(transaction);
  await rm(transaction.root, { recursive: true, force: true });
  await rm(transactionPath, { force: true });
}

async function finishTransaction(transaction) {
  transaction.state = "committed";
  try {
    await writeTransactionJournal(transaction);
  } catch (error) {
    transaction.state = "active";
    throw error;
  }
  await rm(transaction.root, { recursive: true, force: true });
  await rm(transactionPath, { force: true });
}

async function writeTransactionJournal(transaction) {
  const durable = {
    schemaVersion: transaction.schemaVersion,
    id: transaction.id,
    state: transaction.state,
    entries: transaction.entries,
  };
  await durableReplaceFile(transactionPath, `${JSON.stringify(durable, null, 2)}\n`, transaction.id);
}

async function durableReplaceFile(path, content, nonce = randomUUID()) {
  await mkdir(dirname(path), { recursive: true });
  const candidate = `${path}.${nonce}.tmp`;
  const file = await open(candidate, "w", 0o600);
  try {
    await file.writeFile(content, "utf8");
    await file.sync();
  } finally {
    await file.close();
  }
  await rename(candidate, path);
  // Directory fsync is unavailable on some Windows/filesystem combinations. The
  // file fsync+atomic rename remains the portable floor; directory sync is best effort.
  try {
    const directory = await open(dirname(path), "r");
    try { await directory.sync(); } finally { await directory.close(); }
  } catch (error) {
    if (!(["EINVAL", "ENOTSUP", "EISDIR", "EPERM", "EACCES"].includes(error?.code))) throw error;
  }
}

async function recoverInterruptedTransaction() {
  if (!(await exists(transactionPath))) return;
  let journal;
  try {
    journal = JSON.parse(await readFile(transactionPath, "utf8"));
  } catch {
    throw new Error(`Lifecycle transaction journal is invalid: ${transactionPath}`);
  }
  validateTransactionJournal(journal, { strict: true });
  if (journal.state === "committed") {
    await rm(join(transactionRoot, journal.id), { recursive: true, force: true });
    await rm(transactionPath, { force: true });
    return;
  }
  await rollbackEntries(journal);
  await rm(join(transactionRoot, journal.id), { recursive: true, force: true });
  await rm(transactionPath, { force: true });
}

function validateTransactionJournal(journal, { strict = false } = {}) {
  if (journal?.schemaVersion !== 1 || typeof journal.id !== "string" || !/^[a-f0-9-]{20,}$/i.test(journal.id)
      || !["active", "committed"].includes(journal.state) || !Array.isArray(journal.entries)) {
    throw new Error("Lifecycle transaction journal has an invalid schema.");
  }
  if (strict && !sameKeys(journal, ["schemaVersion", "id", "state", "entries"])) throw new Error("Lifecycle transaction journal has unknown fields.");
  const allowedBackupRoot = resolve(transactionRoot, journal.id, "backup");
  const ids = new Set();
  const paths = new Set();
  for (const entry of journal.entries) {
    const expected = entry.id === "ownership"
      ? { phase: "manifest", path: ownershipPath, type: "file" }
      : entry.id === "previous-codex-runtime"
        ? previousRuntimeTarget(entry.path)
      : expectedManagedTarget(entry.id);
    if (!expected || expected.path !== entry.path || expected.phase !== entry.phase || expected.type !== entry.type
        || !["prepared", "applied"].includes(entry.status)
        || !["replace", "remove"].includes(entry.operation)
        || typeof entry.existed !== "boolean"
        || !isInside(allowedBackupRoot, entry.backup)
        || typeof entry.expectedNewDigest !== "string" || typeof entry.previousDigest !== "string") {
      throw new Error(`Lifecycle transaction journal contains an unsafe entry: ${entry?.id ?? "unknown"}`);
    }
    if (strict && !sameKeys(entry, ["id", "phase", "path", "type", "backup", "existed", "previousDigest", "expectedNewDigest", "operation", "status"])) {
      throw new Error(`Lifecycle transaction journal entry has unknown fields: ${entry.id}`);
    }
    if (ids.has(entry.id) || paths.has(entry.path)) throw new Error(`Lifecycle transaction journal contains duplicate targets: ${entry.id}`);
    if (entry.operation === "remove" && entry.expectedNewDigest !== "missing") throw new Error(`Lifecycle remove entry has an invalid new digest: ${entry.id}`);
    ids.add(entry.id);
    paths.add(entry.path);
  }
}

function previousRuntimeTarget(path) {
  const parent = join(marketplaceRoot, pluginName);
  const relation = relative(parent, resolve(path));
  if (!relation || relation.includes(sep) || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(relation) || relation === releaseVersion) return null;
  return { phase: "cleanup", path: join(parent, relation), type: "tree" };
}

function sameKeys(value, expected) {
  return Object.keys(value).sort().join("\0") === [...expected].sort().join("\0");
}

async function rollbackEntries(transaction) {
  validateTransactionJournal(transaction);
  for (const entry of [...transaction.entries].reverse()) {
    const destinationExists = await exists(entry.path);
    const backupExists = await exists(entry.backup);
    if (backupExists) {
      if (entry.type === "config" && entry.status === "prepared") {
        const previousConfig = (await readSharedConfigSnapshot(entry.backup)).text;
        if (destinationExists) {
          const currentConfig = (await readSharedConfigSnapshot(entry.path)).text;
          await writeFile(entry.path, `${removeCairnConfig(currentConfig)}${cairnConfigProjection(previousConfig)}`);
          await rm(entry.backup, { force: true });
        } else {
          await mkdir(dirname(entry.path), { recursive: true });
          await rename(entry.backup, entry.path);
        }
        continue;
      }
      if (!entry.existed) throw new Error(`Cannot recover transaction because an unexpected backup exists: ${entry.path}`);
      if (await targetDigest(entry.backup, entry.type) !== entry.previousDigest) {
        throw new Error(`Cannot recover transaction because its durable backup changed: ${entry.path}`);
      }
      if (destinationExists) {
        const current = await targetDigest(entry.path, entry.type);
        if (current !== entry.expectedNewDigest) throw new Error(`Cannot recover transaction because destination changed: ${entry.path}`);
        if (entry.type === "config") {
          const currentConfig = (await readSharedConfigSnapshot(entry.path)).text;
          const previousConfig = (await readSharedConfigSnapshot(entry.backup)).text;
          await writeFile(entry.path, `${removeCairnConfig(currentConfig)}${cairnConfigProjection(previousConfig)}`);
          await rm(entry.backup, { force: true });
          continue;
        }
        await rm(entry.path, { recursive: true, force: true });
      }
      await mkdir(dirname(entry.path), { recursive: true });
      await rename(entry.backup, entry.path);
    } else if (entry.status === "prepared") {
      continue;
    } else if (!entry.existed) {
      if (destinationExists) {
        const current = await targetDigest(entry.path, entry.type);
        if (current !== entry.expectedNewDigest) throw new Error(`Cannot recover new transaction target because it changed: ${entry.path}`);
        if (entry.type === "config") {
          const preserved = removeCairnConfig((await readSharedConfigSnapshot(entry.path)).text);
          if (preserved.length > 0) await writeFile(entry.path, preserved);
          else await rm(entry.path, { force: true });
        } else await rm(entry.path, { recursive: true, force: true });
      }
    } else {
      if (!destinationExists || await targetDigest(entry.path, entry.type) !== entry.previousDigest) {
        throw new Error(`Cannot recover transaction because its durable backup is missing: ${entry.path}`);
      }
    }
  }
}

  return {
    createTransaction, finishTransaction, recoverInterruptedTransaction, rollback,
    writeTransactionJournal,
  };

  async function exists(path) {
    try { await lstat(path); return true; }
    catch (error) { if (error?.code === "ENOENT") return false; throw error; }
  }

  function isInside(root, candidate) {
    const path = resolve(candidate);
    return path === root || path.startsWith(`${root}${sep}`);
  }
}
