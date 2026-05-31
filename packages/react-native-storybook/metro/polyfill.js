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

// Protocol file constants - keep in sync with src/constants.ts.
// polyfill.js cannot import from compiled dist/ (it runs before the bundle is fully evaluated).
var LOG_FILE = 'log.sherlo';
var PROTOCOL_FILE = 'protocol.sherlo';

(function () {
  if (typeof globalThis === 'undefined') return;
  if (typeof global === 'undefined') return;

  // ── DIAGNOSTIC SPIKE: pure observation, no behavior changes ───────────────
  // diagLog writes to:
  // 1. console.log (Metro/logcat/Xcode) always
  // 2. protocol.sherlo via __sherloModuleRef.appendFile (when available, fire-and-forget)
  //    Using action 'DIAG_...' prefix which the harness pulls but skips as "meaningful".
  //    This survives the test run and is visible in readProtocol() output.
  var _diagSeq = 0;
  function diagLog(msg) {
    try {
      var line = '[sherlo-diag] ' + (typeof msg === 'string' ? msg : JSON.stringify(msg));
      console.log(line);
    } catch (_) {}
    try {
      var ref = global.__sherloModuleRef;
      if (ref && typeof ref.appendFile === 'function') {
        var entry = { action: 'DIAG_POLYFILL', seq: ++_diagSeq, msg: msg, ts: Date.now() };
        ref.appendFile(PROTOCOL_FILE, JSON.stringify(entry) + '\n');
      }
    } catch (_) {}
  }

  diagLog('polyfill IIFE entered');

  // Arch detection (best-effort at IIFE time).
  try {
    var _hasTMP = !!(global.__turboModuleProxy);
    var _hasNMP = !!(global.nativeModuleProxy);
    diagLog('arch detected: turboModuleProxy=' + _hasTMP + ' nativeModuleProxy=' + _hasNMP);
  } catch (_) {
    diagLog('arch detected: probe threw');
  }

  // Mode probe note: mode probe block was removed from IIFE (see comment below).
  // Mode will be detected later in patchAppRegistry() after module factories run.
  diagLog('sherlo mode detected: IIFE-time probe removed (see DIAGNOSTIC comment) - mode deferred to patchAppRegistry');

  // RN version: modules not yet resolved at polyfill IIFE time; best-effort via PlatformConstants.
  try {
    var _pc = (global.nativeModuleProxy && global.nativeModuleProxy.PlatformConstants) ||
              (global.__turboModuleProxy && global.__turboModuleProxy('PlatformConstants'));
    if (_pc) {
      var _rnVer = (_pc.reactNativeVersion && (
        (_pc.reactNativeVersion.major || '?') + '.' +
        (_pc.reactNativeVersion.minor || '?') + '.' +
        (_pc.reactNativeVersion.patch || '?')
      )) || 'unknown';
      diagLog('RN version: ' + _rnVer);
    } else {
      diagLog('RN version: PlatformConstants unavailable at IIFE time');
    }
  } catch (_) {
    diagLog('RN version: probe threw');
  }

  // Mark that sherlo's Metro polyfill is in the bundle. This is the bridge-independent
  // signal of "withStorybook was applied to the user's Metro config". src/index.ts reads
  // this global at SDK-import time and emits the WITHSTORYBOOK_APPLIED protocol marker.
  global.__sherloWithStorybookApplied = true;

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

  // Stash a reference to React when we see it (any module whose exports has both
  // createElement and Component as functions).
  function maybeCaptureReact(_e) {
    if (global.__sherloReactRef) return;
    if (!_e) return;
    if (typeof _e.createElement === 'function' && typeof _e.Component === 'function') {
      global.__sherloReactRef = _e;
      diagLog('React version: ' + (_e.version || 'unknown'));
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
    diagLog('patchAppRegistry called - SherloErrorBoundary will wrap root');
    if (!AR || typeof AR.registerComponent !== 'function') return;
    if (AR.__sherloBoundaryPatched) return;

    // Production safety + storybook-mode safety: only patch in testing mode.
    // Mode is queryable here because module factories run after native
    // SherloModule is fully initialized.
    var nm = getSherloNativeModule();
    if (!nm) {
      diagLog('patchAppRegistry: getSherloNativeModule() returned null - skipping patch');
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

    diagLog('sherlo mode detected: ' + mode + ' (from getSherloConstants in patchAppRegistry)');
    if (mode !== 'testing') {
      diagLog('patchAppRegistry: mode is not testing (' + mode + ') - skipping patch');
      return;
    }

    AR.__sherloBoundaryPatched = true;
    diagLog('patchAppRegistry: installing SherloErrorBoundary wrapper on AppRegistry.registerComponent');
    var sherloAtRoot = !!(config && config.sherloAtRoot === true);

    var orig = AR.registerComponent.bind(AR);
    AR.registerComponent = function sherloRegisterComponentPolyfill(appKey, componentProvider) {
      return orig(appKey, function () {
        var React = global.__sherloReactRef;
        if (!React) {
          return componentProvider();
        }

        function SherloErrorBoundaryP(props) {
          diagLog('SherloErrorBoundary.constructor called for root');
          React.Component.call(this, props);
          this.state = { caught: false };
        }
        SherloErrorBoundaryP.prototype = Object.create(React.Component.prototype);
        SherloErrorBoundaryP.prototype.constructor = SherloErrorBoundaryP;
        SherloErrorBoundaryP.displayName = 'SherloErrorBoundary';
        SherloErrorBoundaryP.getDerivedStateFromError = function (_error) {
          diagLog('SherloErrorBoundary.getDerivedStateFromError called with: ' + ((_error && _error.message) || String(_error)));
          return { caught: true };
        };
        SherloErrorBoundaryP.prototype.componentDidCatch = function (error, _info) {
          diagLog('SherloErrorBoundary.componentDidCatch called with: ' + ((error && error.message) || String(error)));
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
              diagLog('SherloErrorBoundary.render with caught=true (about to write JS_ERROR via appendFile)');
              sherloMod.appendFile(PROTOCOL_FILE, JSON.stringify(entry) + '\n');
              diagLog('SherloModule.appendProtocolJsError(appendFile) returned');
            } else {
              diagLog('SherloErrorBoundary.componentDidCatch: sherloModuleRef unavailable - skipping appendFile write');
            }
          } catch (_) {
            diagLog('SherloErrorBoundary.componentDidCatch: appendFile threw');
          }
          try {
            if (global.ErrorUtils && typeof global.ErrorUtils.reportFatalError === 'function') {
              global.ErrorUtils.reportFatalError(error);
            }
          } catch (_) {}
        };
        SherloErrorBoundaryP.prototype.render = function () {
          if (this.state.caught) {
            diagLog('SherloErrorBoundary.render: returning null (caught=true)');
          }
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
  try { diagLog('previous globalThis.reportError: ' + typeof globalThis.reportError); } catch (_) {}
  if (typeof globalThis !== 'undefined' && !globalThis.__sherloReportErrorInstalled) {
    globalThis.__sherloReportErrorInstalled = true;
    var __sherloPrevReportError = globalThis.reportError;
    globalThis.reportError = function (err) {
      diagLog('globalThis.reportError handler fired: ' + ((err && err.message) || String(err)));
      try { reportToNative(err); } catch (_) {}
      if (typeof __sherloPrevReportError === 'function') {
        try { __sherloPrevReportError.call(globalThis, err); } catch (_) {}
      }
    };
    diagLog('global.reportError replaced: yes');
  } else {
    diagLog('global.reportError: skipped (already installed or globalThis undefined)');
  }

  // 1. ErrorUtils deferred handler - catches async/event errors and entry-level throws.
  //    We DEFER installing until after ExceptionsManager has run, because
  //    ExceptionsManager unconditionally calls setGlobalHandler() during module
  //    evaluation and would OVERWRITE an early-installed handler (spike finding #2).
  //    We late-install by wrapping whatever handler ExceptionsManager set, chaining to it.
  //    Scheduled via Promise.resolve().then() at the bottom of the IIFE so it runs
  //    after all synchronous module evaluation completes.
  try { diagLog('ErrorUtils detected at IIFE time: ' + !!(global.ErrorUtils) + ' (deferred install pending)'); } catch (_) {}
  function installSherloErrorUtilsHandler() {
    try {
      var EU = (typeof ErrorUtils !== 'undefined') ? ErrorUtils : (global && global.ErrorUtils);
      if (!EU || typeof EU.getGlobalHandler !== 'function' || typeof EU.setGlobalHandler !== 'function') {
        diagLog('installSherloErrorUtilsHandler: ErrorUtils/getGlobalHandler/setGlobalHandler unavailable - skipping');
        return;
      }
      var existing = EU.getGlobalHandler();
      if (existing && existing.__sherlo) {
        diagLog('installSherloErrorUtilsHandler: already wrapped - skipping');
        return;
      }
      diagLog('installSherloErrorUtilsHandler: installing (chaining over existing handler: ' + (typeof existing) + ')');
      function sherloWrapping(error, isFatal) {
        diagLog('ErrorUtils global handler fired: error=' + ((error && error.message) || String(error)) + ' isFatal=' + isFatal);
        try { reportToNative(error); } catch (_) {}
        if (typeof existing === 'function') {
          try { existing(error, isFatal); } catch (_) {}
        }
      }
      sherloWrapping.__sherlo = true;
      EU.setGlobalHandler(sherloWrapping);
      diagLog('installSherloErrorUtilsHandler: installed successfully');
    } catch (err) {
      try { diagLog('installSherloErrorUtilsHandler: threw ' + err); } catch (_) {}
    }
  }

  // 2. __d wrap - wraps every module's factory function with try/catch.
  //    Catches throws in module body regardless of nested _$$_REQUIRE chain
  //    (Metro's local metroRequire ref bypasses any global.__r replacement,
  //    so wrapping __d at the source is the only reliable way to catch
  //    nested module-eval throws).
  //    Rethrows after capturing so RN's native path still fires.
  diagLog('AppRegistry trap installed on _e.AppRegistry: yes (__d wrapping ' + (typeof global.__d === 'function' && !global.__sherloDefineWrapped ? 'will be applied' : 'skipped') + ')');
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
                diagLog('_e.AppRegistry setter trap fired - patching registerComponent');
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
              diagLog('Prong1: global.RN$AppRegistry found after module factory, calling patchAppRegistry');
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
