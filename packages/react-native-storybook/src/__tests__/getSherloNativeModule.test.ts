/**
 * Unit tests for getSherloNativeModule's release-build safety.
 *
 * The third probe (global.__r('react-native') to reach NativeModules) was removed
 * from metro/polyfill.js: metro-runtime's metroRequire only resolves a string module
 * id when __DEV__ is true. In a release bundle it is passed straight through,
 * modules.get() misses, and guardedLoadModule's catch routes the resulting
 * unknownModuleError to ErrorUtils.reportFatalError instead of throwing - so a
 * try/catch around the call never runs and the app is fatally killed ~10s after JS
 * start, once the ERROR_STORYBOOK_NOT_DISPLAYED timer calls getSherloNativeModule()
 * and probes 1-2 (TurboModuleProxy / nativeModuleProxy) both miss.
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
    'does not call global.__r and does not trigger a fatal error when probes 1-2 ' +
      'miss in a release bundle (__DEV__ false, string module ids unresolved)',
    () => {
      vi.useFakeTimers();
      try {
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

        const fakeGlobal: Record<string, any> = {
          ErrorUtils: {
            setGlobalHandler: vi.fn(),
            getGlobalHandler: vi.fn(() => null),
            reportFatalError,
          },
          // Probes 1 & 2 both miss - SherloModule genuinely not linked.
          __turboModuleProxy: undefined,
          nativeModuleProxy: {},
          __r: releaseModeRequire,
        };

        runPolyfill(fakeGlobal);

        // Fires the ERROR_STORYBOOK_NOT_DISPLAYED timer, which calls
        // getSherloNativeModule() again after module factories would have registered.
        vi.advanceTimersByTime(10000);

        expect(releaseModeRequire).not.toHaveBeenCalled();
        expect(reportFatalError).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    }
  );
});
