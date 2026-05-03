'use strict';

//
// Sherlo metro polyfill — JS error capture via ErrorUtils.setGlobalHandler + __d wrap.
//
// PRODUCTION SAFETY (read carefully):
// This file ships in EVERY customer bundle that uses withSherlo(), including
// production App Store / Play Store builds.
//
// Both handlers (ErrorUtils.setGlobalHandler + __d wrap) install unconditionally —
// the work is cheap and one-time. The mode check lives inside reportToNative so
// by the time an actual error fires, the JSI binding has had time to write
// globalThis.__sherloRuntimeMode_v1 and the check is reliable. An install-time
// gate was previously tried but races against module evaluation order: the polyfill
// can run before the JSI binding sets the global, causing JS errors thrown during
// App.tsx top-level eval to go unreported (runner sees storybookNotDisplayed
// instead of jsLaunchCrash).
//
// Production cost: one try/catch wrapper per module factory call at startup
// (thousands of no-throw calls × nanoseconds = sub-millisecond), plus the two
// install-time registrations. reportToNative starts with a property read and
// silently returns if mode is not 'testing' — zero observable impact in production
// unless an error is actually thrown.
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
// No customer configuration is required. No env vars. No build flags.
//
(function () {
  if (typeof globalThis === 'undefined') return;
  if (typeof global === 'undefined') return;

  function reportToNative(error) {
    // Mode gate lives here (not at install time) to avoid a race between polyfill
    // eval and the JSI binding writing __sherloRuntimeMode_v1.
    if (global.__sherloRuntimeMode_v1 !== 'testing') return;
    if (global.__sherloFirstErrorReported) return;
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
      }
    } catch (_) {}
  }

  // 1. ErrorUtils.setGlobalHandler — catches async/event errors and entry-level throws
  if (global.ErrorUtils && typeof global.ErrorUtils.setGlobalHandler === 'function' && !global.__sherloGlobalHandlerInstalled) {
    global.__sherloGlobalHandlerInstalled = true;
    var prevHandler = typeof global.ErrorUtils.getGlobalHandler === 'function' ? global.ErrorUtils.getGlobalHandler() : null;
    global.ErrorUtils.setGlobalHandler(function (error, isFatal) {
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
          reportToNative(e);
          throw e;
        }
      }
      return originalDefine.call(this, wrappedFactory, moduleId, dependencyMap);
    };
  }
})();
