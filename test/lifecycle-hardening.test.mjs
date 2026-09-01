import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const root = resolve(".");
const lifecycleScript = join(root, "scripts", "cairn-lifecycle.mjs");

for (const fixture of [
  { name: "Codex", ancestor: (env) => join(env.CODEX_HOME, "plugins", "cache", "cairn", "plugins") },
  { name: "Claude", ancestor: (env) => join(env.CLAUDE_HOME, "commands") },
  { name: "Antigravity", ancestor: (env) => join(env.ANTIGRAVITY_HOME, "skills") },
]) {
  test(`install rejects a ${fixture.name} descendant ancestor symlink without outside writes`, async () => {
    // Given
    await withHome(async ({ env, outside }) => {
      const ancestor = fixture.ancestor(env);
      await mkdir(dirname(ancestor), { recursive: true });
      await symlink(outside, ancestor);

      // When
      const result = run(["install"], env);

      // Then
      assert.equal(result.status, 1);
      assert.match(result.stderr, /ancestor must not be a symlink/);
      assert.deepEqual(await readdir(outside), []);
    });
  });
}

test("install rejects every trailing argument before lock or stage mutation", async () => {
  // Given
  await withHome(async ({ env, paths }) => {
    for (const args of [["install", "--dry-run", "--unknown"], ["install", "unexpected"], ["upgrade", "unexpected"], ["doctor", "unexpected"], ["uninstall", "unexpected"], ["help", "unexpected"]]) {
      // When
      const result = run(args, env);

      // Then
      assert.equal(result.status, 1, `${args.join(" ")}\n${result.stderr}`);
      assert.match(result.stderr, /does not accept arguments/);
      await assert.rejects(stat(paths.marketplace));
    }
  });
});

test("invalid lifecycle lock timeouts fail within a bounded interval before mutation", async () => {
  // Given
  await withHome(async ({ env, paths }) => {
    for (const timeout of ["NaN", "0", "-1", "Infinity", "9007199254740992"]) {
      // When
      const startedAt = Date.now();
      const result = run(["install"], { ...env, CAIRN_LIFECYCLE_LOCK_TIMEOUT_MS: timeout });
      const elapsedMs = Date.now() - startedAt;

      // Then
      assert.equal(result.status, 1, `${timeout}\n${result.stderr}`);
      assert.match(result.stderr, /CAIRN_LIFECYCLE_LOCK_TIMEOUT_MS must be an integer between 1 and 2147483647/);
      assert.ok(elapsedMs < 2_000, `${timeout} took ${elapsedMs}ms`);
      await assert.rejects(stat(paths.marketplace));
    }
  });
});

test("the next lifecycle run removes a crashed transaction owned stage", async () => {
  // Given
  await withHome(async ({ env, paths }) => {
    const crashed = run(["install"], { ...env, CAIRN_TEST_CRASH_AFTER_STAGE: "1" });
    assert.equal(crashed.status, 87, crashed.stderr);
    const journal = JSON.parse(await readFile(paths.transaction, "utf8"));
    const transactionDirectory = join(paths.transactions, journal.id);
    await stat(join(transactionDirectory, "stage"));

    // When
    const recovered = run(["install"], env);

    // Then
    assert.equal(recovered.status, 0, recovered.stderr);
    await assert.rejects(stat(transactionDirectory));
    await assert.rejects(stat(paths.transaction));
  });
});

test("upgrade fails closed when a managed digest changes after preflight", async () => {
  // Given
  await withHome(async ({ env, paths }) => {
    assert.equal(run(["install"], env).status, 0);
    const target = join(env.CLAUDE_HOME, "commands", "cairn-plan.md");

    // When
    const raced = run(["upgrade"], {
      ...env,
      CAIRN_TEST_MUTATE_AFTER_PREFLIGHT_ID: "claude-command-plan",
      CAIRN_TEST_MUTATION_CONTENT: "concurrent mutation\n",
    });

    // Then
    assert.equal(raced.status, 1, raced.stderr);
    assert.match(raced.stderr, /changed after lifecycle preflight/);
    assert.equal(await readFile(target, "utf8"), "concurrent mutation\n");
    await assert.rejects(stat(paths.transaction));
  });
});

test("an EXDEV staging rename fails without a partial target and restores prior ownership", async () => {
  // Given
  await withHome(async ({ env, paths }) => {
    assert.equal(run(["install"], env).status, 0);
    const target = join(env.CLAUDE_HOME, "commands", "cairn-plan.md");
    const before = await readFile(target, "utf8");
    const ownershipBefore = await readFile(paths.ownership, "utf8");

    // When
    const result = run(["upgrade"], { ...env, CAIRN_TEST_FORCE_EXDEV_ID: "claude-command-plan" });

    // Then
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /Cross-device replacement is not supported safely/);
    assert.equal(await readFile(target, "utf8"), before);
    assert.equal(await readFile(paths.ownership, "utf8"), ownershipBefore);
    await assert.rejects(stat(paths.transaction));
    assert.deepEqual(await readdir(paths.transactions), []);
  });
});

async function withHome(runTest) {
  const temp = await mkdtemp(join(tmpdir(), "cairn-hardening-"));
  const env = {
    ...process.env,
    HOME: join(temp, "home"),
    CODEX_HOME: join(temp, "codex"),
    CLAUDE_HOME: join(temp, "claude"),
    ANTIGRAVITY_HOME: join(temp, "gemini", "config"),
    ANTIGRAVITY_CLI_HOME: join(temp, "gemini", "antigravity-cli"),
    CAIRN_LEGACY_ANTIGRAVITY_HOME: join(temp, "legacy-agents"),
    CODEX_CONFIG_PATH: join(temp, "codex", "config.toml"),
  };
  const marketplace = join(env.CODEX_HOME, "plugins", "cache", "cairn");
  const paths = {
    marketplace,
    ownership: join(marketplace, ".cairn", "lifecycle.json"),
    transaction: join(marketplace, ".cairn", "transaction.json"),
    transactions: join(marketplace, ".cairn", "transactions"),
  };
  const outside = join(temp, "outside");
  await mkdir(outside);
  await writeFile(join(temp, "fixture-marker"), "fixture\n");
  try {
    await runTest({ env, outside, paths });
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

function run(args, env) {
  return spawnSync(process.execPath, [lifecycleScript, ...args], { cwd: root, env, encoding: "utf8", timeout: 60_000 });
}
