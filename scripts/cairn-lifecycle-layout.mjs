import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { cairnHome, installRoot as cairnInstallRoot, installManifestPath } from "./cairn-paths.mjs";

const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

// Path constants for the lifecycle. `current` is the <cairnHome>/install layout; `legacy` keeps the 0.6.0
// constants (everything under $CODEX_HOME/plugins/cache/cairn) byte for byte so a legacy stack can read it.
// Codex only treats cairn@cairn as installed when its own plugin cache holds cairn/<version>, so that host
// cache stays under CODEX_HOME in both layouts.
export function createLayout({ env = process.env, releaseVersion, marketplaceName = "cairn", pluginName = "cairn" }) {
  if (typeof releaseVersion !== "string" || !VERSION_PATTERN.test(releaseVersion)) throw new Error(`Invalid Cairn release version: ${releaseVersion}`);
  const homeRoot = env.HOME ?? env.USERPROFILE ?? homedir() ?? ".";
  const codexHome = resolve(env.CODEX_HOME ?? join(homeRoot, ".codex"));
  const cairnHomeRoot = cairnHome(env);
  const codexCacheRoot = join(codexHome, "plugins", "cache", marketplaceName);
  const codexRuntimeParent = join(codexCacheRoot, pluginName);
  const shared = { cairnHomeRoot, codexHome, codexCacheRoot, codexRuntimeParent };

  const installRoot = cairnInstallRoot(env);
  const codexMarketplaceRoot = join(installRoot, "codex");
  const current = layoutPaths({
    ...shared,
    installRoot,
    stateRoot: installRoot,
    ownershipPath: installManifestPath(env),
    marketplaceRoot: codexMarketplaceRoot,
    installedPluginRoot: join(codexMarketplaceRoot, "plugins", pluginName),
    marketplaceJsonPath: join(codexMarketplaceRoot, ".agents", "plugins", "marketplace.json"),
    claudePluginMarketplaceRoot: join(installRoot, "claude"),
    runtimeParent: join(installRoot, "runtime"),
  }, releaseVersion);

  const legacyStateRoot = join(codexCacheRoot, ".cairn");
  const legacy = layoutPaths({
    ...shared,
    installRoot: codexCacheRoot,
    stateRoot: legacyStateRoot,
    ownershipPath: join(legacyStateRoot, "lifecycle.json"),
    marketplaceRoot: codexCacheRoot,
    installedPluginRoot: join(codexCacheRoot, "plugins", pluginName),
    marketplaceJsonPath: join(codexCacheRoot, ".agents", "plugins", "marketplace.json"),
    claudePluginMarketplaceRoot: join(codexCacheRoot, "claude"),
    // 0.6.0 locators point at the Codex cache runtime.
    runtimeParent: codexRuntimeParent,
  }, releaseVersion);

  return { current, legacy };
}

function layoutPaths(paths, releaseVersion) {
  const runtimeRootFor = (version) => versionedChild(paths.runtimeParent, version);
  const codexRuntimeRootFor = (version) => versionedChild(paths.codexRuntimeParent, version);
  return {
    ...paths,
    transactionPath: join(paths.stateRoot, "transaction.json"),
    transactionRoot: join(paths.stateRoot, "transactions"),
    lifecycleLockPath: join(paths.stateRoot, "lifecycle.lock"),
    runtimeRoot: runtimeRootFor(releaseVersion),
    codexRuntimeRoot: codexRuntimeRootFor(releaseVersion),
    runtimeRootFor,
    codexRuntimeRootFor,
  };
}

function versionedChild(parent, version) {
  if (typeof version !== "string" || !VERSION_PATTERN.test(version)) throw new Error(`Invalid Cairn runtime version: ${version}`);
  return join(parent, version);
}
