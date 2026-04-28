'use strict';

//
// Sherlo metro polyfill — module-eval JS error capture.
//
// PRODUCTION SAFETY (read carefully):
// This file ships in EVERY customer bundle that uses withSherlo(), including
// production App Store / Play Store builds. It MUST be inert in production.
//
// Design: the __r wrapper is ALWAYS installed (no early exit on mode at load
// time). The mode-check is deferred to error-time, inside the catch block.
// This eliminates a timing bug where the TurboModule JSI binding sets
// __sherloRuntimeMode_v1 AFTER the polyfill has already run its load-time gate.
//
// - Production app run (no config file): mode = 'default' (or undefined) when
//   an error fires -> catch block skips reportEarlyJsError. The error is still
//   rethrown so the original crash is fully preserved.
//   Customer cost: ~30 bytes in bundle + one lightweight try/catch wrap per
//   module require. try/catch with no thrown error is essentially free in
//   modern V8/Hermes engines.
// - Sherlo testing run (config file written by runner): mode = 'testing' when
//   an error fires -> catch block calls reportEarlyJsError to forward to native.
//
// Stack trace is captured at 'new Error()' construction in V8/Hermes, so the
// rethrow at the end preserves the original stack.
//
// No customer configuration is required. No env vars. No build flags.
//
(function () {
  if (typeof globalThis === 'undefined') return;
  console.warn('[Sherlo:JS] polyfill loaded; __sherloRuntimeMode_v1=' + globalThis.__sherloRuntimeMode_v1);
  console.warn('[Sherlo:JS] installing __r wrapper (mode-check deferred to error-time)');

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
      // Mode-check at error-time: only forward to native in testing mode.
      // Robust to JSI-binding timing — __sherloRuntimeMode_v1 may not be set
      // at polyfill-load time but will be set before any module-eval crash fires.
      if (globalThis.__sherloRuntimeMode_v1 === 'testing') {
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
      }
      throw e;
    }
  };
})();
