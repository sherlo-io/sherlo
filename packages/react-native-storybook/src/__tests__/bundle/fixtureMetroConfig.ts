import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { enterBundlingProcess } from '../bundlingProcess';

const { getDefaultConfig } = require('metro-config');
const withStorybook = require('../../../metro/withStorybook');

const PACKAGE_ROOT = path.resolve(__dirname, '../../..');

/** Where a fixture project holds its copy of the SDK. */
export const SDK_FOLDER_IN_FIXTURE = 'node_modules/@sherlo/react-native-storybook';

/**
 * A new, empty fixture project folder in the OS temp folder, named from `namePrefix`. Its path has
 * its symlinks followed, so it matches the paths Metro's file watcher indexes (macOS /var ->
 * /private/var).
 */
export function createFixtureRoot(namePrefix: string): string {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), namePrefix)));
}

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
 * Writes the fixture's copy of the SDK's package.json: the real one's name, main and exports map,
 * so the SDK's imports resolve in the fixture as they do in an app. The files the exports map
 * names are each test's own stand-ins.
 */
export function writeSdkPackageJson(write: (relativePath: string, content: string) => void): void {
  const sdkPackageJson = JSON.parse(
    fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8')
  );
  write(
    `${SDK_FOLDER_IN_FIXTURE}/package.json`,
    JSON.stringify({
      name: sdkPackageJson.name,
      main: sdkPackageJson.main,
      exports: sdkPackageJson.exports,
    })
  );
}

/**
 * Writes a small stand-in for the package `name` into the fixture's node_modules: a package.json
 * at `version` whose main file holds `indexSource`.
 */
export function writeStandInPackage(
  write: (relativePath: string, content: string) => void,
  name: string,
  version: string,
  indexSource: string
): void {
  write(`node_modules/${name}/package.json`, JSON.stringify({ name, version, main: 'index.js' }));
  write(`node_modules/${name}/index.js`, indexSource);
}

/**
 * The source of a stand-in Storybook Metro wrapper, named `wrapperName`. Turned on, it swaps the
 * app's entry for the Storybook entry file as Storybook 10.5's own wrapper does: every resolution
 * that lands on the app's `index.js`, as Storybook names it, is answered with the Storybook entry.
 * When the test has set `globalThis.__storybookWrapperCalls`, it records there which wrapper was
 * called and with what options.
 */
export function storybookWrapperStandInSource(wrapperName: string): string {
  return (
    "var path = require('path');\n" +
    'function withStorybook(config, options) {\n' +
    '  if (globalThis.__storybookWrapperCalls) {\n' +
    '    globalThis.__storybookWrapperCalls.push({ wrapper: ' +
    JSON.stringify(wrapperName) +
    ', options: options });\n' +
    '  }\n' +
    '  if (!options || !options.enabled) return config;\n' +
    "  var appEntry = path.join(path.dirname(options.configPath), 'index.js');\n" +
    "  var storybookEntry = path.join(options.configPath, 'index.js');\n" +
    '  function resolveRequest(context, name, platform) {\n' +
    '    var resolution = context.resolveRequest(context, name, platform);\n' +
    '    if (resolution && resolution.filePath && path.resolve(resolution.filePath) === appEntry) {\n' +
    "      return { type: 'sourceFile', filePath: storybookEntry };\n" +
    '    }\n' +
    '    return resolution;\n' +
    '  }\n' +
    '  return Object.assign({}, config, {\n' +
    '    resolver: Object.assign({}, config.resolver, { resolveRequest: resolveRequest }),\n' +
    '  });\n' +
    '}\n' +
    'module.exports = { withStorybook: withStorybook };\n'
  );
}

/**
 * Sherlo's withStorybook on the fixture's Metro config, loaded as the bundling process loads it:
 * with `env` set and `commandLine` after the CLI's script, from the fixture's folder, where
 * Storybook's generator resolves the stories from, as in a real project.
 *
 * @returns the config, and a function that gives the modules of the latest build made with it
 */
export async function sherloMetroConfig(
  root: string,
  bundlingProcess: { env: Record<string, string>; commandLine: string[] },
  storybookOptions: Record<string, unknown>
): Promise<{ config: any; modulesOfLatestBuild: () => string[] }> {
  const leaveBundlingProcess = enterBundlingProcess(
    bundlingProcess.env,
    bundlingProcess.commandLine
  );
  const savedCwd = process.cwd();
  try {
    process.chdir(root);
    const baseConfig = await fixtureMetroConfig(root);
    const modulesOfLatestBuild = recordBundledModules(baseConfig);
    const config = withStorybook(baseConfig, storybookOptions);
    return { config, modulesOfLatestBuild };
  } finally {
    leaveBundlingProcess();
    process.chdir(savedCwd);
  }
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
