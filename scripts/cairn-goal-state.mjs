import { randomUUID } from "node:crypto";
import { lstat, readFile, rename, rm } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { cairnHome, goalStateDirectory } from "./cairn-paths.mjs";
import { assertNoSymlinkComponents, safeMkdir, safeWriteFile, withStateLock } from "./cairn-safe-fs.mjs";
import { migrateState, validateState } from "./cairn-goal-state-validation.mjs";

export function goalStatePath(root = process.cwd()) {
  return join(goalStateDirectory(root), "state.json");
}

export async function readGoalState({ root = process.cwd() } = {}) {
  const state = await readCurrentGoalState(root);
  if (state) return state;
  return withGoalStateLock(root, () => readGoalStateUnlocked(root));
}

export async function writeGoalState({ root = process.cwd(), state } = {}) {
  return withGoalStateLock(root, () => writeGoalStateUnlocked({ root, state }));
}

export async function writeGoalStateUnlocked({ root = process.cwd(), state } = {}) {
  const validated = validateState(state);
  const path = goalStatePath(root);
  await ensureGoalStateDirectory(root);
  await assertNoSymlinkComponents(cairnHome(), path);
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await safeWriteFile(cairnHome(), temporaryPath, `${JSON.stringify(validated, null, 2)}\n`, "utf8");
    await rename(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
}

export async function readGoalStateUnlocked(root) {
  return await readCurrentGoalState(root) ?? migrateLegacyGoalState(root);
}

async function readCurrentGoalState(root) {
  try {
    const path = goalStatePath(root);
    await assertNoSymlinkComponents(cairnHome(), path);
    return validateState(migrateState(JSON.parse(await readFile(path, "utf8"))));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    if (error instanceof SyntaxError) throw new Error(`Cairn goal state is invalid JSON: ${error.message}`);
    throw error;
  }
}

async function migrateLegacyGoalState(root) {
  const legacyPath = join(resolve(root), ".cairn", "state.json");
  try {
    await assertNoSymlinkComponents(root, legacyPath, { allowMissing: false });
    const state = validateState(migrateState(JSON.parse(await readFile(legacyPath, "utf8"))));
    await writeGoalStateUnlocked({ root, state });
    await rm(legacyPath);
    return state;
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    if (error instanceof SyntaxError) throw new Error(`Cairn goal state is invalid JSON: ${error.message}`);
    throw error;
  }
}

export async function withGoalStateLock(root, operation) {
  await ensureGoalStateDirectory(root);
  return withStateLock(goalStateDirectory(root), operation);
}

async function ensureGoalStateDirectory(root) {
  const home = cairnHome();
  let existingAncestor = home;
  while (true) {
    try {
      const stat = await lstat(existingAncestor);
      if (!stat.isDirectory()) throw new Error(`Cairn home ancestor is not a directory: ${existingAncestor}`);
      break;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const parent = dirname(existingAncestor);
      if (parent === existingAncestor) throw error;
      existingAncestor = parent;
    }
  }
  await safeMkdir(existingAncestor, relative(existingAncestor, goalStateDirectory(root)));
}
