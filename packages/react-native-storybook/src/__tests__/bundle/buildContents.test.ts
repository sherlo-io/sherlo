'use strict';

// ---------------------------------------------------------------------------
// What a release bundle carries
// ---------------------------------------------------------------------------
//
// Builds an old-setup fixture app with REAL Metro, through the real bundler wrapper
// (metro/withStorybook.js) and the real Storybook wrapper behind it, and reads which modules the
// bundle holds. Built the way mockBundle.test.ts builds its fixture.
//
// The fixture's root imports isStorybookMode from the SDK and the Storybook config folder, as the
// docs' Root component does. Its node_modules hold a copy of the SDK package (its real
// package.json, and the real stand-in transpiled from src/offStandIn.ts) and a small stand-in for
// Storybook's runtime package: the real one needs native peers no test installs, and the runtime
// package is not what decides - the Storybook wrapper read while the config loads is.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as ts from 'typescript';
import * as vm from 'vm';

import { enterBundlingProcess } from '../bundlingProcess';
import { fixtureMetroConfig } from './fixtureMetroConfig';

const Metro = require('metro');
const withStorybook = require('../../../metro/withStorybook');

const PACKAGE_ROOT = path.resolve(__dirname, '../../..');
const SDK_DIST_FRAGMENT = path.join('node_modules', '@sherlo', 'react-native-storybook', 'dist');
const STORYBOOK_FRAGMENT = path.join('node_modules', '@storybook') + path.sep;

// The fixture project on disk, and its root directory.
function createOldSetupApp(): string {
  // realpath so projectRoot matches the path Metro's file watcher indexes (macOS /var ->
  // /private/var).
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-build-contents-')));
  const write = (relativePath: string, content: string) => {
    const fullPath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf8');
  };

  // The root, as the docs' Root component reads, in CommonJS so the fixture needs no transform.
  // It leaves what it renders on the global object, so a test that runs the bundle can read it.
  write(
    'index.js',
    "const { isStorybookMode } = require('@sherlo/react-native-storybook');\n" +
      "const Storybook = require('./.rnstorybook');\n" +
      "global.renderedRoot = isStorybookMode ? Storybook : 'THE_APP';\n"
  );

  // The Storybook config folder, with a storybook.requires laid as Storybook's generator lays it
  // (the generator writes it again when Storybook is on).
  write(
    '.rnstorybook/main.js',
    "module.exports = { stories: ['../src/**/*.stories.js'], addons: [] };\n"
  );
  write(
    '.rnstorybook/index.js',
    "const { view } = require('./storybook.requires');\n" +
      'module.exports = view.getStorybookUI({});\n'
  );
  write(
    '.rnstorybook/storybook.requires.js',
    "import { start } from '@storybook/react-native';\n" +
      "const normalizedStories = [{ req: require.context('../src', true, /^\\.\\/(?:(?!\\.)(?=.)[^/]*?\\.stories\\.js)$/) }];\n" +
      'export const view = start({ annotations: [], storyEntries: normalizedStories });\n'
  );
  write('src/Widget.stories.js', "export default { title: 'Widget' };\nexport const Basic = {};\n");

  // The SDK: its real package.json, so its exports map is what resolves, and the real stand-in.
  const sdkPackageJson = JSON.parse(
    fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8')
  );
  const sdkDir = 'node_modules/@sherlo/react-native-storybook';
  write(
    `${sdkDir}/package.json`,
    JSON.stringify({
      name: sdkPackageJson.name,
      main: sdkPackageJson.main,
      exports: sdkPackageJson.exports,
    })
  );
  const standInSource = fs.readFileSync(path.join(PACKAGE_ROOT, 'src', 'offStandIn.ts'), 'utf8');
  write(
    `${sdkDir}/dist/offStandIn.js`,
    ts.transpileModule(standInSource, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2018 },
    }).outputText
  );
  // The full SDK's entry, and the two files Sherlo's Storybook wrapper reaches, as small stand-ins:
  // what matters is that they are SDK modules a bundle with Sherlo in it holds.
  write(`${sdkDir}/dist/index.js`, 'exports.isStorybookMode = false;\n');
  write(`${sdkDir}/dist/getStorybook/index.js`, 'exports.default = function () {};\n');
  write(`${sdkDir}/dist/addStorybookToDevMenu.js`, 'exports.default = function () {};\n');

  // Storybook's runtime package, as a small stand-in: the real Storybook wrapper still runs while
  // the config loads, but the real runtime needs native peers this repository does not install.
  write(
    'node_modules/@storybook/react-native/package.json',
    JSON.stringify({ name: '@storybook/react-native', version: '9.1.4', main: 'index.js' })
  );
  write(
    'node_modules/@storybook/react-native/index.js',
    'exports.start = function () { return { getStorybookUI: function () { return null; } }; };\n'
  );

  // React Native, as the one name the stand-in imports.
  write(
    'node_modules/react-native/package.json',
    JSON.stringify({ name: 'react-native', version: '0.81.0', main: 'index.js' })
  );
  write('node_modules/react-native/index.js', 'exports.Alert = { alert: function () {} };\n');

  return root;
}

