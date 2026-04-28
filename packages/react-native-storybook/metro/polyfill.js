'use strict';

//
// Sherlo metro polyfill — JS error capture via ErrorUtils.setGlobalHandler.
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
//
// Installing ErrorUtils.setGlobalHandler EARLY (in the polyfill, before user
// entry) catches module-eval throws (Metro's guardedLoadModule →
// ErrorUtils.reportFatalError), async unhandled rejections, and render /
// event-handler errors uniformly.  The previous __r wrap is no longer needed.
//
// Customer cost: ~50 bytes in bundle + one lightweight handler install.
//
// No customer configuration is required. No env vars. No build flags.
//
(function () {
  if (typeof globalThis === 'undefined') return;
  if (typeof global === 'undefined') return;
  if (!global.ErrorUtils || typeof global.ErrorUtils.setGlobalHandler !== 'function') return;
  if (global.__sherloGlobalHandlerInstalled) return;
  global.__sherloGlobalHandlerInstalled = true;

  console.warn('[Sherlo:JS] polyfill installing ErrorUtils.setGlobalHandler');

  var prevHandler = typeof global.ErrorUtils.getGlobalHandler === 'function'
    ? global.ErrorUtils.getGlobalHandler()
    : null;

  global.ErrorUtils.setGlobalHandler(function (error, isFatal) {
    try {
      if (!global.__sherloFirstErrorReported) {
        console.warn('[Sherlo:JS] ErrorUtils handler caught: ' + (error && error.message));
        var nm = (global.__turboModuleProxy && global.__turboModuleProxy('SherloModule')) ||
                 (global.nativeModuleProxy && global.nativeModuleProxy.SherloModule);
        if (nm && typeof nm.reportEarlyJsError === 'function') {
          nm.reportEarlyJsError(
            (error && error.name) || 'Error',
            (error && error.message) || String(error),
            (error && error.stack) || ''
          );
          global.__sherloFirstErrorReported = true;
          console.warn('[Sherlo:JS] reportEarlyJsError invoked (first error captured)');
        } else {
          console.warn('[Sherlo:JS] SherloModule unavailable - skipping');
        }
      } else {
        console.warn('[Sherlo:JS] ErrorUtils handler caught (cascade, skipping report): ' + (error && error.message));
      }
    } catch (innerErr) {
      console.warn('[Sherlo:JS] ErrorUtils handler threw: ' + (innerErr && innerErr.message));
    }
    if (prevHandler) {
      try { prevHandler(error, isFatal); } catch (_) {}
    }
  });
})();
