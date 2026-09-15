'use strict';

//
// Sherlo metro polyfill - JS error capture via ErrorUtils.setGlobalHandler + __d wrap.
//
// PRODUCTION SAFETY (read carefully):
// This file ships in every customer bundle that uses sherlo's withStorybook, including
// production App Store / Play Store builds.
//
// THIS FILE DECIDES NOTHING. Metro polyfills are concatenated into the bundle
// AS SOURCE TEXT, not as resolvable modules - nothing spliced in later can
// replace it, so whatever it does is frozen at the CUSTOMER'S build, forever.
// It installs hooks, records facts, and forwards every capture to native
// through the frozen reportEarlyJsError method (which the shim answers
// locally when nothing is injected, and forwards through the ABI when
// something is - see ios/SherloImplV1.h). It decides no policy of its own:
// no AppRegistry boundary, no watchdog timer. Both used to live here, and
// both are now the attached implementation's problem, which can be corrected
// without every customer rebuilding.
//
// IIFE-TIME MODE GATE (TurboModule bridge call):
//
// The FIRST statement inside the IIFE sets global.__sherloWithStorybookApplied = true.
// This is an in-memory boolean only; src/index.ts reads it at SDK-import time for
// WSU (withStorybook-applied) detection. It must be set BEFORE any early return.
//
// Immediately after, the polyfill performs ONE TurboModule bridge call to query mode.
// TurboModules are registered before bundle eval starts on both old and new arch, so
// the bridge call is deterministic (no race condition).
//
// If mode is 'default' OR 'storybook', the IIFE returns immediately after setting the
// flag. The polyfill body (ErrorUtils handler install, __d wrap) does NOT run. Zero
// production/storybook overhead.
//
// Only when mode === 'testing' does the full polyfill body execute.
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
// TWO complementary capture paths (active when mode === 'testing'):
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

// Protocol file constants - keep in sync with src/constants.ts.
// polyfill.js cannot import from compiled dist/ (it runs before the bundle is fully evaluated).
var LOG_FILE = 'log.sherlo';
var PROTOCOL_FILE = 'protocol.sherlo';

