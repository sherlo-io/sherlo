'use strict';

//
// Sherlo metro polyfill — module-eval JS error capture.
//
// PRODUCTION SAFETY (read carefully):
// This file ships in EVERY customer bundle that uses withSherlo(), including
// production App Store / Play Store builds.
//
// Production safety lives entirely on the native side: SherloModuleCore reads
// config.sherlo at dyld load time (__attribute__((constructor)) / SherloEarlyInit).
// In production, no config.sherlo file exists → mode = 'default' →
// reportEarlyJsError is a no-op on the native side (writes nothing).
//
// JS side forwards unconditionally — calling __turboModuleProxy('SherloModule')
// triggers lazy instantiation synchronously, native resolves mode from its
// already-loaded config, and in production the call returns silently.
// The original error is always rethrown unchanged.
//
// Customer cost: ~30 bytes in bundle + one lightweight try/catch wrap per
// module require. try/catch with no thrown error is essentially free in
// modern V8/Hermes engines.
//
// No customer configuration is required. No env vars. No build flags.
//
(function () {
  if (typeof globalThis === 'undefined') return;
  console.warn('[Sherlo:JS] polyfill loaded');
  console.warn('[Sherlo:JS] installing __r wrapper');

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
        } else {
          console.warn('[Sherlo:JS] SherloModule unavailable - skipping reportEarlyJsError');
        }
      } catch (innerErr) {
        console.warn('[Sherlo:JS] reportEarlyJsError threw: ' + (innerErr && innerErr.message));
      }
      throw e;
    }
  };
})();
