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
// The FIRST statement inside the IIFE sets global.__sherloWithStorybookApplied = true.
// This is an in-memory boolean only; src/index.ts reads it at SDK-import time for
// WSU (withStorybook-applied) detection. It must be set BEFORE any early return.
//
// Immediately after, the polyfill performs ONE TurboModule bridge call to query mode.
// TurboModules are registered before bundle eval starts on both old and new arch, so
// the bridge call is deterministic (no race condition).
//
// If mode is 'default' OR 'storybook', the IIFE returns immediately after setting the
// flag. The polyfill body (ErrorUtils handler install, __d wrap, AppRegistry wrap,
// 10s NOT_DISPLAYED timer) does NOT run. Zero production/storybook overhead.
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
  try {
    var _gateNm = global.__turboModuleProxy ? global.__turboModuleProxy('SherloModule') : null;
    if (!_gateNm && global.nativeModuleProxy && global.nativeModuleProxy.SherloModule) {
      _gateNm = global.nativeModuleProxy.SherloModule;
    }
    if (_gateNm) {
      var _gateC = (typeof _gateNm.getSherloConstants === 'function' ? _gateNm.getSherloConstants() : null) ||
                   (typeof _gateNm.getConstants === 'function' ? _gateNm.getConstants() : null);
      var _gateMode = _gateC && _gateC.mode;
      if (_gateMode === 'default' || _gateMode === 'storybook') {
        return;
      }
    }
  } catch (_) {
    // Probe threw - conservative default: continue (run full body).
  }

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

  // Stash a reference to React when we see it (any module whose exports has both
  // createElement and Component as functions).
  function maybeCaptureReact(_e) {
    if (global.__sherloReactRef) return;
    if (!_e) return;
    if (typeof _e.createElement === 'function' && typeof _e.Component === 'function') {
      global.__sherloReactRef = _e;
    }
  }

  // Stash a reference to the SDK's wrapped SherloModule when we see it.
  // Shape: object with appendFile + getMode + sendNativeError functions.
  // The SDK wrapper handles utf8 + base64 encoding, which the raw TurboModule
  // expects. Calling the raw TurboModule directly with a plain JSON string
  // would write garbled binary to protocol.sherlo (decoded as base64).
  function maybeCaptureSherloModule(_e) {
    if (global.__sherloModuleRef) return;
    if (!_e) return;
    var candidate = _e.default || _e;
    if (candidate &&
        typeof candidate.appendFile === 'function' &&
        typeof candidate.getMode === 'function' &&
        typeof candidate.sendNativeError === 'function') {
      global.__sherloModuleRef = candidate;
    }
  }

  // Stash a reference to the metro-wrapped @storybook/react-native module.
  // The metro wrapper exposes __sherloStorybookEntry (lazy loader) and
  // __sherloStorybookConfigPath. Used by the sherloAtRoot branch to load the
  // user's Storybook config entry as the AppRegistry root.
  function maybeCaptureStorybookMod(_e) {
    if (global.__sherloStorybookMod) return;
    if (!_e) return;
    if (typeof _e.__sherloStorybookEntry !== 'undefined' ||
        typeof _e.__sherloStorybookConfigPath !== 'undefined') {
      global.__sherloStorybookMod = _e;
    }
  }

  // Patch AppRegistry.registerComponent to wrap the root component in a
  // polyfill-level SherloErrorBoundary. React is resolved lazily at call time
  // from the globally stashed reference.
  function patchAppRegistry(AR) {
    if (!AR || typeof AR.registerComponent !== 'function') return;
    if (AR.__sherloBoundaryPatched) return;

    // Production safety + storybook-mode safety: only patch in testing mode.
    // Mode is queryable here because module factories run after native
    // SherloModule is fully initialized.
    var nm = getSherloNativeModule();
    if (!nm) {
      return;
    }
    var mode = null;
    var config = null;
    try {
      var c = (typeof nm.getSherloConstants === 'function' ? nm.getSherloConstants() : null) ||
              (typeof nm.getConstants === 'function' ? nm.getConstants() : null);
      mode = c && c.mode;
      var configString = c && c.config;
      if (configString) {
        try { config = JSON.parse(configString); } catch (_) {}
      }
    } catch (_) {}

    if (mode !== 'testing') {
      return;
    }

    AR.__sherloBoundaryPatched = true;
    var sherloAtRoot = !!(config && config.sherloAtRoot === true);

    var orig = AR.registerComponent.bind(AR);
    AR.registerComponent = function sherloRegisterComponentPolyfill(appKey, componentProvider) {
      return orig(appKey, function () {
        var React = global.__sherloReactRef;
        if (!React) {
          return componentProvider();
        }

        function SherloErrorBoundaryP(props) {
          React.Component.call(this, props);
          this.state = { caught: false };
        }
        SherloErrorBoundaryP.prototype = Object.create(React.Component.prototype);
        SherloErrorBoundaryP.prototype.constructor = SherloErrorBoundaryP;
        SherloErrorBoundaryP.displayName = 'SherloErrorBoundary';
        SherloErrorBoundaryP.getDerivedStateFromError = function (_error) {
          return { caught: true };
        };
        SherloErrorBoundaryP.prototype.componentDidCatch = function (error, _info) {
          try {
            var sherloMod = global.__sherloModuleRef;
            if (sherloMod && typeof sherloMod.appendFile === 'function') {
              var data = {
                name: (error && error.name) || 'Error',
                message: (error && error.message) || String(error),
                stack: (error && error.stack) || '',
                componentStack: ''
              };
              var entry = { action: 'JS_ERROR', timestamp: Date.now(), entity: 'app', data: data };
              sherloMod.appendFile(PROTOCOL_FILE, JSON.stringify(entry) + '\n');
            }
          } catch (_) {}
          try {
            if (global.ErrorUtils && typeof global.ErrorUtils.reportFatalError === 'function') {
              global.ErrorUtils.reportFatalError(error);
            }
          } catch (_) {}
        };
        SherloErrorBoundaryP.prototype.render = function () {
          return this.state.caught ? null : this.props.children;
        };

        // sherloAtRoot branch: substitute root with the user's Storybook entry.
        // Mirrors SDK src/index.ts SherloRootWrapperAtRoot logic.
        if (sherloAtRoot) {
          var sbMod = global.__sherloStorybookMod;
          if (!sbMod) {
            return componentProvider();
          }
          var loader = sbMod.__sherloStorybookEntry;
          var configPath = sbMod.__sherloStorybookConfigPath;
          if (typeof loader !== 'function') {
            return componentProvider();
          }
          var storybookIndexMod;
          try { storybookIndexMod = loader(); } catch (_) {
            return componentProvider();
          }
          var UserStorybookEntry = storybookIndexMod && storybookIndexMod.default;
          if (!UserStorybookEntry) {
            return componentProvider();
          }
          function SherloRootWrapperAtRootP(props) {
            return React.createElement(
              SherloErrorBoundaryP,
              null,
              React.createElement(UserStorybookEntry, props)
            );
          }
          SherloRootWrapperAtRootP.displayName = 'SherloRoot(sherloAtRoot)';
          SherloRootWrapperAtRootP._sherloWrapped = true;
          return SherloRootWrapperAtRootP;
        }

        // Default branch: wrap user's component in boundary.
        var Component = componentProvider();
        if (!Component || Component._sherloWrapped) return Component;
        function SherloRootP(props) {
          return React.createElement(SherloErrorBoundaryP, null, React.createElement(Component, props));
        }
        SherloRootP._sherloWrapped = true;
        SherloRootP.displayName = 'SherloRoot(' + ((Component && (Component.displayName || Component.name)) || appKey) + ')';
        return SherloRootP;
      });
    };
  }

  function reportToNative(error) {
    if (global.__sherloFirstErrorReported) return;
    // Stash the original JS error in a global so the native exception handler can
    // recover the real message if the bridge-call path fails (e.g. on old-arch Android,
    // getSherloNativeModule() returns null and the C++ layer produces a secondary
    // "Could not get BatchedBridge" exception that would otherwise overwrite the message).
    // The native SherloJSExceptionCapture reads this via JSI on the same JS thread.
    try {
      global.__sherloLastJsError = {
        name: (error && error.name) || 'Error',
        message: (error && error.message) || String(error),
        stack: (error && error.stack) || ''
      };
    } catch (_) {}
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
      try { reportToNative(err); } catch (_) {}
      if (typeof __sherloPrevReportError === 'function') {
        try { __sherloPrevReportError.call(globalThis, err); } catch (_) {}
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
      var EU = (typeof ErrorUtils !== 'undefined') ? ErrorUtils : (global && global.ErrorUtils);
      if (!EU || typeof EU.getGlobalHandler !== 'function' || typeof EU.setGlobalHandler !== 'function') {
        return;
      }
      var existing = EU.getGlobalHandler();
      if (existing && existing.__sherlo) {
        return;
      }
      function sherloWrapping(error, isFatal) {
        try { reportToNative(error); } catch (_) {}
        if (typeof existing === 'function') {
          try { existing(error, isFatal); } catch (_) {}
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
      function wrappedFactory(globalObj, requireFn, importDefault, importAll, moduleObj, exportsObj, depMap) {
        // Install a setter trap so we can intercept _e.AppRegistry = t synchronously.
        // (UNCONDITIONAL - patchAppRegistry has its own internal mode gate via
        // getSherloConstants. Gating this trap on a JSI-set global risks Android races.)
        try {
          var _arValue;
          Object.defineProperty(exportsObj, 'AppRegistry', {
            configurable: true,
            enumerable: false,
            get: function () { return _arValue; },
            set: function (v) {
              _arValue = v;
              // RN's AR re-exporter writes `_e.AppRegistry = void 0` first, then
              // `_e.AppRegistry = t`; keep the trap armed across the void-0 init.
              if (v && typeof v.registerComponent === 'function') {
                try { patchAppRegistry(v); } catch (_) {}
                try {
                  Object.defineProperty(exportsObj, 'AppRegistry', {
                    value: v,
                    writable: true,
                    enumerable: true,
                    configurable: true,
                  });
                } catch (_) {}
              }
            }
          });
        } catch (_) {}

        try {
          return factory.call(this, globalObj, requireFn, importDefault, importAll, moduleObj, exportsObj, depMap);
        } catch (e) {
          reportToNative(e);
          throw e;
        } finally {
          try { maybeCaptureReact(exportsObj); } catch (_) {}
          try { maybeCaptureSherloModule(exportsObj); } catch (_) {}
          try { maybeCaptureStorybookMod(exportsObj); } catch (_) {}
          // Prong 1 - patch global.RN$AppRegistry directly (new arch).
          // The setter trap on exportsObj.AppRegistry gets overwritten by RN's own
          // getter-only Object.defineProperty redefinition (spike finding #1), so we
          // can't rely on it. New arch publishes AppRegistry as global.RN$AppRegistry
          // - patch that reference directly after each module factory runs.
          try {
            var _arGlobal = (typeof global !== 'undefined' && global.RN$AppRegistry) ||
                            (typeof globalThis !== 'undefined' && globalThis.RN$AppRegistry);
            if (_arGlobal && !_arGlobal.__sherloBoundaryPatched) {
              patchAppRegistry(_arGlobal);
            }
          } catch (_) {}
        }
      }
      return originalDefine.call(this, wrappedFactory, moduleId, dependencyMap);
    };
  }
  // 1b. Schedule the deferred ErrorUtils handler install via microtask.
  //     By the time this microtask runs, ExceptionsManager's setGlobalHandler call
  //     (synchronous, during module evaluation) will already have completed, so
  //     installSherloErrorUtilsHandler wraps it rather than getting overwritten by it.
  try { Promise.resolve().then(installSherloErrorUtilsHandler); } catch (_) {}

  // 3. ERROR_STORYBOOK_NOT_DISPLAYED timer - fires if the Sherlo Storybook wrapper
  //    was never mounted (e.g. user forgot to wire getStorybook in App.tsx).
  //    Runs unconditionally at boot so the error is detected even when the wrapper
  //    component's useEffect never executes. Mode is read lazily inside the callback
  //    (after 10s) to avoid the Android JSI race condition described above.
  //    global.__sherloStorybookRendered is set by Storybook.tsx when the wrapper renders.
  //    Error code source of truth: src/checkSdkCompatibility.ts
  //    setTimeout may not be available at IIFE time on old-arch Expo 52 (bridge timers
  //    polyfill loads after metro polyfills); the try/catch prevents a polyfill crash.
  try {
    if (!global.__sherloStorybookNotDisplayedTimerInstalled) {
      global.__sherloStorybookNotDisplayedTimerInstalled = true;
      setTimeout(function () {
        try {
          if (global.__sherloStorybookRendered === true) return;
          var sherloNm = getSherloNativeModule();
          if (!sherloNm) return;
          var turboConsts = (typeof sherloNm.getSherloConstants === 'function' && sherloNm.getSherloConstants()) || {};
          var nativeConsts = (typeof sherloNm.getConstants === 'function' && sherloNm.getConstants()) || {};
          var mode = turboConsts.mode || nativeConsts.mode;
          if (mode !== 'testing') return;
          var ref = global.__sherloModuleRef;
          if (ref && typeof ref.sendNativeError === 'function') {
            ref.sendNativeError('ERROR_STORYBOOK_NOT_DISPLAYED', 'Storybook did not appear within 10s of app launch');
          } else if (typeof sherloNm.sendNativeError === 'function') {
            sherloNm.sendNativeError('ERROR_STORYBOOK_NOT_DISPLAYED', 'Storybook did not appear within 10s of app launch', '');
          }
        } catch (_) {}
      }, 10000);
    }
  } catch (_) {}
})();