(function () {
  if (typeof globalThis === 'undefined') return;
  if (typeof global === 'undefined') return;

  // Mark first - SDK's WSU detection (src/index.ts) reads this at import time.
  // Must be set BEFORE early return so detection still works when customer's
  // app is imported under testing mode later in the same session.
  global.__sherloWithStorybookApplied = true;

  // IIFE-time mode gate: customer is not running Sherlo visual tests -> no-op.
  //
  // The resolved mode is recorded on global.__sherloPolyfillFacts BEFORE the
  // early return below, whichever branch is taken - so a test evaluating this
  // file against a fake proxy can assert what the gate actually saw, not just
  // its effect (the early return itself is silent from the outside).
  var _gateMode = 'no-shim';
  try {
    var _gateNm = global.__turboModuleProxy ? global.__turboModuleProxy('SherloModule') : null;
    if (_gateNm && typeof _gateNm.getSherloConstants === 'function') {
      var _gateC = _gateNm.getSherloConstants();
      _gateMode = (_gateC && _gateC.mode) || 'no-shim';
    }
  } catch (_) {
    // Probe threw - conservative default: continue (run full body) with mode
    // left at 'no-shim', a fact rather than a guess.
  }
  global.__sherloPolyfillFacts = { mode: _gateMode };

  if (_gateMode === 'default' || _gateMode === 'storybook') {
    return;
  }

  function getSherloNativeModule() {
    // RN 0.76 New Architecture only - a single probe, no old-arch fallback.
    try {
      if (global.__turboModuleProxy) {
        var tm = global.__turboModuleProxy('SherloModule');
        if (tm) return tm;
      }
    } catch (_) {}
    // NOTE: a second fallback via global.__r('react-native') used to live here and was
    // removed. Metro's string-to-moduleId resolution (getModuleIdForVerboseName) only
    // runs under __DEV__ (see metro-runtime/src/polyfills/require.js) - in release
    // builds global.__r('react-native') looks up the literal string 'react-native' in
    // a Map keyed by numeric module ids, always misses, and falls through to Metro's
    // guardedLoadModule, which calls global.ErrorUtils.reportFatalError() on the miss.
    // Since that call can happen while this very function is being invoked from inside
    // reportToNative() (itself invoked from an ErrorUtils/1 __d-wrap handler), it risked
    // recursively re-entering the same reporting path for a bogus "unknown module" error
    // instead of - or interleaved with - the real one. It never provided real coverage in
    // release (the only mode this polyfill's capture logic is active in - see IIFE-time
    // mode gate above), so removing it is a strict improvement.
    return null;
  }

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

  // 0. globalThis.reportError interceptor - React 19 routes uncaught render-time errors
  //    through globalThis.reportError() (defaultOnUncaughtError → reportGlobalError).
  //    Installing BEFORE ErrorUtils.setGlobalHandler ensures we intercept before the
  //    SDK's setupErrorSilencing replaces console.error with a no-op, which would
  //    otherwise swallow the error before it reaches ExceptionsManager or native handlers.
  //    Reuses the existing reportToNative helper (same sync path as module-eval errors;
  //    reportEarlyJsError is a synchronous TurboModule call returning boolean).
  if (typeof globalThis !== 'undefined' && !globalThis.__sherloReportErrorInstalled) {
    globalThis.__sherloReportErrorInstalled = true;
    var __sherloPrevReportError = globalThis.reportError;
    globalThis.reportError = function (err) {
      try {
        reportToNative(err);
      } catch (_) {}
      if (typeof __sherloPrevReportError === 'function') {
        try {
          __sherloPrevReportError.call(globalThis, err);
        } catch (_) {}
      }
    };
  }

  // 1. ErrorUtils deferred handler - catches async/event errors and entry-level throws.
  //    We DEFER installing until after ExceptionsManager has run, because
  //    ExceptionsManager unconditionally calls setGlobalHandler() during module
  //    evaluation and would OVERWRITE an early-installed handler (spike finding #2).
  //    We late-install by wrapping whatever handler ExceptionsManager set, chaining to it.
  //    Scheduled via Promise.resolve().then() at the bottom of the IIFE so it runs
  //    after all synchronous module evaluation completes.
  function installSherloErrorUtilsHandler() {
    try {
      var EU = typeof ErrorUtils !== 'undefined' ? ErrorUtils : global && global.ErrorUtils;
      if (
        !EU ||
        typeof EU.getGlobalHandler !== 'function' ||
        typeof EU.setGlobalHandler !== 'function'
      ) {
        return;
      }
      var existing = EU.getGlobalHandler();
      if (existing && existing.__sherlo) {
        return;
      }
      function sherloWrapping(error, isFatal) {
        try {
          reportToNative(error);
        } catch (_) {}
        if (typeof existing === 'function') {
          try {
            existing(error, isFatal);
          } catch (_) {}
        }
      }
      sherloWrapping.__sherlo = true;
      EU.setGlobalHandler(sherloWrapping);
    } catch (err) {}
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
      function wrappedFactory(
        globalObj,
        requireFn,
        importDefault,
        importAll,
        moduleObj,
        exportsObj,
        depMap
      ) {
        try {
          return factory.call(
            this,
            globalObj,
            requireFn,
            importDefault,
            importAll,
            moduleObj,
            exportsObj,
            depMap
          );
        } catch (e) {
          reportToNative(e);
          throw e;
        }
      }
      return originalDefine.call(this, wrappedFactory, moduleId, dependencyMap);
    };
  }
  // 1b. Schedule the deferred ErrorUtils handler install via microtask.
  //     By the time this microtask runs, ExceptionsManager's setGlobalHandler call
  //     (synchronous, during module evaluation) will already have completed, so
  //     installSherloErrorUtilsHandler wraps it rather than getting overwritten by it.
  try {
    Promise.resolve().then(installSherloErrorUtilsHandler);
  } catch (_) {}
})();
