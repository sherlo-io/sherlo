import * as path from 'path';

const { getDefaultConfig } = require('metro-config');

const PACKAGE_ROOT = path.resolve(__dirname, '../../..');

/**
 * Metro's default config for a fixture project laid in the OS temp folder, ready for a fresh
 * build: Metro's own runtime and Babel helpers live in the repo's node_modules, and the fixture
 * holds only the app-level packages, so both are watched and resolved, along with this package's
 * folder (Sherlo's polyfill lives there). The node crawler is used, as watchman does not cover the
 * temp folder, and every cache is off.
 */
export async function fixtureMetroConfig(root: string): Promise<any> {
  const config = await getDefaultConfig(root);
  const repoNodeModules = path.dirname(path.dirname(require.resolve('metro-runtime/package.json')));

  config.watchFolders = [root, repoNodeModules, PACKAGE_ROOT];
  config.resolver.nodeModulesPaths = [path.join(root, 'node_modules'), repoNodeModules];
  config.resolver.useWatchman = false;
  config.cacheStores = [];
  config.resetCache = true;
  return config;
}
