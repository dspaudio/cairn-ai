import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { link, lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

const LOCK_SCHEMA_VERSION = 1;
const DEFAULT_LOCK_TIMEOUT_MS = 5_000;
const DEFAULT_RETRY_MS = 25;
const DEFAULT_MALFORMED_STALE_MS = 30_000;

export function stateLockPath(root = process.cwd()) {
  return safePath(root, ".cairn/state.lock");
}

export function safePath(root, relativePath) {
  const workspaceRoot = resolve(root);
  const target = resolve(workspaceRoot, relativePath);
  const relation = relative(workspaceRoot, target);
  if (relation === ".." || relation.startsWith(`..${sep}`)) {
    throw new Error(`Managed path must remain inside the workspace: ${relativePath}`);
  }
  return target;
}

export async function assertNoSymlinkComponents(root, target, { allowMissing = true } = {}) {
  const workspaceRoot = resolve(root);
  const absoluteTarget = resolve(target);
  const relation = relative(workspaceRoot, absoluteTarget);
  if (relation === ".." || relation.startsWith(`..${sep}`)) {
    throw new Error(`Managed path must remain inside the workspace: ${target}`);
  }
  const components = relation === "" ? [] : relation.split(sep);
  let current = workspaceRoot;
  await rejectSymlink(current);
  for (const component of components) {
    current = join(current, component);
    try {
      await rejectSymlink(current);
    } catch (error) {
      if (allowMissing && error?.code === "ENOENT") return;
      throw error;
    }
  }
}

export async function safeMkdir(root, relativePath) {
  const workspaceRoot = resolve(root);
  const target = safePath(workspaceRoot, relativePath);
  await assertNoSymlinkComponents(workspaceRoot, workspaceRoot, { allowMissing: false });
  const relation = relative(workspaceRoot, target);
  let current = workspaceRoot;
  for (const component of relation.split(sep).filter(Boolean)) {
    current = join(current, component);
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink()) throw symlinkError(current);
      if (!stat.isDirectory()) throw new Error(`Managed directory component is not a directory: ${current}`);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      try {
        await mkdir(current);
      } catch (mkdirError) {
        if (mkdirError?.code !== "EEXIST") throw mkdirError;
        const stat = await lstat(current);
        if (stat.isSymbolicLink()) throw symlinkError(current);
        if (!stat.isDirectory()) throw new Error(`Managed directory component is not a directory: ${current}`);
      }
    }
  }
  return target;
}

export async function safeWriteFile(root, target, data, options) {
  const absoluteTarget = safePath(root, relative(resolve(root), resolve(target)));
  await assertNoSymlinkComponents(root, dirname(absoluteTarget), { allowMissing: false });
  await assertNoSymlinkComponents(root, absoluteTarget);
  return writeFile(absoluteTarget, data, options);
}

export async function withStateLock(root, operation, {
  timeoutMs = DEFAULT_LOCK_TIMEOUT_MS,
  retryMs = DEFAULT_RETRY_MS,
  malformedStaleMs = DEFAULT_MALFORMED_STALE_MS,
  testHooks = {},
} = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0) throw new Error("lock timeoutMs must be a non-negative number");
  const workspaceRoot = resolve(root);
  await safeMkdir(workspaceRoot, ".cairn");
  const lockPath = stateLockPath(workspaceRoot);
  const owner = {
    schemaVersion: LOCK_SCHEMA_VERSION,
    pid: process.pid,
    hostname: hostname(),
    nonce: randomUUID(),
    acquiredAt: new Date().toISOString(),
  };
  const deadline = Date.now() + timeoutMs;
  while (true) {
    try {
      await safeWriteFile(workspaceRoot, lockPath, `${JSON.stringify(owner)}\n`, { encoding: "utf8", flag: "wx" });
      await testHooks.afterLockWritten?.({ lockPath, owner: structuredClone(owner) });
      if (await confirmsLockOwnership(lockPath, owner.nonce)) break;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      if (await confirmsLockOwnership(lockPath, owner.nonce)) break;
      const reclaimed = await reclaimStaleLock(workspaceRoot, lockPath, malformedStaleMs, testHooks);
      if (reclaimed) continue;
    }
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for Cairn state lock after ${timeoutMs}ms`);
    await delay(Math.min(retryMs, Math.max(1, deadline - Date.now())));
  }

  try {
    return await operation();
  } finally {
    await releaseOwnedLock(lockPath, owner.nonce);
  }
}

async function reclaimStaleLock(root, lockPath, malformedStaleMs, testHooks) {
  let observed;
  let stat;
  try {
    [observed, stat] = await Promise.all([readFile(lockPath, "utf8"), lstat(lockPath)]);
  } catch (error) {
    if (error?.code === "ENOENT") return true;
    throw error;
  }
  if (stat.isSymbolicLink()) throw symlinkError(lockPath);
  const record = parseLockRecord(observed);
  if (record) {
    if (record.hostname !== hostname()) return false;
    if (pidIsAlive(record.pid)) return false;
  } else if (Date.now() - stat.mtimeMs <= malformedStaleMs) {
    return false;
  }

  await testHooks.afterStaleObserved?.({ lockPath, observed, record: record ? structuredClone(record) : null });
  const quarantine = safePath(root, `.cairn/state.lock.stale.${record?.nonce ?? "malformed"}.${randomUUID()}`);
  try {
    await rename(lockPath, quarantine);
  } catch (error) {
    if (error?.code === "ENOENT") return true;
    throw error;
  }
  const moved = await readFile(quarantine, "utf8");
  if (moved !== observed) {
    const restored = await restoreMovedCandidate(lockPath, quarantine);
    await testHooks.afterReclaimMismatch?.({ lockPath, restored });
    return false;
  }
  await rm(quarantine, { force: true });
  return true;
}

async function restoreMovedCandidate(lockPath, quarantine) {
  try {
    await link(quarantine, lockPath);
    await rm(quarantine);
    return true;
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    await rm(quarantine, { force: true });
    return false;
  }
}

async function confirmsLockOwnership(lockPath, nonce) {
  try {
    return parseLockRecord(await readFile(lockPath, "utf8"))?.nonce === nonce;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function releaseOwnedLock(lockPath, nonce) {
  try {
    const record = parseLockRecord(await readFile(lockPath, "utf8"));
    if (record?.nonce === nonce) await rm(lockPath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function parseLockRecord(text) {
  try {
    const value = JSON.parse(text);
    if (value?.schemaVersion !== LOCK_SCHEMA_VERSION) return null;
    if (!Number.isSafeInteger(value.pid) || value.pid <= 0) return null;
    if (typeof value.hostname !== "string" || value.hostname.length === 0) return null;
    if (typeof value.nonce !== "string" || value.nonce.length === 0) return null;
    if (typeof value.acquiredAt !== "string" || Number.isNaN(Date.parse(value.acquiredAt))) return null;
    return value;
  } catch {
    return null;
  }
}

function pidIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "EPERM") return true;
    if (error?.code === "ESRCH") return false;
    return true;
  }
}

async function rejectSymlink(path) {
  const stat = await lstat(path);
  if (stat.isSymbolicLink()) throw symlinkError(path);
}

function symlinkError(path) {
  const error = new Error(`Managed path must not contain a symbolic link: ${path}`);
  error.code = "CAIRN_SYMLINK";
  return error;
}

function delay(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}
