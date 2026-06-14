import test from "node:test";
import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import {
  buildRequirements,
  commandCandidates,
  collectEntries,
  createReport,
  detectStacks,
  jdtlsInstall,
  packageManager,
  pythonInstall,
  shouldUseShell,
} from "../scripts/cairn-toolcheck.mjs";

const fixtures = resolve("test", "fixtures", "toolcheck");

test("collectEntries and detectStacks identify supported repository stacks", async () => {
  const entries = await collectEntries(join(fixtures, "polyglot"));
  const detected = detectStacks(entries);

  assert.deepEqual(detected, [
    "javascript",
    "typescript",
    "python",
    "php",
    "java",
    "kotlin",
    "swift",
    "go",
    "rust",
  ]);
});

test("buildRequirements chooses repository-native install commands", () => {
  const entries = ["package.json", "pnpm-lock.yaml", "tsconfig.json", "pyproject.toml", "composer.json"];
  const requirements = buildRequirements(["typescript", "python", "php"], entries, (command) => command === "uv");
  const byName = Object.fromEntries(requirements.map((requirement) => [requirement.name, requirement]));

  assert.equal(packageManager(entries), "pnpm");
  assert.deepEqual(byName["typescript-language-server"].install, {
    command: "pnpm",
    args: ["add", "-D", "typescript", "typescript-language-server"],
  });
  assert.deepEqual(byName.basedpyright.install, {
    command: "uv",
    args: ["add", "--dev", "basedpyright"],
  });
  assert.deepEqual(byName.phpactor.install, {
    command: "composer",
    args: ["require", "--dev", "phpactor/phpactor", "phpstan/phpstan", "friendsofphp/php-cs-fixer"],
  });
});

test("buildRequirements uses Windows-native install commands when requested", () => {
  const requirements = buildRequirements(["python", "java"], ["pyproject.toml"], () => false, "win32");
  const byName = Object.fromEntries(requirements.map((requirement) => [requirement.name, requirement]));

  assert.deepEqual(pythonInstall(false, true, "ruff", "win32"), {
    command: "py",
    args: ["-3", "-m", "pip", "install", "--user", "ruff"],
  });
  assert.equal(byName.basedpyright.install.command, "py");
  assert.equal(byName.jdtls.install.command, "powershell");
  assert.equal(jdtlsInstall("linux").command, "bash");
});

test("commandCandidates includes Windows executable shims for local bins", () => {
  const root = "C:\\repo";
  const candidates = commandCandidates("tsc", root, "win32");

  assert.ok(candidates.includes(join(root, "node_modules", ".bin", "tsc.cmd")));
  assert.ok(candidates.includes(join(root, "vendor", "bin", "tsc.bat")));
  assert.ok(candidates.includes("tsc.exe"));
  assert.equal(shouldUseShell(join(root, "node_modules", ".bin", "tsc.cmd"), "win32"), true);
  assert.equal(shouldUseShell(join(root, "node_modules", ".bin", "tsc"), "win32"), false);
  assert.equal(shouldUseShell(join(root, "node_modules", ".bin", "tsc.cmd"), "linux"), false);
});

test("createReport reports command status without installing by default", async () => {
  const calls = [];
  const report = await createReport({
    root: join(fixtures, "javascript"),
    runner(command, args) {
      calls.push([command, ...args].join(" "));
      return { status: command === "node" ? 0 : 1 };
    },
  });

  assert.deepEqual(report.detected, ["javascript"]);
  assert.equal(report.results.length, 1);
  assert.equal(report.results[0].name, "node");
  assert.equal(report.results[0].ok, true);
  assert.equal(report.results[0].installed, false);
  assert.deepEqual(calls, ["node --version"]);
});
