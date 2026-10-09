import * as fs from 'fs';
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
  // One worker, in this process: a fixture is a handful of files, and a pool of worker processes
  // started for each build cost more than the transforms. Measured in the SDK's full parallel run:
  // buildContents.test.ts (four builds) went from 5.1s to 1.4s.
  config.maxWorkers = 1;
  config.cacheStores = [];
  config.resetCache = true;
  return config;
}

/**
 * A function that writes `content` to `relativePath` inside the fixture project at `root`,
 * making its folders on the way.
 */
export function fixtureFileWriter(root: string): (relativePath: string, content: string) => void {
  return (relativePath, content) => {
    const fullPath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf8');
  };
}

/**
 * Makes `config` record every module a bundle holds, by absolute path, as Metro gives it an id.
 * Metro starts a new server, and asks for a new id factory, for each build.
 *
 * @returns a function that gives the modules of the latest build
 */
export function recordBundledModules(config: any): () => string[] {
  let modulesOfLatestBuild: string[] = [];
  config.serializer.createModuleIdFactory = () => {
    const modulesOfThisBuild: string[] = [];
    modulesOfLatestBuild = modulesOfThisBuild;
    const idOfModule = new Map<string, number>();
    return (modulePath: string) => {
      if (!idOfModule.has(modulePath)) {
        idOfModule.set(modulePath, idOfModule.size);
        modulesOfThisBuild.push(modulePath);
      }
      return idOfModule.get(modulePath);
    };
  };
  return () => modulesOfLatestBuild;
}
