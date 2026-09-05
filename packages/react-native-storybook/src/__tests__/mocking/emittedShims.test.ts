'use strict';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Module from 'module';
import { createRequire } from 'module';
import esbuild from 'esbuild';

// ===========================================================================
// THE EMITTED SHIM, EVALUATED AGAINST THE BUILT RUNTIME.
// ===========================================================================
//
// The mocking pipeline has two halves that ship separately: the Metro layer
// (metro/mockShims.js) WRITES a shim file, and the mocking runtime
// (dist/mocking/index.js, reached through the package's `./mocking` export)
// answers the `createMockable` call that shim makes. Every other suite tests
// one half:
//
//   - metroMockLayer.test.ts   - the Metro layer: what gets scanned, emitted
//                                and redirected, and the opt-in gate.
//   - createMockable.test.ts, callableExport.test.ts, registry.test.ts, ...
//                              - the runtime, imported from src/.
//
// Nothing there ever runs an emitted shim. This suite does: it evaluates the
// generated file the way Metro's bundle would, feeding its
// `require('@sherlo/react-native-storybook/mocking')` the BUILT runtime. That
// is the one place the two halves have to agree, and the only place a drift
// between them (a renamed export, a changed call shape, a shim that requires
// the wrong specifier) shows up as a failure rather than as two green suites.
//
// The runtime is bundled to CJS with esbuild because dist/ is ESM with
// extensionless relative imports and a top-level react-native import - not
// loadable by a plain require(). `react-native` is kept external and answered
// by a stub reporting 'testing' mode, since registry.activateMocks only
// installs a set in 'testing'/'storybook'.
// ===========================================================================

const PACKAGE_ROOT = path.resolve(__dirname, '../../..');
const BUILT_RUNTIME_ENTRY = path.join(PACKAGE_ROOT, 'dist/mocking/index.js');

// The specifier an emitted shim uses to reach createMockable. Asserted below
// to still be what mockShims emits.
const CREATE_MOCKABLE_SPECIFIER = '@sherlo/react-native-storybook/mocking';

const applySherloTransforms = require('../../../metro/applySherloTransforms');
const mockShims = require('../../../metro/mockShims');

const nodeRequire = createRequire(__filename);

interface MockingRuntime {
  createMockable: <T>(key: string, real: T) => T;
  activateMocks: (mocks: Record<string, unknown>) => void;
  clearMocks: () => void;
}

let runtime: MockingRuntime;
let restoreModuleLoad: (() => void) | undefined;

function loadBuiltRuntime(): MockingRuntime {
  if (!fs.existsSync(BUILT_RUNTIME_ENTRY)) {
    throw new Error(
      `${BUILT_RUNTIME_ENTRY} is missing. This suite asserts on the BUILT runtime an ` +
        'emitted shim requires - run `yarn build` in packages/react-native-storybook first ' +
        '(CI does it before `yarn test`).'
    );
  }

  const bundlePath = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-mocking-runtime-')),
    'mocking.cjs'
  );
  esbuild.buildSync({
    entryPoints: [BUILT_RUNTIME_ENTRY],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    outfile: bundlePath,
    external: ['react-native'],
  });

  // SherloModule's live/dummy branch is driven entirely by
  // specs/NativeSherloModule.ts's TurboModuleRegistry.getEnforcing() result,
  // so getEnforcing must SUCCEED and answer a working spec. A throwing
  // getEnforcing leaves TurboModule null forever, which routes every call
  // through the dummy module (mode 'default' always) and silently no-ops
  // activateMocks.
  const originalLoad = (Module as any)._load;
  (Module as any)._load = function patchedLoad(request: string, ...rest: unknown[]) {
    if (request === 'react-native') {
      return {
        NativeModules: {},
        TurboModuleRegistry: {
          getEnforcing: () => ({
            getSherloConstants: () => ({
              mode: 'testing',
              config: null,
              lastState: null,
              nativeVersion: null,
            }),
            reportEarlyJsError: () => true,
            appendFile: () => Promise.resolve(),
            readFile: () => Promise.resolve(''),
            invoke: () => Promise.resolve('{}'),
            invokeSync: () => '{}',
          }),
          get: () => null,
        },
      };
    }
    return originalLoad.call(this, request, ...rest);
  };
  restoreModuleLoad = () => {
    (Module as any)._load = originalLoad;
  };

  return nodeRequire(bundlePath) as MockingRuntime;
}

