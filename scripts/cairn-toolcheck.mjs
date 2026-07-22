#!/usr/bin/env node
import { accessSync, constants, realpathSync, statSync } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import { delimiter, isAbsolute, join, posix, relative, resolve, sep, win32 } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const DEFAULT_TIMEOUT_MS = 10_000;

if (isCliEntry()) {
  try {
    const options = parseCliArgs(process.argv.slice(2));
    const report = await createReport(options);

    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printReport(report);
    }

    if (report.install.refused || report.results.some((result) => !result.ok)) process.exitCode = 1;
  } catch (error) {
    console.error(`Cairn toolcheck error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}

export function parseCliArgs(args, cwd = process.cwd()) {
  let root = cwd;
  let install = false;
  let yes = false;
  let json = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--install") install = true;
    else if (argument === "--yes") yes = true;
    else if (argument === "--json") json = true;
    else if (argument === "--root") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--root requires a path");
      root = value;
      index += 1;
    } else if (argument.startsWith("--root=")) {
      const value = argument.slice("--root=".length);
      if (!value) throw new Error("--root requires a path");
      root = value;
    }
  }

  return { root: resolve(cwd, root), install, yes, json };
}

export async function createReport({
  root = process.cwd(),
  install = false,
  yes = false,
  runner = run,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  localChecker = localExecutableAvailable,
} = {}) {
  const resolvedRoot = resolve(root);
  const entries = await collectEntries(resolvedRoot);
  const detected = detectStacks(entries);
  const requirements = buildRequirements(detected, entries);
  const results = [];
  const installRefused = install && !yes;

  for (const requirement of requirements) {
    let check = inspectCommand(requirement, {
      root: resolvedRoot,
      runner,
      timeoutMs,
      localChecker,
    });
    let installed = false;
    let installDiagnostic = null;
    let installRefusal = null;

    if (!check.ok && install) {
      if (!yes) {
        installRefusal = "explicit-confirmation-required";
      } else if (!requirement.install) {
        installRefusal = "installer-unavailable";
      } else {
        installDiagnostic = execute(requirement.install.command, requirement.install.args, {
          root: resolvedRoot,
          runner,
          timeoutMs,
        });
        installed = installDiagnostic.status === 0;
        if (installed) {
          check = inspectCommand(requirement, {
            root: resolvedRoot,
            runner,
            timeoutMs,
            localChecker,
          });
        }
      }
    }

    results.push({
      name: requirement.name,
      reason: requirement.reason,
      ok: check.ok,
      availability: check.availability,
      source: check.source,
      candidate: check.candidate,
      check: check.diagnostic,
      installed,
      installCommand: requirement.install ? formatCommand(requirement.install) : null,
      installStatus: installDiagnostic?.status ?? null,
      install: {
        available: Boolean(requirement.install),
        unavailableReason: requirement.installUnavailableReason ?? null,
        requested: install,
        attempted: Boolean(installDiagnostic),
        refusal: installRefusal,
        diagnostic: installDiagnostic,
      },
    });
  }

  return {
    schemaVersion: 1,
    root: resolvedRoot,
    timeoutMs,
    detected,
    install: {
      requested: install,
      confirmed: install && yes,
      refused: installRefused,
      refusalReason: installRefused ? "--install requires the additional --yes confirmation flag" : null,
    },
    results,
  };
}

export async function collectEntries(base) {
  const output = [];
  async function walk(dir) {
    for (const entry of await readdir(dir)) {
      if ([".git", ".cairn", "node_modules", "vendor", "target", ".venv", "__pycache__"].includes(entry)) continue;
      const path = join(dir, entry);
      const relativePath = normalizePath(relative(base, path));
      if (relativePath === "test/fixtures" || relativePath.startsWith("test/fixtures/")) continue;
      const info = await lstat(path);
      if (info.isSymbolicLink()) continue;
      if (info.isDirectory()) await walk(path);
      else output.push(relativePath);
    }
  }
  await walk(base);
  return output;
}

export function detectStacks(paths) {
  const stacks = new Set();
  if (hasBasename(paths, "package.json")) stacks.add("javascript");
  if (hasBasename(paths, "tsconfig.json") || paths.some((path) => path.endsWith(".ts") || path.endsWith(".tsx"))) stacks.add("typescript");
  if (hasBasename(paths, "pyproject.toml") || paths.some((path) => path.endsWith(".py"))) stacks.add("python");
  if (hasBasename(paths, "composer.json") || paths.some((path) => path.endsWith(".php"))) stacks.add("php");
  if (hasBasename(paths, "pom.xml", "build.gradle", "build.gradle.kts") || paths.some((path) => path.endsWith(".java"))) stacks.add("java");
  if (paths.some((path) => path.endsWith(".kt") || path.endsWith(".kts"))) stacks.add("kotlin");
  if (hasBasename(paths, "Package.swift") || paths.some((path) => hasPathSegmentWithSuffix(path, ".xcodeproj", ".xcworkspace") || path.endsWith(".swift"))) stacks.add("swift");
  if (hasBasename(paths, "go.mod") || paths.some((path) => path.endsWith(".go"))) stacks.add("go");
  if (hasBasename(paths, "Cargo.toml") || paths.some((path) => path.endsWith(".rs"))) stacks.add("rust");
  return [...stacks];
}

export function buildRequirements(stacks, entries = [], _commandAvailable = commandOk, platform = process.platform) {
  const requirements = [];
  if (stacks.includes("javascript")) {
    requirements.push(unsafeReq("node", ["--version"], "JavaScript runtime for package scripts and CLI checks", "automatic runtime installation is unavailable"));
    const manager = packageManager(entries);
    requirements.push(unsafeReq(manager, ["--version"], `JavaScript package manager selected from ${packageManagerSource(entries)}`, "automatic package-manager installation is unavailable"));
  }
  if (stacks.includes("typescript")) {
    requirements.push(unsafeReq("typescript-language-server", ["--version"], "TypeScript LSP server", "automatic package installation is disabled without pinned package versions"));
    requirements.push(unsafeReq("tsc", ["--version"], "TypeScript compiler verification", "automatic package installation is disabled without pinned package versions"));
  }
  if (stacks.includes("python")) {
    requirements.push(unsafeReq("basedpyright", ["--version"], "Python LSP/type checker", "automatic Python package installation is disabled without pinned package versions"));
    requirements.push(unsafeReq("ruff", ["--version"], "Python lint and format checker", "automatic Python package installation is disabled without pinned package versions"));
  }
  if (stacks.includes("php")) {
    const composerProject = hasBasename(entries, "composer.json");
    requirements.push(req("php", ["--version"], "PHP runtime for Composer scripts and CLI checks"));
    if (composerProject) requirements.push(req("composer", ["--version"], "PHP package manager for project-local tool installation"));
    requirements.push(unsafeReq("phpactor", ["--version"], "PHP LSP server", "automatic Composer package installation is disabled without pinned package versions"));
    requirements.push(unsafeReq("phpstan", ["--version"], "PHP static analysis verification", "automatic Composer package installation is disabled without pinned package versions"));
    requirements.push(unsafeReq("php-cs-fixer", ["--version"], "PHP formatting verification", "automatic Composer package installation is disabled without pinned package versions"));
  }
  if (stacks.includes("java")) {
    addJvmRequirements(requirements);
    requirements.push(unsafeReq("jdtls", ["--version"], "Java LSP server", "checksum-free JDTLS latest downloads are disabled"));
    addJvmBuildToolRequirements(requirements, entries);
  }
  if (stacks.includes("kotlin")) {
    addJvmRequirements(requirements);
    requirements.push(req("kotlin-lsp.sh", ["--help"], "Kotlin LSP server"));
    requirements.push(req("kotlinc", ["-version"], "Kotlin compiler verification"));
    addJvmBuildToolRequirements(requirements, entries);
  }
  if (stacks.includes("swift")) {
    requirements.push(req("swift", ["--version"], "Swift toolchain for build and test commands"));
    requirements.push(req("sourcekit-lsp", ["--version"], "Swift LSP server"));
    if (entries.some((path) => hasPathSegmentWithSuffix(path, ".xcodeproj", ".xcworkspace"))) {
      requirements.push(req("xcodebuild", ["-version"], "Xcode build verification"));
    }
  }
  if (stacks.includes("go")) {
    requirements.push(unsafeReq("gopls", ["version"], "Go LSP server", "unpinned go install targets are disabled"));
    requirements.push(unsafeReq("golangci-lint", ["--version"], "Go lint verification", "unpinned go install targets are disabled"));
  }
  if (stacks.includes("rust")) {
    requirements.push(unsafeReq("rust-analyzer", ["--version"], "Rust LSP server", "automatic rustup changes are disabled without a pinned toolchain manifest"));
    requirements.push(unsafeReq("cargo", ["clippy", "--version"], "Rust clippy verification", "automatic rustup changes are disabled without a pinned toolchain manifest"));
  }
  return requirements;
}

export function addJvmRequirements(requirements) {
  if (!requirements.some((requirement) => requirement.name === "java")) {
    requirements.push(req("java", ["--version"], "JVM runtime for build and test commands"));
  }
  if (!requirements.some((requirement) => requirement.name === "javac")) {
    requirements.push(req("javac", ["--version"], "JVM compiler verification"));
  }
}

export function addJvmBuildToolRequirements(requirements, entries = []) {
  const gradleWindows = findBasename(entries, "gradlew.bat");
  const gradleUnix = findBasename(entries, "gradlew");
  if (gradleWindows) pushUnique(requirements, req(repositoryCommand(gradleWindows), ["--version"], "Gradle wrapper availability", null, { localOnly: true }));
  else if (gradleUnix) pushUnique(requirements, req(repositoryCommand(gradleUnix), ["--version"], "Gradle wrapper availability", null, { localOnly: true }));
  else if (hasBasename(entries, "build.gradle", "build.gradle.kts")) pushUnique(requirements, req("gradle", ["--version"], "Gradle availability"));
  const mavenWindows = findBasename(entries, "mvnw.cmd", "mvnw.bat");
  const mavenUnix = findBasename(entries, "mvnw");
  if (mavenWindows) pushUnique(requirements, req(repositoryCommand(mavenWindows), ["--version"], "Maven wrapper availability", null, { localOnly: true }));
  else if (mavenUnix) pushUnique(requirements, req(repositoryCommand(mavenUnix), ["--version"], "Maven wrapper availability", null, { localOnly: true }));
  else if (hasBasename(entries, "pom.xml")) pushUnique(requirements, req("mvn", ["--version"], "Maven availability"));
}

export function pushUnique(requirements, requirement) {
  if (!requirements.some((candidate) => candidate.name === requirement.name)) requirements.push(requirement);
}

// Kept for API compatibility. Callers may show these commands, but buildRequirements
// no longer attaches an unpinned command to an automatically executable requirement.
export function composerInstall(packages) {
  return { command: "composer", args: ["require", "--dev", ...packages] };
}

export function pythonInstall(uv, project, tool, platform = process.platform) {
  if (uv && project) return { command: "uv", args: ["add", "--dev", tool] };
  if (uv) return { command: "uv", args: ["tool", "install", tool] };
  if (platform === "win32") return { command: "py", args: ["-3", "-m", "pip", "install", "--user", tool] };
  return { command: "python3", args: ["-m", "pip", "install", "--user", tool] };
}

export function jdtlsInstall(_platform = process.platform) {
  return null;
}

export function req(command, args, reason, installCommand = null, options = {}) {
  return {
    name: command,
    command,
    args,
    reason,
    install: installCommand,
    installUnavailableReason: options.installUnavailableReason ?? null,
    localOnly: options.localOnly ?? false,
  };
}

export function unsafeReq(command, args, reason, installUnavailableReason) {
  return req(command, args, reason, null, { installUnavailableReason });
}

export function packageManager(entries = []) {
  return selectPackageManager(entries).manager;
}

export function packageManagerSource(entries = []) {
  const selected = selectPackageManager(entries);
  return selected.path ?? "the npm default (no lockfile found)";
}

export function installDev(pm, packages) {
  if (pm === "bun") return { command: "bun", args: ["add", "-d", ...packages] };
  if (pm === "pnpm") return { command: "pnpm", args: ["add", "-D", ...packages] };
  if (pm === "yarn") return { command: "yarn", args: ["add", "-D", ...packages] };
  return { command: "npm", args: ["install", "--save-dev", ...packages] };
}

export function inspectCommand(requirement, {
  root = process.cwd(),
  runner = run,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  localChecker = localExecutableAvailable,
} = {}) {
  const candidates = commandCandidates(requirement.command, root);
  const localOnly = requirement.localOnly || isRepositoryCommand(requirement.command, root);

  if (!localOnly) {
    const diagnostic = execute(requirement.command, requirement.args, { root, runner, timeoutMs });
    if (diagnostic.status === 0) {
      return {
        ok: true,
        availability: "verified",
        source: "system",
        candidate: requirement.command,
        diagnostic,
      };
    }

    for (const candidate of candidates.slice(1)) {
      if (localChecker(candidate)) {
        return {
          ok: true,
          availability: "discovered",
          source: "repository",
          candidate,
          diagnostic,
        };
      }
    }

    return {
      ok: false,
      availability: diagnostic.timedOut ? "timeout" : "missing",
      source: null,
      candidate: null,
      diagnostic,
    };
  }

  for (const candidate of repositoryCandidates(requirement.command, root)) {
    if (localChecker(candidate)) {
      return {
        ok: true,
        availability: "discovered",
        source: "repository",
        candidate,
        diagnostic: null,
      };
    }
  }

  return {
    ok: false,
    availability: "missing",
    source: null,
    candidate: null,
    diagnostic: null,
  };
}

export function commandOk(command, args, root = process.cwd(), runner = run) {
  return inspectCommand(req(command, args, "tool availability"), { root, runner }).ok;
}

export function commandCandidates(command, root = process.cwd(), platform = process.platform) {
  const candidates = isRepositoryCommand(command, root)
    ? repositoryCandidates(command, root)
    : [
        command,
        join(root, "node_modules", ".bin", command),
        join(root, "vendor", "bin", command),
        join(root, ".cairn", "tools", "bin", command),
      ];
  if (platform !== "win32") return [...new Set(candidates)];
  const extensions = [".cmd", ".bat", ".exe"];
  return [...new Set(candidates.flatMap((candidate) => hasWindowsExecutableExtension(candidate) ? [candidate] : [candidate, ...extensions.map((extension) => `${candidate}${extension}`)]))];
}

export function localExecutableAvailable(command, platform = process.platform) {
  try {
    const info = statSync(command);
    if (!info.isFile()) return false;
    accessSync(command, platform === "win32" ? constants.F_OK : constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function run(command, args, { cwd = process.cwd(), timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const startedAt = Date.now();
  const result = spawnSync(command, args, {
    cwd,
    stdio: "ignore",
    encoding: "utf8",
    shell: shouldUseShell(command),
    timeout: timeoutMs,
    env: safeEnvironment(cwd),
  });
  return { ...result, durationMs: Date.now() - startedAt };
}

export function shouldUseShell(command, platform = process.platform) {
  return platform === "win32" && /\.(cmd|bat)$/i.test(command);
}

function execute(command, args, { root, runner, timeoutMs }) {
  const startedAt = Date.now();
  try {
    const result = runner(command, args, { cwd: root, timeoutMs });
    return {
      status: Number.isInteger(result?.status) ? result.status : null,
      signal: result?.signal ?? null,
      errorCode: result?.error?.code ?? null,
      timedOut: result?.error?.code === "ETIMEDOUT",
      durationMs: Number.isFinite(result?.durationMs) ? result.durationMs : Date.now() - startedAt,
    };
  } catch (error) {
    return {
      status: null,
      signal: null,
      errorCode: error && typeof error === "object" && "code" in error ? String(error.code) : "RUNNER_ERROR",
      timedOut: false,
      durationMs: Date.now() - startedAt,
    };
  }
}

function repositoryCandidates(command, root) {
  const normalizedCommand = command.replace(/^\.\//, "");
  const direct = isAbsolute(command) ? command : resolve(root, normalizedCommand);
  return [...new Set([direct])];
}

function isRepositoryCommand(command, root) {
  if (/^(?:\.\.?[\\/])/.test(command)) return true;
  if (/^(?:gradlew|gradlew\.bat|mvnw|mvnw\.cmd|mvnw\.bat)$/i.test(command)) return true;
  return isAbsolute(command) && isWithin(root, command);
}

export function isWithin(root, candidate, platform = process.platform) {
  const pathApi = platform === "win32" ? win32 : posix;
  const path = pathApi.relative(pathApi.resolve(root), pathApi.resolve(candidate));
  return path === "" || (!pathApi.isAbsolute(path) && !path.startsWith(`..${pathApi.sep}`) && path !== "..");
}

function safeEnvironment(root) {
  const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === "path") ?? "PATH";
  const safePath = (process.env[pathKey] ?? "")
    .split(delimiter)
    .filter(Boolean)
    .filter((entry) => isAbsolute(entry) && !isWithin(root, entry))
    .join(delimiter);
  return { ...process.env, [pathKey]: safePath };
}

function printReport(report) {
  console.log(`Cairn toolcheck: ${report.root}`);
  console.log(`Detected stacks: ${report.detected.length > 0 ? report.detected.join(", ") : "none"}`);
  if (report.install.refused) console.log(`INSTALL REFUSED - ${report.install.refusalReason}`);
  for (const result of report.results) {
    const prefix = result.ok ? result.availability === "discovered" ? "DISCOVERED" : "OK" : "MISSING";
    const installedText = result.installed ? " installed" : "";
    console.log(`${prefix}${installedText} ${result.name} - ${result.reason}`);
    if (result.check?.timedOut) console.log(`  check timed out after ${result.check.durationMs}ms`);
    if (!result.ok && result.install.unavailableReason) console.log(`  install unavailable: ${result.install.unavailableReason}`);
    else if (!result.ok && result.installCommand) console.log(`  install: ${result.installCommand}`);
  }
}

function formatCommand(command) {
  return [command.command, ...command.args].join(" ");
}

function isCliEntry() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  }
}

function normalizePath(path) {
  return path.split(sep).join("/");
}

function pathBasename(path) {
  const normalized = normalizePath(path);
  return normalized.slice(normalized.lastIndexOf("/") + 1);
}

function hasBasename(paths, ...names) {
  const expected = new Set(names);
  return paths.some((path) => expected.has(pathBasename(path)));
}

function findBasename(paths, ...names) {
  const expected = new Set(names);
  return [...paths]
    .filter((path) => expected.has(pathBasename(path)))
    .sort(compareRepositoryPaths)[0] ?? null;
}

function hasPathSegmentWithSuffix(path, ...suffixes) {
  return normalizePath(path)
    .split("/")
    .some((segment) => suffixes.some((suffix) => segment.endsWith(suffix)));
}

function repositoryCommand(path) {
  const normalized = normalizePath(path);
  return normalized.startsWith("./") ? normalized : `./${normalized}`;
}

function selectPackageManager(entries) {
  const lockfiles = [
    { manager: "bun", names: new Set(["bun.lock", "bun.lockb"]), priority: 0 },
    { manager: "pnpm", names: new Set(["pnpm-lock.yaml"]), priority: 1 },
    { manager: "yarn", names: new Set(["yarn.lock"]), priority: 2 },
    { manager: "npm", names: new Set(["package-lock.json", "npm-shrinkwrap.json"]), priority: 3 },
  ];
  const candidates = [];

  for (const path of entries) {
    const normalized = normalizePath(path);
    const name = pathBasename(normalized);
    const match = lockfiles.find(({ names }) => names.has(name));
    if (!match) continue;
    candidates.push({
      manager: match.manager,
      path: normalized,
      depth: normalized.split("/").length - 1,
      priority: match.priority,
    });
  }

  candidates.sort((left, right) => left.depth - right.depth
    || left.priority - right.priority
    || left.path.localeCompare(right.path));
  return candidates[0] ?? { manager: "npm", path: null };
}

function compareRepositoryPaths(left, right) {
  const leftPath = normalizePath(left);
  const rightPath = normalizePath(right);
  const depth = leftPath.split("/").length - rightPath.split("/").length;
  return depth || leftPath.localeCompare(rightPath);
}

function hasWindowsExecutableExtension(command) {
  return /\.(cmd|bat|exe)$/i.test(command);
}
