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
// The polyfill does NOTHING - no ErrorUtils handler install, no __d wrap, no
// AppRegistry trap, no captures, no 10s timer. Zero production overhead.
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
// Gating on that global also broke testing: when the JSI binding had not yet written
// the global at the AR-exporting module's factory-call time, the AppRegistry trap was
// skipped, patchAppRegistry never fired, the SherloErrorBoundary was never installed,
// and JS_ERROR was never written to protocol - integration test
// error-js-runtime-crash failed on sb8/sb9/sb10.
//
// The TurboModule bridge call is a separate, more deterministic mechanism. TurboModules
// are registered before bundle eval begins. The JSI global write can race; the bridge
// call cannot. Do NOT use __sherloRuntimeMode_v1 or any JSI-set global as a gate.
// The single IIFE-time bridge call is the only gate; do NOT add mode-check gates
// inside individual handlers, wrappers, or capture probes.
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

  // Production safety gate. Read mode ONCE via the TurboModule bridge.
  // The bridge call is reliable here (TurboModules are registered before
  // bundle eval). The JSI-set global __sherloRuntimeMode_v1 has a known
  // Android race and must NOT be used as a gate. A previous attempt did
  // that and broke testing-mode JS_ERROR capture.
  //
  // If mode is the literal string 'default' (production: no Sherlo
  // testing or inspect mode active), return early. The polyfill does
  // NOTHING in production - no ErrorUtils handler install, no __d wrap,
  // no AppRegistry trap, no captures, no 10s timer. Native-side
  // protocol writes are independently gated and a no-op too.
  //
  // For any other outcome (mode 'testing', 'storybook', undefined, or
  // a thrown exception in the read), continue with the full polyfill
  // behavior. Conservative default: when uncertain, run the polyfill.
  try {
    var __sherloModeProbe = (global.__turboModuleProxy && global.__turboModuleProxy('SherloModule')) ||
                            (global.nativeModuleProxy && global.nativeModuleProxy.SherloModule);
    if (__sherloModeProbe) {
      var __sherloConstsProbe =
        (typeof __sherloModeProbe.getSherloConstants === 'function' ? __sherloModeProbe.getSherloConstants() : null) ||
        (typeof __sherloModeProbe.getConstants === 'function' ? __sherloModeProbe.getConstants() : null);
      if (__sherloConstsProbe && __sherloConstsProbe.mode === 'default') {
        return;
      }
    }
  } catch (_) {}

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
    // Mode is queryable here because module 231's factory runs after native
    // SherloModule is fully initialized.
    var nm = (global.__turboModuleProxy && global.__turboModuleProxy('SherloModule')) ||
             (global.nativeModuleProxy && global.nativeModuleProxy.SherloModule);
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
              sherloMod.appendFile('protocol.sherlo', JSON.stringify(entry) + '\n');
            }
          } catch (_) {
          }
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

  // 2. __d wrap - wraps every module's factory function with try/catch.
  //    Catches throws in module body regardless of nested _$$_REQUIRE chain
  //    (Metro's local metroRequire ref bypasses any global.__r replacement,
  //    so wrapping __d at the source is the only reliable way to catch
  //    nested module-eval throws like App.tsx top-level errors).
  //    Unconditionally installs a setter trap on exportsObj.AppRegistry so
  //    patchAppRegistry fires synchronously when RN's AppRegistry re-exporter
  //    assigns _e.AppRegistry = t, before RN's own LogBox registerComponent call
  //    locks in the unpatched reference in Hermes' inline cache. The trap is cheap
  //    (one defineProperty per module) and inert; patchAppRegistry has its own
  //    getSherloConstants mode gate. The maybeCapture* probes in finally run
  //    unconditionally (see file header for rationale).
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
        // getSherloConstants. Gating this trap on globalThis.__sherloRuntimeMode_v1
        // was tried and broke testing on Android when the JSI binding had not yet
        // written the global at the AR-exporting module's factory-call time.)
        try {
          var _arValue;
          Object.defineProperty(exportsObj, 'AppRegistry', {
            configurable: true,
            enumerable: false,
            get: function () { return _arValue; },
            set: function (v) {
              _arValue = v;
              // Only patch + downgrade when this is actually the AppRegistry object.
              // RN's AR re-exporter writes `_e.AppRegistry = void 0` first, then
              // `_e.AppRegistry = t`; we must keep the trap armed across the void-0 init.
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
        }
      }
      return originalDefine.call(this, wrappedFactory, moduleId, dependencyMap);
    };
  }
  // 3. ERROR_STORYBOOK_NOT_DISPLAYED timer - fires if the Sherlo Storybook wrapper
  //    was never mounted (e.g. user forgot to wire getStorybook in App.tsx).
  //    Runs unconditionally at boot so the error is detected even when the wrapper
  //    component's useEffect never executes. Mode is read lazily inside the callback
  //    (after 10s) to avoid the Android JSI race condition described above.
  //    global.__sherloStorybookRendered is set by Storybook.tsx when the wrapper renders.
  //    Error code source of truth: src/checkSdkCompatibility.ts
  if (!global.__sherloStorybookNotDisplayedTimerInstalled) {
    global.__sherloStorybookNotDisplayedTimerInstalled = true;
    setTimeout(function () {
      try {
        if (global.__sherloStorybookRendered === true) return;
        var sherloNm = (global.__turboModuleProxy && global.__turboModuleProxy('SherloModule')) ||
                       (global.nativeModuleProxy && global.nativeModuleProxy.SherloModule);
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
})();
