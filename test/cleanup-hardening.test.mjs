import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { once } from "node:events";
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { cleanupProjectCairn } from "../scripts/cairn-cleanup.mjs";

const cleanupScript = resolve("scripts/cairn-cleanup.mjs");
const ownedStaleLock = "state.lock.stale.owner.123e4567-e89b-42d3-a456-426614174000";
const malformedStaleLock = "state.lock.stale.malformed.123e4567-e89b-42d3-a456-426614174001";

async function withTempRoot(operation) {
  const root = await mkdtemp(join(tmpdir(), "cairn-cleanup-hardening-"));
  try {
    await operation(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function snapshotTree(root) {
  const snapshot = {};
  async function visit(directory, prefix = "") {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const relativePath = join(prefix, entry.name);
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        snapshot[`${relativePath}/`] = "directory";
        await visit(path, relativePath);
      } else {
        snapshot[relativePath] = (await readFile(path)).toString("base64");
      }
    }
  }
  await visit(root);
  return snapshot;
}

function runCleanup(root, apply) {
  return spawnSync(process.execPath, [cleanupScript, "--root", root, ...(apply ? ["--yes"] : [])], {
    encoding: "utf8",
  });
}

for (const [label, apply] of [["dry-run", false], ["--yes", true]]) {
  test(`cleanup rejects a symlinked .cairn root before traversal in ${label}`, async () => {
    await withTempRoot(async (sandbox) => {
      // Given
      const root = join(sandbox, "repo");
      const outside = join(sandbox, "outside");
      await mkdir(join(outside, "tools"), { recursive: true });
      await mkdir(root);
      await writeFile(join(outside, "state.lock"), Buffer.from([0, 1, 2, 255]));
      await writeFile(join(outside, "tools", "binary"), Buffer.from([255, 2, 1, 0]));
      await symlink(outside, join(root, ".cairn"));
      const before = await snapshotTree(outside);

      // When
      const result = runCleanup(root, apply);

      // Then
      assert.notEqual(result.status, 0, result.stdout);
      assert.match(result.stderr, /symbolic link/i);
      assert.deepEqual(await snapshotTree(outside), before);
    });
  });

  test(`cleanup rejects a dangling .cairn root in ${label}`, async () => {
    await withTempRoot(async (root) => {
      // Given
      await symlink(join(root, "missing-outside"), join(root, ".cairn"));

      // When
      const result = runCleanup(root, apply);

      // Then
      assert.notEqual(result.status, 0, result.stdout);
      assert.match(result.stderr, /symbolic link/i);
      assert.equal((await lstat(join(root, ".cairn"))).isSymbolicLink(), true);
    });
  });

  test(`cleanup rejects a non-directory .cairn root in ${label}`, async () => {
    await withTempRoot(async (root) => {
      // Given
      await writeFile(join(root, ".cairn"), "unrelated bytes\n");

      // When
      const result = runCleanup(root, apply);

      // Then
      assert.notEqual(result.status, 0, result.stdout);
      assert.match(result.stderr, /Legacy Cairn root is not a directory/);
      assert.equal(await readFile(join(root, ".cairn"), "utf8"), "unrelated bytes\n");
    });
  });

  test(`cleanup rejects a socket .cairn root before traversal in ${label}`, { skip: process.platform === "win32" }, async () => {
    await withTempRoot(async (root) => {
      // Given
      const socketPath = join(root, ".cairn");
      const server = createServer();
      server.listen(socketPath);
      await once(server, "listening");
      try {
        // When
        const result = runCleanup(root, apply);

        // Then
        assert.notEqual(result.status, 0, result.stdout);
        assert.match(result.stderr, /Legacy Cairn root is not a directory/);
        assert.equal((await lstat(socketPath)).isSocket(), true);
      } finally {
        const closed = once(server, "close");
        server.close();
        await closed;
      }
    });
  });
}

test("cleanup preserves unrelated stale-prefix files, directories, and symlinks", async () => {
  await withTempRoot(async (sandbox) => {
    // Given
    const root = join(sandbox, "repo");
    const outside = join(sandbox, "outside.txt");
    const unrelatedDirectory = "state.lock.stale.user-directory.123e4567-e89b-42d3-a456-426614174002";
    const unrelatedSymlink = "state.lock.stale.link.123e4567-e89b-42d3-a456-426614174003";
    await mkdir(join(root, ".cairn", unrelatedDirectory), { recursive: true });
    await writeFile(join(root, ".cairn", "state.lock.stale.notes"), "keep file\n");
    await writeFile(join(root, ".cairn", unrelatedDirectory, "keep.txt"), "keep directory\n");
    await writeFile(outside, "keep target\n");
    await symlink(outside, join(root, ".cairn", unrelatedSymlink));

    // When
    const result = await cleanupProjectCairn({ root, apply: true });

    // Then
    assert.deepEqual(result.known, []);
    assert.deepEqual(result.unknown, [unrelatedSymlink, "state.lock.stale.notes", unrelatedDirectory].sort());
    assert.equal(await readFile(join(root, ".cairn", "state.lock.stale.notes"), "utf8"), "keep file\n");
    assert.equal(await readFile(join(root, ".cairn", unrelatedDirectory, "keep.txt"), "utf8"), "keep directory\n");
    assert.equal((await lstat(join(root, ".cairn", unrelatedSymlink))).isSymbolicLink(), true);
    assert.equal(await readFile(outside, "utf8"), "keep target\n");
  });
});

test("cleanup preserves reserved names whose filesystem types are not Cairn-owned", async () => {
  await withTempRoot(async (root) => {
    // Given
    await mkdir(join(root, ".cairn", "state.json"), { recursive: true });
    await mkdir(join(root, ".cairn", "state.lock"));
    await writeFile(join(root, ".cairn", "tools"), "user file\n");

    // When
    const result = await cleanupProjectCairn({ root, apply: true });

    // Then
    assert.deepEqual(result.known, []);
    assert.deepEqual(result.unknown, ["state.json", "state.lock", "tools"]);
    assert.equal((await lstat(join(root, ".cairn", "state.json"))).isDirectory(), true);
    assert.equal((await lstat(join(root, ".cairn", "state.lock"))).isDirectory(), true);
    assert.equal(await readFile(join(root, ".cairn", "tools"), "utf8"), "user file\n");
  });
});

test("cleanup removes known legacy entries with their owned filesystem types", async () => {
  await withTempRoot(async (root) => {
    // Given
    await mkdir(join(root, ".cairn", "tools", "bin"), { recursive: true });
    await writeFile(join(root, ".cairn", "state.lock"), "legacy lock\n");
    await writeFile(join(root, ".cairn", "tools", "bin", "tool"), "legacy tool\n");
    await writeFile(join(root, ".cairn", ownedStaleLock), "stale lock\n");
    await writeFile(join(root, ".cairn", malformedStaleLock), "malformed stale lock\n");

    // When
    const result = await cleanupProjectCairn({ root, apply: true });

    // Then
    assert.deepEqual(result.removed, [malformedStaleLock, "state.lock", ownedStaleLock, "tools"].sort());
    assert.equal(result.projectDirectoryRemoved, true);
    await assert.rejects(lstat(join(root, ".cairn")), { code: "ENOENT" });
  });
});
