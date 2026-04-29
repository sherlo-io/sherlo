'use strict';

//
// Sherlo metro polyfill — JS error capture via ErrorUtils.setGlobalHandler + __d wrap.
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
// TWO complementary capture paths:
//
// 1. ErrorUtils.setGlobalHandler — catches module-eval throws in the ENTRY
//    module (Metro's guardedLoadModule → ErrorUtils.reportFatalError), async
//    unhandled rejections, and event-handler errors. Installed early in the
//    polyfill, before user entry.
//
// 2. __d wrap — wraps every module's factory function with try/catch.
//    Catches throws in module body regardless of how Metro's local metroRequire
//    (_$$_REQUIRE) was wired. Metro injects _$$_REQUIRE as a local reference
//    into each factory, so any global.__r replacement is bypassed for nested
//    calls; wrapping __d at the source is the only reliable way to catch
//    nested module-eval throws like App.tsx top-level errors.
//    The wrap rethrows after capturing so RN's native path still fires.
//
// Both paths share a single reportToNative helper and a __sherloFirstErrorReported
// flag to ensure only one report per session even if both paths fire for the
// same root cause.
//
// Customer cost: ~100 bytes in bundle + two lightweight installs.
//
// No customer configuration is required. No env vars. No build flags.
//
(function () {
  if (typeof globalThis === 'undefined') return;
  if (typeof global === 'undefined') return;

  function reportToNative(error) {
    if (global.__sherloFirstErrorReported) {
      console.warn('[Sherlo:JS] cascade error skipped: ' + (error && error.message));
      return;
    }
    try {
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
    } catch (innerErr) {
      console.warn('[Sherlo:JS] reportToNative threw: ' + (innerErr && innerErr.message));
    }
  }

  // 1. ErrorUtils.setGlobalHandler — catches async/event errors and entry-level throws
  if (global.ErrorUtils && typeof global.ErrorUtils.setGlobalHandler === 'function' && !global.__sherloGlobalHandlerInstalled) {
    global.__sherloGlobalHandlerInstalled = true;
    console.warn('[Sherlo:JS] polyfill installing ErrorUtils.setGlobalHandler');
    var prevHandler = typeof global.ErrorUtils.getGlobalHandler === 'function' ? global.ErrorUtils.getGlobalHandler() : null;
    global.ErrorUtils.setGlobalHandler(function (error, isFatal) {
      console.warn('[Sherlo:JS] ErrorUtils handler caught: ' + (error && error.message));
      reportToNative(error);
      if (prevHandler) {
        try { prevHandler(error, isFatal); } catch (_) {}
      }
    });
  }

  // 2. __d wrap — wraps every module's factory function with try/catch.
  //    Catches throws in module body regardless of nested _$$_REQUIRE chain
  //    (Metro's local metroRequire ref bypasses any global.__r replacement,
  //    so wrapping __d at the source is the only reliable way to catch
  //    nested module-eval throws like App.tsx top-level errors).
  if (typeof global.__d === 'function' && !global.__sherloDefineWrapped) {
    global.__sherloDefineWrapped = true;
    console.warn('[Sherlo:JS] polyfill installing __d wrap');
    var originalDefine = global.__d;
    global.__d = function sherloGuardedDefine(factory, moduleId, dependencyMap) {
      if (typeof factory !== 'function') {
        // Fallback for any unexpected shape — pass through unwrapped.
        return originalDefine.apply(this, arguments);
      }
      function wrappedFactory(globalObj, requireFn, importDefault, importAll, moduleObj, exportsObj, depMap) {
        try {
          return factory.call(this, globalObj, requireFn, importDefault, importAll, moduleObj, exportsObj, depMap);
        } catch (e) {
          console.warn('[Sherlo:JS] __d wrapped factory caught error: ' + (e && e.message));
          reportToNative(e);
          throw e;
        }
      }
      return originalDefine.call(this, wrappedFactory, moduleId, dependencyMap);
    };
  }
})();
