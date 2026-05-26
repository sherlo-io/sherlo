'use strict';

//
// Sherlo metro polyfill - JS error capture via ErrorUtils.setGlobalHandler + __d wrap.
//
// PRODUCTION SAFETY (read carefully):
// This file ships in every customer bundle that uses sherlo's withStorybook, including
// production App Store / Play Store builds.
//
// IIFE-TIME MODE GATE (TurboModule bridge call):
//
// The polyfill performs ONE TurboModule bridge call at IIFE time to determine mode.
// TurboModules are registered before bundle eval starts on both old and new arch, so
// nm.getSherloConstants() called at IIFE time returns the correct mode reliably.
//
// If mode is the literal string 'default' (production: config.sherlo absent or
// invalid, no Sherlo testing or inspect mode active), the IIFE returns immediately.
// The polyfill does NOTHING - no ErrorUtils handler install, no __d wrap,
// no captures, no 10s timer. Zero production overhead.
//
// For any other mode (testing, storybook, undefined, or a thrown exception during
// the read), the full polyfill body runs. Conservative default: when uncertain,
// run the polyfill.
//
// WHY THE BRIDGE CALL IS SAFE (and the JSI global is not):
//
// A previous attempt used globalThis.__sherloRuntimeMode_v1 as a gate and caused
// an Android race condition: the JSI binding (TurboModuleWithJSIBindings
// .getBindingsInstaller) can race module evaluation on Android, so the polyfill
// would sometimes read __sherloRuntimeMode_v1 before the JSI binding had written it.
//
// The TurboModule bridge call is a separate, more deterministic mechanism. TurboModules
// are registered before bundle eval begins. The JSI global write can race; the bridge
// call cannot. Do NOT use __sherloRuntimeMode_v1 or any JSI-set global as a gate.
// The single IIFE-time bridge call is the only gate; do NOT add mode-check gates
// inside individual handlers or wrappers.
//
// TWO complementary capture paths (active when mode is not 'default'):
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
//    nested module-eval throws.
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

  function getSherloNativeModule() {
    // Each attempt is isolated: a throw in one does not block the next.
    try {
      if (global.__turboModuleProxy) {
        var tm = global.__turboModuleProxy('SherloModule');
        if (tm) return tm;
      }
    } catch (_) {}
    try {
      // RN 0.81 old-arch: nativeModuleProxy may exist but return null for non-TurboModules.
      // Kept isolated so a JSI property-access throw doesn't suppress the __r fallback.
      if (global.nativeModuleProxy && global.nativeModuleProxy.SherloModule) {
        return global.nativeModuleProxy.SherloModule;
      }
    } catch (_) {}
    try {
      // Works when 'react-native' is in the bundle (all real apps, some test variants).
      // At polyfill IIFE time this will fail (modules not defined yet); error-handler
      // callers benefit once module factories have been registered via __d().
      if (typeof global.__r === 'function') {
        var rn = global.__r('react-native');
        if (rn && rn.NativeModules && rn.NativeModules.SherloModule) {
          return rn.NativeModules.SherloModule;
        }
      }
    } catch (_) {}
    return null;
  }

  // DIAGNOSTIC: mode-probe block temporarily removed to test iOS-new × preview crash.
  // Hypothesis (Brain, 2026-05-25): calling global.__turboModuleProxy('SherloModule')
  // during debugJavaScript on iOS new-arch (RN 0.81 bare, Fabric/ReactInstance)
  // causes a SIGSEGV before JS execution completes. Removed to isolate the cause.
  // TODO: restore or replace with a safe alternative once root cause confirmed.

  function reportToNative(error) {
    if (global.__sherloFirstErrorReported) return;
    try {
      var nm = getSherloNativeModule();
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
  //    nested module-eval throws).
  //    Rethrows after capturing so RN's native path still fires.
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
  // 3. ERROR_STORYBOOK_NOT_DISPLAYED timer - JS-side watchdog, covers new-arch where
  //    JS setTimeout reliably fires. The native-side timer (SherloInitProvider /
  //    SherloModuleCore) covers old-arch where this JS callback may not reach native.
  //    Both run (defense in depth); duplicate entries are fine (test expects any entry).
  if (!global.__sherloStorybookNotDisplayedTimerInstalled && typeof setTimeout === 'function') {
    global.__sherloStorybookNotDisplayedTimerInstalled = true;
    setTimeout(function () {
      try {
        if (global.__sherloStorybookRendered === true) return;
        var sherloNm = getSherloNativeModule();
        if (!sherloNm) return;
        var turboConsts = (typeof sherloNm.getSherloConstants === 'function' && sherloNm.getSherloConstants()) || {};
        var nativeConsts = (typeof sherloNm.getConstants === 'function' && sherloNm.getConstants()) || {};
        var mode = turboConsts.mode || nativeConsts.mode || sherloNm.mode;
        if (mode !== 'testing') return;
        if (typeof sherloNm.sendNativeError === 'function') {
          sherloNm.sendNativeError('ERROR_STORYBOOK_NOT_DISPLAYED', 'Storybook did not appear within 10s of app launch', '');
        }
      } catch (e) {}
    }, 10000);
  }
})();
