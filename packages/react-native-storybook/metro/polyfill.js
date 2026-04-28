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

  console.warn('[Sherlo] polyfill: typeof global.__r = ' + (typeof global.__r));
  if (typeof global.__r !== 'function') return;
  if (global.__sherloRequireWrapped) return;
  global.__sherloRequireWrapped = true;

  console.warn('[Sherlo] polyfill: __turboModuleProxy = ' + (typeof global.__turboModuleProxy));
  console.warn('[Sherlo] polyfill: nativeModuleProxy = ' + (typeof global.nativeModuleProxy));

  var isTesting = false;
  try {
    var nm = (global.__turboModuleProxy && global.__turboModuleProxy('SherloModule')) ||
             (global.nativeModuleProxy && global.nativeModuleProxy.SherloModule);
    console.warn('[Sherlo] polyfill: nm = ' + (nm ? 'found(type=' + typeof nm + ')' : 'null'));
    console.warn('[Sherlo] polyfill: nm.getMode type = ' + (nm && typeof nm.getMode));
    isTesting = !!(nm && typeof nm.getMode === 'function' && nm.getMode() === 'testing');
    var rawMode = nm && typeof nm.getMode === 'function' ? nm.getMode() : 'no-getMode';
    console.warn('[Sherlo] polyfill: rawMode = ' + rawMode + ', isTesting = ' + isTesting);
  } catch (_) {}
  if (!isTesting) return;

  console.warn('[Sherlo] polyfill: WRAPPING __r now');

  var originalRequire = global.__r;
  global.__r = function sherloGuardedRequire(moduleId) {
    try {
      return originalRequire(moduleId);
    } catch (e) {
      console.warn('[Sherlo] polyfill: __r caught error: ' + (e && e.message));
      try {
        var nm = (global.__turboModuleProxy && global.__turboModuleProxy('SherloModule')) ||
                 (global.nativeModuleProxy && global.nativeModuleProxy.SherloModule);
        if (nm && typeof nm.reportEarlyJsError === 'function') {
          nm.reportEarlyJsError(
            (e && e.name) || 'Error',
            (e && e.message) || String(e),
            (e && e.stack) || ''
          );
          console.warn('[Sherlo] polyfill: reportEarlyJsError invoked');
        }
      } catch (_) {}
      throw e;
    }
  };
})();
