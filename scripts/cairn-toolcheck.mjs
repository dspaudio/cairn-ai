#!/usr/bin/env node
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const install = process.argv.includes("--install");
const json = process.argv.includes("--json");
const entries = await collectEntries(root);
const detected = detectStacks(entries);
const requirements = buildRequirements(detected);
const results = [];

for (const requirement of requirements) {
  let ok = commandOk(requirement.command, requirement.args);
  let installed = false;
  let installResult = null;
  if (!ok && install && requirement.install) {
    installResult = run(requirement.install.command, requirement.install.args);
    installed = installResult.status === 0;
    ok = commandOk(requirement.command, requirement.args);
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

if (json) {
  console.log(JSON.stringify({ root, detected, results }, null, 2));
} else {
  console.log(`Cairn toolcheck: ${root}`);
  console.log(`Detected stacks: ${detected.length > 0 ? detected.join(", ") : "none"}`);
  for (const result of results) {
    const prefix = result.ok ? "OK" : "MISSING";
    const installedText = result.installed ? " installed" : "";
    console.log(`${prefix}${installedText} ${result.name} - ${result.reason}`);
    if (!result.ok && result.installCommand) console.log(`  install: ${result.installCommand}`);
  }
}

if (results.some((result) => !result.ok)) process.exitCode = 1;

async function collectEntries(base) {
  const output = [];
  async function walk(dir) {
    for (const entry of await readdir(dir)) {
      if ([".git", ".cairn", "node_modules", "vendor", "target", ".venv", "__pycache__"].includes(entry)) continue;
      const path = join(dir, entry);
      const info = await stat(path);
      if (info.isDirectory()) await walk(path);
      else output.push(path.slice(base.length + 1));
    }
  }
  await walk(base);
  return output;
}

function detectStacks(paths) {
  const stacks = new Set();
  if (paths.some((path) => path === "package.json")) stacks.add("javascript");
  if (paths.some((path) => path === "tsconfig.json" || path.endsWith(".ts") || path.endsWith(".tsx"))) stacks.add("typescript");
  if (paths.some((path) => path === "pyproject.toml" || path.endsWith(".py"))) stacks.add("python");
  if (paths.some((path) => path === "composer.json" || path.endsWith(".php"))) stacks.add("php");
  if (paths.some((path) => path === "pom.xml" || path === "build.gradle" || path === "build.gradle.kts" || path.endsWith(".java"))) stacks.add("java");
  if (paths.some((path) => path === "Package.swift" || path.endsWith(".xcodeproj") || path.endsWith(".xcworkspace") || path.endsWith(".swift"))) stacks.add("swift");
  if (paths.some((path) => path === "go.mod" || path.endsWith(".go"))) stacks.add("go");
  if (paths.some((path) => path === "Cargo.toml" || path.endsWith(".rs"))) stacks.add("rust");
  return [...stacks];
}

function buildRequirements(stacks) {
  const requirements = [];
  if (stacks.includes("javascript")) {
    requirements.push(req("node", ["--version"], "JavaScript runtime for package scripts and CLI checks"));
  }
  if (stacks.includes("typescript")) {
    const pm = packageManager();
    requirements.push(req("typescript-language-server", ["--version"], "TypeScript LSP server", installDev(pm, ["typescript", "typescript-language-server"])));
    requirements.push(req("tsc", ["--version"], "TypeScript compiler verification", installDev(pm, ["typescript"])));
  }
  if (stacks.includes("python")) {
    const uv = commandOk("uv", ["--version"]);
    const project = entries.includes("pyproject.toml");
    const basedpyrightInstall = pythonInstall(uv, project, "basedpyright");
    const ruffInstall = pythonInstall(uv, project, "ruff");
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
    requirements.push(req("java", ["--version"], "Java runtime for build and test commands"));
    requirements.push(req("javac", ["--version"], "Java compiler verification"));
    requirements.push(req("jdtls", ["--version"], "Java LSP server", { command: "bash", args: ["-lc", "mkdir -p .cairn/tools && curl -L https://download.eclipse.org/jdtls/milestones/latest/jdt-language-server-latest.tar.gz | tar -xz -C .cairn/tools"] }));
    if (entries.includes("gradlew")) requirements.push(req("./gradlew", ["--version"], "Gradle wrapper availability"));
    else if (entries.includes("build.gradle") || entries.includes("build.gradle.kts")) requirements.push(req("gradle", ["--version"], "Gradle availability"));
    if (entries.includes("mvnw")) requirements.push(req("./mvnw", ["--version"], "Maven wrapper availability"));
    else if (entries.includes("pom.xml")) requirements.push(req("mvn", ["--version"], "Maven availability"));
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

function composerInstall(packages) {
  return { command: "composer", args: ["require", "--dev", ...packages] };
}

function pythonInstall(uv, project, tool) {
  if (uv && project) return { command: "uv", args: ["add", "--dev", tool] };
  if (uv) return { command: "uv", args: ["tool", "install", tool] };
  return { command: "python3", args: ["-m", "pip", "install", "--user", tool] };
}

function req(command, args, reason, installCommand = null) {
  return { name: command, command, args, reason, install: installCommand };
}

function packageManager() {
  if (entries.includes("bun.lockb") || entries.includes("bun.lock")) return "bun";
  if (entries.includes("pnpm-lock.yaml")) return "pnpm";
  if (entries.includes("yarn.lock")) return "yarn";
  return "npm";
}

function installDev(pm, packages) {
  if (pm === "bun") return { command: "bun", args: ["add", "-d", ...packages] };
  if (pm === "pnpm") return { command: "pnpm", args: ["add", "-D", ...packages] };
  if (pm === "yarn") return { command: "yarn", args: ["add", "-D", ...packages] };
  return { command: "npm", args: ["install", "--save-dev", ...packages] };
}

function commandOk(command, args) {
  if (run(command, args).status === 0) return true;
  if (run(join(root, "node_modules", ".bin", command), args).status === 0) return true;
  if (run(join(root, "vendor", "bin", command), args).status === 0) return true;
  return run(join(root, ".cairn", "tools", "bin", command), args).status === 0;
}

function run(command, args) {
  return spawnSync(command, args, { stdio: "ignore", encoding: "utf8" });
}
