'use strict';

//
// Sherlo metro polyfill — module-eval JS error capture.
//
// PRODUCTION SAFETY (read carefully):
// This file ships in EVERY customer bundle that uses withSherlo(), including
// production App Store / Play Store builds. It MUST be inert in production.
//
// The gate: globalThis.__sherloRuntimeMode_v1 is set by the SherloModule
// native binding (iOS RCTTurboModuleWithJSIBindings / Android
// TurboModuleWithJSIBindings) BEFORE this polyfill runs. The native binding
// reads the cached mode (determined at SherloModuleCore init by checking for
// the presence of a config file in the app's private documents directory).
//
// - Production app run (no config file): mode = 'default' -> we return early.
//   Customer cost: ~30 bytes in bundle + one global property read at startup.
// - Sherlo testing run (config file written by runner): mode = 'testing' ->
//   we wrap __r and capture module-eval JS errors via reportEarlyJsError.
//
// No customer configuration is required. No env vars. No build flags.
//
(function () {
  // EARLY EXIT for production. This is the load-bearing line.
  if (typeof globalThis === 'undefined') return;
  console.warn('[Sherlo:JS] polyfill loaded; __sherloRuntimeMode_v1=' + globalThis.__sherloRuntimeMode_v1);
  if (globalThis.__sherloRuntimeMode_v1 !== 'testing') return;

  // From here down: TESTING MODE ONLY. Code below this line never executes
  // in customer production builds.
  console.warn('[Sherlo:JS] gate passed, wrapping __r');

  if (typeof global === 'undefined') return;
  if (typeof global.__r !== 'function') return;
  if (global.__sherloRequireWrapped) return;
  global.__sherloRequireWrapped = true;

  var originalRequire = global.__r;
  global.__r = function sherloGuardedRequire(moduleId) {
    try {
      return originalRequire(moduleId);
    } catch (e) {
      console.warn('[Sherlo:JS] __r caught error: ' + (e && e.message));
      try {
        var nm = (global.__turboModuleProxy && global.__turboModuleProxy('SherloModule')) ||
                 (global.nativeModuleProxy && global.nativeModuleProxy.SherloModule);
        if (nm && typeof nm.reportEarlyJsError === 'function') {
          nm.reportEarlyJsError(
            (e && e.name) || 'Error',
            (e && e.message) || String(e),
            (e && e.stack) || ''
          );
          console.warn('[Sherlo:JS] reportEarlyJsError invoked');
        }
      } catch (_) { /* never throw from inside our error handler */ }
      throw e;
    }
  };
})();
