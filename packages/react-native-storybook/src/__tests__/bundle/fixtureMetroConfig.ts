import * as path from 'path';

const { getDefaultConfig } = require('metro-config');

/**
 * Metro's default config for a fixture project laid in the OS temp folder, ready for a fresh
 * build. Metro's own runtime and polyfills live in the repo node_modules and the fixture holds
 * only the app-level packages, so both are resolved - but only the folders the bundle reads from
 * are watched: Metro's node crawler walks every watched folder before it builds, and the whole
 * repo node_modules is tens of thousands of files. The SDK's bundler folder is watched so the
 * Sherlo polyfill (added on the enabled path) is crawlable. The node crawler is used, as watchman
 * does not cover the temp folder, and every cache is off.
 */
export async function fixtureMetroConfig(root: string): Promise<any> {
  const config = await getDefaultConfig(root);
  const metroRuntimeDir = path.dirname(require.resolve('metro-runtime/package.json'));
  const repoNodeModules = path.dirname(metroRuntimeDir);
  const sdkMetroDir = path.resolve(__dirname, '../../../metro');

  config.watchFolders = [root, metroRuntimeDir, sdkMetroDir];
  config.resolver.nodeModulesPaths = [path.join(root, 'node_modules'), repoNodeModules];
  config.resolver.useWatchman = false;
  config.cacheStores = [];
  config.resetCache = true;
  return config;
}
