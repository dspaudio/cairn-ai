#!/usr/bin/env node
import { lstat, readdir, rm, rmdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { reconcileWorktreeState } from "./cairn-goal.mjs";
import { parseRootArgs } from "./cairn-paths.mjs";

const staleLockName = /^state\.lock\.stale\..+\.[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export async function cleanupProjectCairn({ root = process.cwd(), apply = false } = {}) {
  const repoRoot = resolve(root);
  const legacyRoot = join(repoRoot, ".cairn");
  let rootStat;
  try {
    rootStat = await lstat(legacyRoot);
  } catch (error) {
    if (error?.code === "ENOENT") return { root: repoRoot, apply, known: [], unknown: [], removed: [], projectDirectoryRemoved: false };
    throw error;
  }
  if (rootStat.isSymbolicLink()) throw new Error(`Legacy Cairn root must not be a symbolic link: ${legacyRoot}`);
  if (!rootStat.isDirectory()) throw new Error(`Legacy Cairn root is not a directory: ${legacyRoot}`);

  const entries = await readdir(legacyRoot, { withFileTypes: true });
  const known = [];
  const unknown = [];
  for (const entry of entries) {
    const isKnownFile = entry.isFile() && (entry.name === "state.json" || entry.name === "state.lock" || staleLockName.test(entry.name));
    const isKnownDirectory = entry.isDirectory() && entry.name === "tools";
    (isKnownFile || isKnownDirectory ? known : unknown).push(entry.name);
  }
  if (!apply) return { root: repoRoot, apply, known: known.sort(), unknown: unknown.sort(), removed: [], projectDirectoryRemoved: false };

  if (known.includes("state.json")) await reconcileWorktreeState({ root: repoRoot });
  const removed = [];
  for (const name of known) {
    const path = join(legacyRoot, name);
    try {
      const stat = await lstat(path);
      const expectedType = name === "tools" ? stat.isDirectory() : stat.isFile();
      if (!expectedType) continue;
      await rm(path, { recursive: name === "tools", force: true });
      removed.push(name);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  let projectDirectoryRemoved = false;
  try {
    await rmdir(legacyRoot);
    projectDirectoryRemoved = true;
  } catch (error) {
    if (!["ENOENT", "ENOTEMPTY", "EEXIST"].includes(error?.code)) throw error;
  }
  return { root: repoRoot, apply, known: known.sort(), unknown: unknown.sort(), removed: removed.sort(), projectDirectoryRemoved };
}

async function main() {
  const { args, repoRoot } = parseRootArgs(process.argv.slice(2));
  const apply = args.includes("--yes");
  const unsupported = args.filter((value) => value !== "--yes" && value !== "--check");
  if (unsupported.length > 0) throw new Error(`Unknown cleanup option: ${unsupported[0]}`);
  console.log(JSON.stringify(await cleanupProjectCairn({ root: repoRoot, apply }), null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