// Bundles the fixture for a release, with `env` and `commandLine` as the bundling process has
// them while the config loads. Returns the absolute path of every module the bundle holds, and
// the bundle's code.
async function bundleForRelease(
  root: string,
  env: Record<string, string>,
  commandLine: string[]
): Promise<{ bundledModules: string[]; code: string }> {
  const leaveBundlingProcess = enterBundlingProcess(env, commandLine);
  const savedCwd = process.cwd();

  try {
    // Storybook's generator resolves the stories from the working folder, as in a real project.
    process.chdir(root);

    const baseConfig = await fixtureMetroConfig(root);

    // Every module the bundle holds is given an id once: record its path then.
    const bundledModules: string[] = [];
    baseConfig.serializer.createModuleIdFactory = () => {
      const idOfModule = new Map<string, number>();
      return (modulePath: string) => {
        if (!idOfModule.has(modulePath)) {
          idOfModule.set(modulePath, idOfModule.size);
          bundledModules.push(modulePath);
        }
        return idOfModule.get(modulePath);
      };
    };

    const config = withStorybook(baseConfig, {
      configPath: path.join(root, '.rnstorybook'),
      useJs: true,
      docTools: false,
    });

    const { code } = await Metro.runBuild(config, {
      entry: 'index.js',
      platform: 'ios',
      dev: false,
      minify: false,
    });
    return { bundledModules, code };
  } finally {
    leaveBundlingProcess();
    process.chdir(savedCwd);
  }
}

function sdkModulesIn(bundledModules: string[]): string[] {
  return bundledModules
    .filter((modulePath) => modulePath.includes(SDK_DIST_FRAGMENT))
    .map((modulePath) =>
      modulePath.slice(modulePath.indexOf(SDK_DIST_FRAGMENT) + SDK_DIST_FRAGMENT.length + 1)
    );
}

function storybookModulesIn(bundledModules: string[]): string[] {
  return bundledModules.filter((modulePath) => modulePath.includes(STORYBOOK_FRAGMENT));
}

function configFolderModulesIn(root: string, bundledModules: string[]): string[] {
  const configFolder = path.join(root, '.rnstorybook') + path.sep;
  return bundledModules.filter((modulePath) => modulePath.startsWith(configFolder));
}

// The release bundles that carry no Sherlo: the setting off, and the setting unset in a release
// bundle as each CLI tells it - Expo's by NODE_ENV, bare React Native's by `--dev false`.
const OFF_ROADS = [
  { name: 'SHERLO_BUILD=off', env: { SHERLO_BUILD: 'off' }, commandLine: [] },
  { name: 'unset, Expo', env: { NODE_ENV: 'production' }, commandLine: ['export:embed'] },
  { name: 'unset, bare', env: {}, commandLine: ['bundle', '--dev', 'false'] },
];

const CONTROL_ROAD = {
  name: 'SHERLO_BUILD=app-and-storybook',
  env: { SHERLO_BUILD: 'app-and-storybook' },
  commandLine: ['bundle', '--dev', 'false'],
};

describe('what a release bundle carries', () => {
  // Real Metro builds are slower than unit tests; give them room.
  const TIMEOUT = 120_000;

  type Bundle = { bundledModules: string[]; code: string };

  // Each release case and the control are built once, here, and both tests read the results. The
  // builds run one after another: each one sets the bundling process's globals and the working
  // folder while its config loads, and two at once would overwrite each other.
  let root: string;
  let bundleOfOffRoad: Map<string, Bundle>;
  let controlBundle: Bundle;

  beforeAll(async () => {
    root = createOldSetupApp();
    bundleOfOffRoad = new Map();
    for (const road of OFF_ROADS) {
      bundleOfOffRoad.set(road.name, await bundleForRelease(root, road.env, road.commandLine));
    }
    controlBundle = await bundleForRelease(root, CONTROL_ROAD.env, CONTROL_ROAD.commandLine);
  }, TIMEOUT);

  afterAll(() => {
    // root is unset when beforeAll failed before it made the fixture.
    if (root) fs.rmSync(root, { recursive: true, force: true });
  });

  it('a release bundle with the setting off or unset holds no Sherlo and no Storybook module', () => {
    for (const road of OFF_ROADS) {
      const { bundledModules } = bundleOfOffRoad.get(road.name)!;
      expect(bundledModules.length, road.name).toBeGreaterThan(0);
      expect(sdkModulesIn(bundledModules), road.name).toEqual(['offStandIn.js']);
      expect(storybookModulesIn(bundledModules), road.name).toEqual([]);
      const sherloCacheModules = bundledModules.filter((modulePath) =>
        modulePath.includes(path.join('.cache', 'sherlo'))
      );
      expect(sherloCacheModules, road.name).toEqual([]);
    }

    // CONTROL: the same app with the setting at app-and-storybook holds both, or the above
    // proves nothing.
    const { bundledModules } = controlBundle;
    expect(sdkModulesIn(bundledModules)).toEqual(
      expect.arrayContaining(['index.js', 'getStorybook/index.js'])
    );
    expect(sdkModulesIn(bundledModules)).not.toContain('offStandIn.js');
    expect(storybookModulesIn(bundledModules).length).toBeGreaterThan(0);
  });

  it('with the setting off or unset in a release bundle the Storybook config folder resolves to nothing', () => {
    for (const road of OFF_ROADS) {
      const { bundledModules, code } = bundleOfOffRoad.get(road.name)!;
      expect(configFolderModulesIn(root, bundledModules), road.name).toEqual([]);

      // The bundle runs: the root imports the config folder eagerly and still renders the app.
      const appGlobal: Record<string, unknown> = {};
      expect(() => vm.runInNewContext(code, appGlobal), road.name).not.toThrow();
      expect(appGlobal.renderedRoot, road.name).toBe('THE_APP');
    }

    // CONTROL: with the setting at app-and-storybook the folder is in the bundle.
    expect(configFolderModulesIn(root, controlBundle.bundledModules).length).toBeGreaterThan(0);
  });
});
