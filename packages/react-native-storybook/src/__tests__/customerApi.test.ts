'use strict';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Module from 'module';
import { createRequire } from 'module';
import esbuild from 'esbuild';

// ===========================================================================
// THE CUSTOMER'S PERSPECTIVE ON THE PACKAGE ROOT, at the level that needs no
// device.
// ===========================================================================
//
// Every assertion below runs with NOTHING INJECTED - no runner, no native
// implementation - so it describes behaviour that has to come out of the
// customer's own built package, frozen at their build. The failure this
// exists to catch is the quiet one: a customer's app booting into Storybook,
// or into capture mode, when nobody asked it to.
//
// The subject is the BUILT `dist/index.js`, not `src/index.ts`, because that
// is the file a customer's bundler reaches through the package's `exports`
// map - the surface that ships.
//
// Why bundle it instead of requiring it directly: `dist/index.js` is compiled
// with `module: "ESNext"`, so its re-export chain (isStorybookMode.ts /
// isRunningVisualTests.ts / openStorybook.ts) uses real `import SherloModule
// from './SherloModule'` statements, while index.ts's own
// `installSherloIntegration()` additionally does a raw
// `require('./SherloModule')`. The built file is therefore genuine ESM that
// ALSO contains a require() call, which only Node's require(esm) support can
// load - and even then Node's ESM resolver demands extensions on relative
// specifiers, which tsc's output does not write. Bundling through esbuild
// resolves every extensionless relative import at BUILD time and produces
// plain CJS, so neither vitest's transform nor Node's require(esm) semantics
// ever see this file.
//
// `./SherloModule` stays external and is intercepted through a Module._load
// patch rather than a Module._cache pre-seed: the bundle's own require() call
// happens INSIDE its execution, at a path relative to the bundle's temp
// location, so a cache entry keyed on the original source tree would never be
// consulted.
// ===========================================================================

const PACKAGE_ROOT = path.resolve(__dirname, '../..');
const BUILT_ENTRY = path.join(PACKAGE_ROOT, 'dist/index.js');

const nodeRequire = createRequire(__filename);

let bundlePath: string;

interface NativeCall {
  name: string;
  args: Record<string, unknown>;
}

interface RootExports {
  isStorybookMode: boolean;
  isRunningVisualTests: boolean;
  openStorybook: () => void;
}

/**
 * Runs `body` against the REAL root export surface, loaded over a stubbed
 * `./SherloModule`. `mode` is exactly what `SherloModule.getMode()` would
 * report - 'default' covers BOTH "no native module linked at all" and "a shim
 * present with nothing injected", which are indistinguishable from the root
 * export surface's point of view. The dummy-vs-live branching itself is
 * covered by SherloModule.dummy.test.ts / SherloModule.live.test.ts.
 */
function withRootExports(
  mode: string,
  body: (loaded: { api: RootExports; calls: NativeCall[] }) => void
): void {
  const calls: NativeCall[] = [];
  const moduleCache = (Module as unknown as { _cache: Record<string, unknown> })._cache;
  delete moduleCache[bundlePath];

  const originalLoad = (Module as any)._load;
  (Module as any)._load = function patchedLoad(request: string, ...rest: unknown[]) {
    if (request === './SherloModule') {
      return {
        __esModule: true,
        default: {
          isTurboModule: true,
          getMode: () => mode,
          invokeSync: (name: string, args: Record<string, unknown>) => {
            calls.push({ name, args });
            return { ok: true, value: null };
          },
          openStorybook: () => {
            calls.push({ name: 'setMode', args: { mode: 'storybook', reload: true } });
          },
        },
      };
    }
    return originalLoad.apply(this, [request, ...rest]);
  };

  try {
    body({ api: nodeRequire(bundlePath) as RootExports, calls });
  } finally {
    (Module as any)._load = originalLoad;
    delete moduleCache[bundlePath];
  }
}

describe('customer API - the package root, with nothing injected', () => {
  beforeAll(() => {
    if (!fs.existsSync(BUILT_ENTRY)) {
      throw new Error(
        `${BUILT_ENTRY} is missing. This suite asserts on the BUILT package - run ` +
          '`yarn build` in packages/react-native-storybook first (CI does it before `yarn test`).'
      );
    }

    // realpath: require() keys Module._cache by the RESOLVED filename, and on
    // macOS os.tmpdir() is a symlink (/var -> /private/var). Without this the
    // cache eviction in withRootExports would miss, every case after the
    // first would silently reuse the first case's module instance, and their
    // mode would never take effect.
    bundlePath = path.join(
      fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-customer-api-'))),
      'index.cjs'
    );
    esbuild.buildSync({
      entryPoints: [BUILT_ENTRY],
      bundle: true,
      format: 'cjs',
      platform: 'node',
      outfile: bundlePath,
      // Stubbed at require time by withRootExports's Module._load patch -
      // never bundled, so the SAME stub object answers regardless of where
      // inside the bundle the reference (import or require) came from.
      external: ['./SherloModule'],
    });
  });

  it('with mode DEFAULT (no native module, or a shim with nothing injected), nothing is on', () => {
    withRootExports('default', ({ api }) => {
      expect(
        api.isStorybookMode,
        'a missing/default-mode native module put the app into Storybook - every user of ' +
          'a build without an attached implementation would see stories instead of the app'
      ).toBe(false);
      expect(api.isRunningVisualTests).toBe(false);
    });
  });

  it('storybook mode renders Storybook but is NOT a visual-test run', () => {
    withRootExports('storybook', ({ api }) => {
      expect(api.isStorybookMode).toBe(true);
      expect(
        api.isRunningVisualTests,
        'a developer browsing Storybook by hand was reported as a capture run - their app ' +
          'would hide exactly the non-deterministic UI they opened Storybook to see'
      ).toBe(false);
    });
  });

  it('testing mode implies storybook mode', () => {
    withRootExports('testing', ({ api }) => {
      expect(api.isRunningVisualTests).toBe(true);
      expect(
        api.isStorybookMode,
        'capture was running while the root was told to render the ordinary app - every ' +
          "screenshot would be of the customer's home screen"
      ).toBe(true);
    });
  });

  it('openStorybook asks for storybook mode AND a reload, exactly once', () => {
    withRootExports('default', ({ api, calls }) => {
      api.openStorybook();

      expect(calls.length, `expected 1 native call, got ${calls.length}`).toBe(1);
      expect(calls[0]!.name).toBe('setMode');
      expect(calls[0]!.args.mode).toBe('storybook');
      expect(
        calls[0]!.args.reload,
        'the mode was switched WITHOUT a reload - Storybook would render on top of the ' +
          "running app's world, with its module state, timers and caches intact"
      ).toBe(true);
    });
  });

  it('importing the package calls nothing', () => {
    withRootExports('default', ({ calls }) => {
      expect(
        calls.length,
        `importing the package issued ${calls.length} native call(s) - an import must ` +
          'observe the mode, never set it'
      ).toBe(0);
    });
  });

  it('isStorybookMode/isRunningVisualTests are captured once at import time, not read live', () => {
    // The frozen contract in isStorybookMode.ts / isRunningVisualTests.ts:
    // both are plain booleans, not functions, precisely because they must not
    // re-derive mid-session.
    withRootExports('default', ({ api }) => {
      expect(typeof api.isStorybookMode).toBe('boolean');
      expect(typeof api.isRunningVisualTests).toBe('boolean');
    });
  });
});
