'use strict';

// Sherlo metro polyfill — module-eval error capture.
//
// Wraps global.__r (metro's require) to intercept errors thrown during module
// evaluation (e.g. a top-level `throw` in a story file). These happen before
// the SDK's SherloErrorBoundary is mounted, so componentDidCatch never fires.
//
// The wrapper calls SherloModule.reportEarlyJsError() — a blocking-synchronous
// native method — so the JS_ERROR is persisted before RN tears down the JS
// thread. It then re-throws so the standard fatal flow (redbox / native crash)
// continues unchanged.
//
// Guard: only active in testing mode. Returns immediately in production.
// Also guards against double-wrapping via __sherloRequireWrapped flag.
(function () {
  if (typeof global !== 'undefined' && typeof console !== 'undefined' && typeof console.warn === 'function') {
    console.warn('[Sherlo] metro polyfill loaded');
  }

  if (typeof global === 'undefined') return;
  if (typeof global.__r !== 'function') return;
  if (global.__sherloRequireWrapped) return;
  global.__sherloRequireWrapped = true;

  var isTesting = false;
  try {
    var nm = (global.__turboModuleProxy && global.__turboModuleProxy('SherloModule')) ||
             (global.nativeModuleProxy && global.nativeModuleProxy.SherloModule);
    isTesting = !!(nm && typeof nm.getMode === 'function' && nm.getMode() === 'testing');
  } catch (_) {}
  if (!isTesting) return;

  var originalRequire = global.__r;
  global.__r = function sherloGuardedRequire(moduleId) {
    try {
      return originalRequire(moduleId);
    } catch (e) {
      try {
        var nm = (global.__turboModuleProxy && global.__turboModuleProxy('SherloModule')) ||
                 (global.nativeModuleProxy && global.nativeModuleProxy.SherloModule);
        if (nm && typeof nm.reportEarlyJsError === 'function') {
          nm.reportEarlyJsError(
            (e && e.name) || 'Error',
            (e && e.message) || String(e),
            (e && e.stack) || ''
          );
        }
      } catch (_) {}
      throw e;
    }
  };
})();
