import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, rename, rm, rmdir, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { dirname } from "node:path";

export const DEFAULT_LIFECYCLE_LOCK_TIMEOUT_MS = 60_000;

export function createLifecycleLock({ lifecycleLockPath }) {
async function withLifecycleLock(operation, {
  timeoutMs = DEFAULT_LIFECYCLE_LOCK_TIMEOUT_MS,
  retryMs = 25,
  malformedStaleMs = 30_000,
  afterRelease,
} = {}) {
  await mkdir(dirname(lifecycleLockPath), { recursive: true });
  if (process.env.CAIRN_TEST_PRUNE_LOCK_PARENT_BEFORE_ACQUIRE === "1") await rmdir(dirname(lifecycleLockPath));
  const owner = { schemaVersion: 1, pid: process.pid, hostname: hostname(), nonce: randomUUID(), acquiredAt: new Date().toISOString() };
  const deadline = Date.now() + timeoutMs;
  let waitReported = false;
  while (true) {
    try {
      await writeFile(lifecycleLockPath, `${JSON.stringify(owner)}\n`, { flag: "wx" });
      if (process.env.CAIRN_TEST_REPLACE_LOCK_AFTER_ACQUIRE === "1") {
        await writeFile(lifecycleLockPath, `${JSON.stringify({ ...owner, nonce: randomUUID() })}\n`);
      }
      const acquired = parseLifecycleLock(await readFile(lifecycleLockPath, "utf8"));
      if (acquired?.nonce !== owner.nonce) throw new Error("Cairn lifecycle lock ownership changed after acquisition");
      if (process.env.CAIRN_TEST_HOLD_LOCK_STDIN === "1") {
        console.log("CAIRN_TEST_LOCK_ACQUIRED");
        await new Promise((resolvePromise) => process.stdin.once("data", resolvePromise));
      }
      break;
    } catch (error) {
      if (error?.code === "ENOENT") {
        if (Date.now() >= deadline) throw new Error(`Timed out waiting for Cairn lifecycle lock after ${timeoutMs}ms`);
        await mkdir(dirname(lifecycleLockPath), { recursive: true });
        continue;
      }
      if (error?.code !== "EEXIST") throw error;
      if (!waitReported && process.env.CAIRN_TEST_REPORT_LOCK_WAIT === "1") {
        console.log("CAIRN_TEST_LOCK_WAIT");
        waitReported = true;
      }
      if (await reclaimLifecycleLock(malformedStaleMs)) continue;
      if (Date.now() >= deadline) throw new Error(`Timed out waiting for Cairn lifecycle lock after ${timeoutMs}ms`);
      await delay(Math.min(retryMs, Math.max(1, deadline - Date.now())));
    }
  }
  let operationSucceeded = false;
  try {
    const result = await operation();
    operationSucceeded = true;
    return result;
  } finally {
    if (process.env.CAIRN_TEST_REPLACE_LOCK_BEFORE_RELEASE === "1") {
      await writeFile(lifecycleLockPath, `${JSON.stringify({ ...owner, nonce: randomUUID() })}\n`);
    }
    const released = await releaseLifecycleLock(owner);
    if (operationSucceeded && released && afterRelease) await afterRelease();
  }
}

async function releaseLifecycleLock(owner) {
  let current;
  try {
    current = parseLifecycleLock(await readFile(lifecycleLockPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
  if (current?.nonce !== owner.nonce) return false;
  const releasedPath = `${lifecycleLockPath}.released.${owner.nonce}`;
  try {
    await rename(lifecycleLockPath, releasedPath);
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
  const released = parseLifecycleLock(await readFile(releasedPath, "utf8"));
  if (released?.nonce !== owner.nonce) {
    if (!(await exists(lifecycleLockPath))) await rename(releasedPath, lifecycleLockPath);
    return false;
  }
  await rm(releasedPath, { force: true });
  return true;
}

async function reclaimLifecycleLock(malformedStaleMs) {
  let observed;
  let info;
  try {
    [observed, info] = await Promise.all([readFile(lifecycleLockPath, "utf8"), lstat(lifecycleLockPath)]);
  } catch (error) {
    if (error?.code === "ENOENT") return true;
    throw error;
  }
  if (info.isSymbolicLink()) throw new Error(`Lifecycle lock must not be a symlink: ${lifecycleLockPath}`);
  const record = parseLifecycleLock(observed);
  if (record) {
    if (record.hostname !== hostname() || pidIsAlive(record.pid)) return false;
  } else if (Date.now() - info.mtimeMs <= malformedStaleMs) return false;
  const quarantine = `${lifecycleLockPath}.stale.${record?.nonce ?? "malformed"}.${randomUUID()}`;
  try {
    await rename(lifecycleLockPath, quarantine);
  } catch (error) {
    if (error?.code === "ENOENT") return true;
    throw error;
  }
  if (await readFile(quarantine, "utf8") !== observed) {
    if (!(await exists(lifecycleLockPath))) await rename(quarantine, lifecycleLockPath);
    throw new Error("Cairn lifecycle lock ownership changed during stale recovery");
  }
  await rm(quarantine, { force: true });
  return true;
}

function parseLifecycleLock(text) {
  try {
    const value = JSON.parse(text);
    if (value?.schemaVersion !== 1 || !Number.isSafeInteger(value.pid) || value.pid <= 0
        || typeof value.hostname !== "string" || value.hostname.length === 0 || typeof value.nonce !== "string" || value.nonce.length === 0
        || typeof value.acquiredAt !== "string" || Number.isNaN(Date.parse(value.acquiredAt))) return null;
    return value;
  } catch { return null; }
}

function pidIsAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { return error?.code !== "ESRCH"; }
}

function delay(ms) { return new Promise((resolvePromise) => setTimeout(resolvePromise, ms)); }


  return { withLifecycleLock };

  async function exists(path) {
    try { await lstat(path); return true; }
    catch (error) { if (error?.code === "ENOENT") return false; throw error; }
  }
}