// ---------------------------------------------------------------------------
// Project fixtures
// ---------------------------------------------------------------------------

// realpath: the Metro layer canonicalizes module paths through realpathSync
// (macOS /var -> /private/var), so an un-realpath'd root would make the
// resolver's map keys miss the on-disk paths.
function makeProject(): string {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-emitted-shims-')));
}

function writeFile(projectRoot: string, relPath: string, content: string): string {
  const fullPath = path.join(projectRoot, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf8');
  return fullPath;
}

/** One story declaring `mocks` for each key. Only the KEYS are ever read at config time. */
function writeStoryDeclaringMocks(projectRoot: string, mockKeys: string[]): void {
  const mockEntries = mockKeys.map((key) => `      ${JSON.stringify(key)}: () => ({}),`).join('\n');
  writeFile(
    projectRoot,
    'src/Widget.stories.tsx',
    'export default {\n' +
      "  title: 'Widget',\n" +
      '  parameters: {\n' +
      '    sherlo: {\n' +
      '      mocks: {\n' +
      mockEntries +
      '\n      },\n' +
      '    },\n' +
      '  },\n' +
      '};\n' +
      'export const Basic = {};\n'
  );
}

function mocksDirOf(projectRoot: string): string {
  return path.join(projectRoot, 'node_modules', '.cache', 'sherlo', 'mocks');
}

function storybookWrapperOf(projectRoot: string): string {
  return path.join(projectRoot, 'node_modules', '.cache', 'sherlo', 'storybook-wrapper.js');
}

/** The single shim the pipeline emitted for a one-key project. */
function onlyEmittedShim(projectRoot: string): string {
  const mocksDir = mocksDirOf(projectRoot);
  const shimNames = fs.readdirSync(mocksDir).filter((name) => name.startsWith('mock-'));
  expect(shimNames, `expected exactly one emitted shim, got ${shimNames.join(', ')}`).toHaveLength(
    1
  );
  return path.join(mocksDir, shimNames[0]!);
}

/**
 * Evaluates a file the way Metro's bundle would, with an explicit
 * require-redirect map. `CREATE_MOCKABLE_SPECIFIER` is answered with the built
 * runtime; a redirected target is evaluated through this SAME require
 * (recursively), so a redirect that lands on a generated shim resolves that
 * shim's own runtime require correctly instead of trying to load an installed
 * package that is not there.
 */
function evaluateAsBundle(filePath: string, redirects: Record<string, string> = {}): any {
  function loadFile(target: string): any {
    const source = fs.readFileSync(target, 'utf8');
    const bundleRequire = (specifier: string) => {
      if (specifier === CREATE_MOCKABLE_SPECIFIER) {
        return { createMockable: runtime.createMockable };
      }
      if (redirects[specifier]) return loadFile(redirects[specifier]!);
      return nodeRequire(specifier);
    };
    const module = { exports: {} as any };
    // eslint-disable-next-line no-new-func
    new Function('require', 'module', 'exports', source)(bundleRequire, module, module.exports);
    return module.exports;
  }
  return loadFile(filePath);
}

function removeProject(projectRoot: string): void {
  fs.rmSync(projectRoot, { recursive: true, force: true });
}

beforeAll(() => {
  runtime = loadBuiltRuntime();
}, 120_000);

afterAll(() => {
  restoreModuleLoad?.();
});

// ===========================================================================
// The shim requires the specifier the runtime is actually published under
// ===========================================================================

describe('emitted shims - the specifier the shim and the runtime meet on', () => {
  it('is the one this suite feeds the built runtime through', () => {
    // If mockShims ever renames it, every assertion below would keep passing
    // against a stub nobody ships. Pin it here, once.
    expect(mockShims.CREATE_MOCKABLE_SPECIFIER).toBe(CREATE_MOCKABLE_SPECIFIER);
  });
});

// ===========================================================================
// Flag off - the pipeline leaves no fingerprint at all
// ===========================================================================
//
// metroMockLayer.test.ts already proves the off path emits no shims and
// installs no redirect. What it does not compare is the output the transform
// ALWAYS writes: if mocking-when-off left any trace, storybook-wrapper.js
// would differ between a project that declares mocks and one that declares
// none.
describe('emitted shims - flag off leaves the always-written output untouched', () => {
  it('storybook-wrapper.js is byte-identical with and without declared mocks', () => {
    const declaringRoot = makeProject();
    const baselineRoot = makeProject();

    try {
      writeStoryDeclaringMocks(declaringRoot, ['./src/api/client']);
      writeFile(declaringRoot, 'src/api/client.ts', 'export const get = () => "real-get";\n');
      writeStoryDeclaringMocks(baselineRoot, []);

      applySherloTransforms(
        { projectRoot: declaringRoot, resolver: {} },
        { experimentalMocks: false }
      );
      applySherloTransforms({ projectRoot: baselineRoot, resolver: {} }, {});

      expect(fs.existsSync(mocksDirOf(declaringRoot))).toBe(false);
      expect(
        fs.readFileSync(storybookWrapperOf(declaringRoot), 'utf8'),
        'declaring mocks with the gate OFF changed the storybook wrapper - a disabled ' +
          'feature must be invisible in the build output, not merely inert at runtime'
      ).toBe(fs.readFileSync(storybookWrapperOf(baselineRoot), 'utf8'));
    } finally {
      removeProject(declaringRoot);
      removeProject(baselineRoot);
    }
  });
});

// ===========================================================================
// Flag on - the emitted shim, actually evaluated
// ===========================================================================

describe('emitted shims - a callable export stays callable through the shim', () => {
  it('falls through to the real function when dormant and to the mock when active', () => {
    const projectRoot = makeProject();
    try {
      const callableKey = './src/http/httpClient';
      // .js so the shim's require() of an extensionless absolute path resolves
      // through Node's own loader inside evaluateAsBundle.
      writeFile(
        projectRoot,
        'src/http/httpClient.js',
        "'use strict';\n" +
          'function httpClient(url) { return "REAL:" + url; }\n' +
          'httpClient.flavor = "real";\n' +
          'module.exports = httpClient;\n'
      );
      writeStoryDeclaringMocks(projectRoot, [callableKey]);

      applySherloTransforms({ projectRoot, resolver: {} }, { experimentalMocks: true });
      const shimExport = evaluateAsBundle(onlyEmittedShim(projectRoot));

      expect(
        typeof shimExport,
        'the emitted shim exported a non-callable value for a module whose export IS a ' +
          'function (axios-style) - every call site would throw a TypeError in a real bundle'
      ).toBe('function');

      runtime.clearMocks();
      expect(shimExport('/users')).toBe('REAL:/users');
      // Own properties on the real function still read through the shim.
      expect(shimExport.flavor).toBe('real');

      runtime.activateMocks({ [callableKey]: () => (url: string) => 'MOCK:' + url });
      expect(shimExport('/users')).toBe('MOCK:/users');

      runtime.clearMocks();
      expect(shimExport('/users')).toBe('REAL:/users');
    } finally {
      runtime.clearMocks();
      removeProject(projectRoot);
    }
  });

  it('a constructor export stays constructable through the shim', () => {
    const projectRoot = makeProject();
    try {
      const constructorKey = './src/Client';
      writeFile(
        projectRoot,
        'src/Client.js',
        "'use strict';\n" +
          'function Client(value) { this.value = value; this.tag = "real"; }\n' +
          'module.exports = Client;\n'
      );
      writeStoryDeclaringMocks(projectRoot, [constructorKey]);

      applySherloTransforms({ projectRoot, resolver: {} }, { experimentalMocks: true });
      const ShimmedClient = evaluateAsBundle(onlyEmittedShim(projectRoot)) as new (
        value: number
      ) => { value: number; tag: string };

      runtime.clearMocks();
      const instance = new ShimmedClient(7);
      expect(instance.value).toBe(7);
      expect(instance.tag).toBe('real');
    } finally {
      runtime.clearMocks();
      removeProject(projectRoot);
    }
  });
});

// ===========================================================================
// The two documented boundaries that only an evaluated module graph can show
// ===========================================================================

describe('emitted shims - a CJS top-level destructure captures the real value', () => {
  it('a `require(...).x` binding never sees a mock activated after it was read', () => {
    const projectRoot = makeProject();
    try {
      const targetKey = './src/mocking/cjsTarget';
      writeFile(
        projectRoot,
        'src/mocking/cjsTarget.js',
        "module.exports = { label: 'real-cjs' };\n"
      );
      const consumerPath = writeFile(
        projectRoot,
        'src/mocking/cjsConsumer.js',
        "'use strict';\n" +
          "var label = require('./cjsTarget').label;\n" +
          'exports.readLabel = function () { return label; };\n'
      );
      writeStoryDeclaringMocks(projectRoot, [targetKey]);

      applySherloTransforms({ projectRoot, resolver: {} }, { experimentalMocks: true });
      const shimPath = onlyEmittedShim(projectRoot);

      // The consumer evaluates ONCE with no mock active - the ordering a real
      // bundle produces, since story discovery happens before any story
      // activates its mocks.
      runtime.clearMocks();
      const consumer = evaluateAsBundle(consumerPath, { './cjsTarget': shimPath });
      expect(consumer.readLabel()).toBe('real-cjs');

      runtime.activateMocks({ [targetKey]: () => ({ label: 'mock-cjs' }) });
      expect(
        consumer.readLabel(),
        'a CJS top-level destructure started seeing a mock activated after it read the real ' +
          'module - either the shim stopped being a live proxy (silently breaking every ' +
          'scenario that depends on it being live), or this documented limitation is no ' +
          'longer real and should be removed from the docs'
      ).toBe('real-cjs');
    } finally {
      runtime.clearMocks();
      removeProject(projectRoot);
    }
  });
});

describe('emitted shims - a module with an import-time side effect evaluates exactly once', () => {
  it('a pass-through mock factory does not re-evaluate the real module', () => {
    const projectRoot = makeProject();
    try {
      const sideEffectKey = './src/mocking/sideEffect';
      writeFile(
        projectRoot,
        'src/mocking/sideEffectLog.js',
        "'use strict';\n" +
          'var evaluations = 0;\n' +
          'exports.recordEvaluation = function () { evaluations += 1; };\n' +
          'exports.evaluationCount = function () { return evaluations; };\n'
      );
      writeFile(
        projectRoot,
        'src/mocking/sideEffect.js',
        "'use strict';\n" +
          "require('./sideEffectLog').recordEvaluation();\n" +
          "exports.value = 'real-side-effect';\n"
      );
      writeStoryDeclaringMocks(projectRoot, [sideEffectKey]);

      applySherloTransforms({ projectRoot, resolver: {} }, { experimentalMocks: true });

      runtime.clearMocks();
      // Loading the shim requires the real module once; Node's module cache
      // guarantees a single evaluation from here on, mock active or not.
      const shimExports = evaluateAsBundle(onlyEmittedShim(projectRoot));
      const sideEffectLog = nodeRequire(path.join(projectRoot, 'src/mocking/sideEffectLog.js'));

      expect(shimExports.value).toBe('real-side-effect');
      expect(sideEffectLog.evaluationCount()).toBe(1);

      runtime.activateMocks({
        [sideEffectKey]: (original: { value: string }) => ({ ...original }),
      });
      expect(shimExports.value).toBe('real-side-effect');
      expect(
        sideEffectLog.evaluationCount(),
        'activating a pass-through mock re-evaluated the real module - an import-time side ' +
          'effect (analytics init, a singleton) would now run twice for one story'
      ).toBe(1);
    } finally {
      runtime.clearMocks();
      removeProject(projectRoot);
    }
  });
});
