/**
 * Unit tests for getSherloNativeModule's release-build safety.
 *
 * A second probe (global.__r('react-native') to reach NativeModules) was removed
 * from metro/polyfill.js: metro-runtime's metroRequire only resolves a string module
 * id when __DEV__ is true. In a release bundle it is passed straight through,
 * modules.get() misses, and guardedLoadModule's catch routes the resulting
 * unknownModuleError to ErrorUtils.reportFatalError instead of throwing - so a
 * try/catch around the call never runs and the app is fatally killed. This can only
 * be observed when getSherloNativeModule() is actually invoked from the error path
 * (reportToNative, via the __d wrap on a module-eval throw) with the __turboModuleProxy
 * probe missing (RN 0.76 New Architecture only - there is no old-arch fallback probe).
 */
import * as fs from 'fs';
import * as path from 'path';

const POLYFILL_PATH = path.join(__dirname, '../../metro/polyfill.js');
const polyfillSource = fs.readFileSync(POLYFILL_PATH, 'utf8');

function runPolyfill(fakeGlobal: Record<string, any>) {
  // eslint-disable-next-line no-new-func
  const fn = new Function('global', `"use strict";\n${polyfillSource}`);
  fn(fakeGlobal);
}

describe('metro/polyfill.js - getSherloNativeModule release-build safety', () => {
  it(
    'does not call global.__r and does not trigger a fatal error when the ' +
      '__turboModuleProxy probe misses in a release bundle (__DEV__ false, string module ids unresolved)',
    () => {
      const reportFatalError = vi.fn();
      // Mirrors metro-runtime's release-mode metroRequire: a string moduleId is not
      // converted to a numeric id (that only happens when __DEV__), so it falls
      // through to guardedLoadModule's catch -> ErrorUtils.reportFatalError, with no
      // throw and no return value.
      const releaseModeRequire = vi.fn((moduleId: unknown) => {
        if (typeof moduleId === 'string') {
          reportFatalError(new Error(`Requiring unknown module "${moduleId}".`));
          return undefined;
        }
        return undefined;
      });

      const originalD = vi.fn();
      const fakeGlobal: Record<string, any> = {
        ErrorUtils: {
          setGlobalHandler: vi.fn(),
          getGlobalHandler: vi.fn(() => null),
          reportFatalError,
        },
        // The only probe misses - SherloModule genuinely not linked.
        __turboModuleProxy: undefined,
        __r: releaseModeRequire,
        __d: originalD,
      };

      runPolyfill(fakeGlobal);

      // Trigger the module-eval capture path (reportToNative -> getSherloNativeModule())
      // by defining a module whose factory throws, the way a real module-eval
      // crash would. fakeGlobal.__d is now the polyfill's sherloGuardedDefine.
      const throwingFactory = () => {
        throw new Error('module-eval crash');
      };
      fakeGlobal.__d(throwingFactory, 'moduleId', []);
      const wrappedFactory = originalD.mock.calls[0][0];

      expect(() =>
        wrappedFactory(
          {},
          () => {},
          () => {},
          () => {},
          {},
          {},
          []
        )
      ).toThrow('module-eval crash');

      expect(releaseModeRequire).not.toHaveBeenCalled();
      expect(reportFatalError).not.toHaveBeenCalled();
    }
  );
});
