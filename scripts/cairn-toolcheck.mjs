#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

if (isCliEntry()) {
  const root = process.cwd();
  const install = process.argv.includes("--install");
  const json = process.argv.includes("--json");
  const report = await createReport({ root, install });

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Cairn toolcheck: ${report.root}`);
    console.log(`Detected stacks: ${report.detected.length > 0 ? report.detected.join(", ") : "none"}`);
    for (const result of report.results) {
      const prefix = result.ok ? "OK" : "MISSING";
      const installedText = result.installed ? " installed" : "";
      console.log(`${prefix}${installedText} ${result.name} - ${result.reason}`);
      if (!result.ok && result.installCommand) console.log(`  install: ${result.installCommand}`);
    }
  }

  if (report.results.some((result) => !result.ok)) process.exitCode = 1;
}

export async function createReport({ root = process.cwd(), install = false, runner = run } = {}) {
  const entries = await collectEntries(root);
  const detected = detectStacks(entries);
  const requirements = buildRequirements(detected, entries, (command, args) => commandOk(command, args, root, runner));
  const results = [];

  for (const requirement of requirements) {
    let ok = commandOk(requirement.command, requirement.args, root, runner);
    let installed = false;
    let installResult = null;
    if (!ok && install && requirement.install) {
      installResult = runner(requirement.install.command, requirement.install.args);
      installed = installResult.status === 0;
      ok = commandOk(requirement.command, requirement.args, root, runner);
    }
    results.push({
      name: requirement.name,
      reason: requirement.reason,
      ok,
      installed,
      installCommand: requirement.install ? [requirement.install.command, ...requirement.install.args].join(" ") : null,
      installStatus: installResult?.status ?? null,
    });
  }

  return { root, detected, results };
}

export async function collectEntries(base) {
  const output = [];
  async function walk(dir) {
    for (const entry of await readdir(dir)) {
      if ([".git", ".cairn", "node_modules", "vendor", "target", ".venv", "__pycache__"].includes(entry)) continue;
      const path = join(dir, entry);
      const relativePath = normalizePath(relative(base, path));
      if (relativePath === "test/fixtures" || relativePath.startsWith("test/fixtures/")) continue;
      const info = await stat(path);
      if (info.isDirectory()) await walk(path);
      else output.push(relativePath);
    }
  }
  await walk(base);
  return output;
}

export function detectStacks(paths) {
  const stacks = new Set();
  if (paths.some((path) => path === "package.json")) stacks.add("javascript");
  if (paths.some((path) => path === "tsconfig.json" || path.endsWith(".ts") || path.endsWith(".tsx"))) stacks.add("typescript");
  if (paths.some((path) => path === "pyproject.toml" || path.endsWith(".py"))) stacks.add("python");
  if (paths.some((path) => path === "composer.json" || path.endsWith(".php"))) stacks.add("php");
  if (paths.some((path) => path === "pom.xml" || path === "build.gradle" || path.endsWith(".java"))) stacks.add("java");
  if (paths.some((path) => path.endsWith(".kt") || path.endsWith(".kts"))) stacks.add("kotlin");
  if (paths.some((path) => path === "Package.swift" || path.endsWith(".xcodeproj") || path.endsWith(".xcworkspace") || path.endsWith(".swift"))) stacks.add("swift");
  if (paths.some((path) => path === "go.mod" || path.endsWith(".go"))) stacks.add("go");
  if (paths.some((path) => path === "Cargo.toml" || path.endsWith(".rs"))) stacks.add("rust");
  return [...stacks];
}

export function buildRequirements(stacks, entries = [], commandAvailable = commandOk, platform = process.platform) {
  const requirements = [];
  if (stacks.includes("javascript")) {
    requirements.push(req("node", ["--version"], "JavaScript runtime for package scripts and CLI checks"));
  }
  if (stacks.includes("typescript")) {
    const pm = packageManager(entries);
    requirements.push(req("typescript-language-server", ["--version"], "TypeScript LSP server", installDev(pm, ["typescript", "typescript-language-server"])));
    requirements.push(req("tsc", ["--version"], "TypeScript compiler verification", installDev(pm, ["typescript"])));
  }
  if (stacks.includes("python")) {
    const uv = commandAvailable("uv", ["--version"]);
    const project = entries.includes("pyproject.toml");
    const basedpyrightInstall = pythonInstall(uv, project, "basedpyright", platform);
    const ruffInstall = pythonInstall(uv, project, "ruff", platform);
    requirements.push(req("basedpyright", ["--version"], "Python LSP/type checker", basedpyrightInstall));
    requirements.push(req("ruff", ["--version"], "Python lint and format checker", ruffInstall));
  }
  if (stacks.includes("php")) {
    const composerProject = entries.includes("composer.json");
    const composerTools = ["phpactor/phpactor", "phpstan/phpstan", "friendsofphp/php-cs-fixer"];
    requirements.push(req("php", ["--version"], "PHP runtime for Composer scripts and CLI checks"));
    if (composerProject) requirements.push(req("composer", ["--version"], "PHP package manager for project-local tool installation"));
    requirements.push(req("phpactor", ["--version"], "PHP LSP server", composerProject ? composerInstall(composerTools) : null));
    requirements.push(req("phpstan", ["--version"], "PHP static analysis verification", composerProject ? composerInstall(composerTools) : null));
    requirements.push(req("php-cs-fixer", ["--version"], "PHP formatting verification", composerProject ? composerInstall(composerTools) : null));
  }
  if (stacks.includes("java")) {
    addJvmRequirements(requirements);
    requirements.push(req("jdtls", ["--version"], "Java LSP server", jdtlsInstall(platform)));
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
    if (entries.some((path) => path.endsWith(".xcodeproj") || path.endsWith(".xcworkspace"))) {
      requirements.push(req("xcodebuild", ["-version"], "Xcode build verification"));
    }
  }
  if (stacks.includes("go")) {
    requirements.push(req("gopls", ["version"], "Go LSP server", { command: "go", args: ["install", "golang.org/x/tools/gopls@latest"] }));
    requirements.push(req("golangci-lint", ["--version"], "Go lint verification", { command: "go", args: ["install", "github.com/golangci/golangci-lint/v2/cmd/golangci-lint@latest"] }));
  }
  if (stacks.includes("rust")) {
    requirements.push(req("rust-analyzer", ["--version"], "Rust LSP server", { command: "rustup", args: ["component", "add", "rust-analyzer"] }));
    requirements.push(req("cargo", ["clippy", "--version"], "Rust clippy verification", { command: "rustup", args: ["component", "add", "clippy"] }));
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
  if (entries.includes("gradlew.bat")) pushUnique(requirements, req("gradlew.bat", ["--version"], "Gradle wrapper availability"));
  else if (entries.includes("gradlew")) pushUnique(requirements, req("./gradlew", ["--version"], "Gradle wrapper availability"));
  else if (entries.includes("build.gradle") || entries.includes("build.gradle.kts")) pushUnique(requirements, req("gradle", ["--version"], "Gradle availability"));
  if (entries.includes("mvnw.cmd")) pushUnique(requirements, req("mvnw.cmd", ["--version"], "Maven wrapper availability"));
  else if (entries.includes("mvnw.bat")) pushUnique(requirements, req("mvnw.bat", ["--version"], "Maven wrapper availability"));
  else if (entries.includes("mvnw")) pushUnique(requirements, req("./mvnw", ["--version"], "Maven wrapper availability"));
  else if (entries.includes("pom.xml")) pushUnique(requirements, req("mvn", ["--version"], "Maven availability"));
}

export function pushUnique(requirements, requirement) {
  if (!requirements.some((candidate) => candidate.name === requirement.name)) requirements.push(requirement);
}

export function composerInstall(packages) {
  return { command: "composer", args: ["require", "--dev", ...packages] };
}

export function pythonInstall(uv, project, tool, platform = process.platform) {
  if (uv && project) return { command: "uv", args: ["add", "--dev", tool] };
  if (uv) return { command: "uv", args: ["tool", "install", tool] };
  if (platform === "win32") return { command: "py", args: ["-3", "-m", "pip", "install", "--user", tool] };
  return { command: "python3", args: ["-m", "pip", "install", "--user", tool] };
}

export function jdtlsInstall(platform = process.platform) {
  const url = "https://download.eclipse.org/jdtls/milestones/latest/jdt-language-server-latest.tar.gz";
  if (platform === "win32") {
    return {
      command: "powershell",
      args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", `New-Item -ItemType Directory -Force .cairn/tools | Out-Null; Invoke-WebRequest -Uri ${url} -OutFile .cairn/tools/jdtls.tar.gz; tar -xzf .cairn/tools/jdtls.tar.gz -C .cairn/tools`],
    };
  }
  return { command: "bash", args: ["-lc", `mkdir -p .cairn/tools && curl -L ${url} | tar -xz -C .cairn/tools`] };
}

export function req(command, args, reason, installCommand = null) {
  return { name: command, command, args, reason, install: installCommand };
}

export function packageManager(entries = []) {
  if (entries.includes("bun.lockb") || entries.includes("bun.lock")) return "bun";
  if (entries.includes("pnpm-lock.yaml")) return "pnpm";
  if (entries.includes("yarn.lock")) return "yarn";
  return "npm";
}

export function installDev(pm, packages) {
  if (pm === "bun") return { command: "bun", args: ["add", "-d", ...packages] };
  if (pm === "pnpm") return { command: "pnpm", args: ["add", "-D", ...packages] };
  if (pm === "yarn") return { command: "yarn", args: ["add", "-D", ...packages] };
  return { command: "npm", args: ["install", "--save-dev", ...packages] };
}

export function commandOk(command, args, root = process.cwd(), runner = run) {
  return commandCandidates(command, root).some((candidate) => runner(candidate, args).status === 0);
}

export function commandCandidates(command, root = process.cwd(), platform = process.platform) {
  const candidates = [
    command,
    join(root, "node_modules", ".bin", command),
    join(root, "vendor", "bin", command),
    join(root, ".cairn", "tools", "bin", command),
  ];
  if (platform !== "win32") return candidates;
  const extensions = [".cmd", ".bat", ".exe"];
  return candidates.flatMap((candidate) => hasWindowsExecutableExtension(candidate) ? [candidate] : [candidate, ...extensions.map((extension) => `${candidate}${extension}`)]);
}

export function run(command, args) {
  return spawnSync(command, args, {
    stdio: "ignore",
    encoding: "utf8",
    shell: shouldUseShell(command),
  });
}

export function shouldUseShell(command, platform = process.platform) {
  return platform === "win32" && /\.(cmd|bat)$/i.test(command);
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

function hasWindowsExecutableExtension(command) {
  return /\.(cmd|bat|exe)$/i.test(command);
}
