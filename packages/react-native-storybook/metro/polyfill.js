'use strict';

//
// Sherlo metro polyfill - JS error capture via ErrorUtils.setGlobalHandler + __d wrap.
//
// PRODUCTION SAFETY (read carefully):
// This file ships in every customer bundle that uses sherlo's withStorybook, including
// production App Store / Play Store builds.
//
// Production safety lives entirely on the native side: SherloModuleCore.reportEarlyJsError
// (both Android Java and iOS .mm) returns early if mode is not 'testing'. The JS side
// forwards unconditionally - this is intentional. A JS-side mode gate was previously
// tried and caused an Android race condition: the JSI binding
// (TurboModuleWithJSIBindings.getBindingsInstaller) can race module evaluation on
// Android, so the polyfill would sometimes check __sherloRuntimeMode_v1 before the
// JSI binding had a chance to write it. Result: polyfill silently no-ops → JS errors
// thrown during App.tsx top-level eval are never captured → runner times out and
// classifies as storybookNotDisplayed instead of jsLaunchCrash.
//
// TWO complementary capture paths:
//
// 1. ErrorUtils.setGlobalHandler - catches module-eval throws in the ENTRY
//    module (Metro's guardedLoadModule → ErrorUtils.reportFatalError), async
//    unhandled rejections, and event-handler errors. Installed early in the
//    polyfill, before user entry.
//
// 2. __d wrap - wraps every module's factory function with try/catch.
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
// Production cost: one try/catch wrapper per module factory call at startup
// (thousands of no-throw calls × nanoseconds = sub-millisecond). In production
// the native call is a no-op - native returns early before writing anything.
//
// No customer configuration is required. No env vars. No build flags.
//
(function () {
  if (typeof globalThis === 'undefined') return;
  if (typeof global === 'undefined') return;

  function reportToNative(error) {
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

  // 1. ErrorUtils.setGlobalHandler - catches async/event errors and entry-level throws
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

  // 2. __d wrap - wraps every module's factory function with try/catch.
  //    Catches throws in module body regardless of nested _$$_REQUIRE chain
  //    (Metro's local metroRequire ref bypasses any global.__r replacement,
  //    so wrapping __d at the source is the only reliable way to catch
  //    nested module-eval throws like App.tsx top-level errors).
  if (typeof global.__d === 'function' && !global.__sherloDefineWrapped) {
    global.__sherloDefineWrapped = true;
    var originalDefine = global.__d;
    global.__d = function sherloGuardedDefine(factory, moduleId, dependencyMap) {
      if (typeof factory !== 'function') {
        // Fallback for any unexpected shape - pass through unwrapped.
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
