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

  // Polyfill diagnostics. Gated on mode==='testing' so production builds get no log noise.
  // We cache the testing flag lazily on first access (native SherloModule is initialized
  // by the time pdiag is first called from inside a wrapped factory).
  var SHERLO_POLYFILL_DIAG_SEQ = 0;
  var SHERLO_POLYFILL_DIAG_ENABLED = null; // null = uncomputed, true/false = cached
  function pdiagIsTesting() {
    if (SHERLO_POLYFILL_DIAG_ENABLED !== null) return SHERLO_POLYFILL_DIAG_ENABLED;
    try {
      var nm = (global.__turboModuleProxy && global.__turboModuleProxy('SherloModule')) ||
               (global.nativeModuleProxy && global.nativeModuleProxy.SherloModule);
      if (!nm) return false;
      var c = (typeof nm.getSherloConstants === 'function' ? nm.getSherloConstants() : null) ||
              (typeof nm.getConstants === 'function' ? nm.getConstants() : null);
      SHERLO_POLYFILL_DIAG_ENABLED = !!(c && c.mode === 'testing');
      return SHERLO_POLYFILL_DIAG_ENABLED;
    } catch (_) {
      return false;
    }
  }
  function pdiag(tag, extra) {
    if (!pdiagIsTesting()) return;
    SHERLO_POLYFILL_DIAG_SEQ += 1;
    var data = extra ? ' ' + JSON.stringify(extra) : '';
    try { console.log('[sherlo:polyfill #' + SHERLO_POLYFILL_DIAG_SEQ + '] ' + tag + data); } catch (_) {}
  }

  // Stash a reference to React when we see it (any module whose exports has both
  // createElement and Component as functions).
  function maybeCaptureReact(_e) {
    if (global.__sherloReactRef) return;
    if (!_e) return;
    if (typeof _e.createElement === 'function' && typeof _e.Component === 'function') {
      global.__sherloReactRef = _e;
      pdiag('captured React');
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
      pdiag('captured SherloModule');
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
      pdiag('captured @storybook/react-native wrapper', {
        hasEntry: typeof _e.__sherloStorybookEntry === 'function',
        configPath: _e.__sherloStorybookConfigPath || null,
      });
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
      pdiag('no native SherloModule, skipping patch');
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
      pdiag('mode not testing, skipping patch (production/storybook safety)', { mode: mode });
      return;
    }

    AR.__sherloBoundaryPatched = true;
    var sherloAtRoot = !!(config && config.sherloAtRoot === true);
    pdiag('patching AR via polyfill (testing mode)', { sherloAtRoot: sherloAtRoot });

    var orig = AR.registerComponent.bind(AR);
    AR.registerComponent = function sherloRegisterComponentPolyfill(appKey, componentProvider) {
      pdiag('sherloRegisterComponentPolyfill INVOKED', { appKey: appKey });
      return orig(appKey, function () {
        var React = global.__sherloReactRef;
        if (!React) {
          pdiag('no React captured, returning raw component', { appKey: appKey });
          return componentProvider();
        }

        function SherloErrorBoundaryP(props) {
          React.Component.call(this, props);
          this.state = { caught: false };
          pdiag('boundary CONSTRUCT');
        }
        SherloErrorBoundaryP.prototype = Object.create(React.Component.prototype);
        SherloErrorBoundaryP.prototype.constructor = SherloErrorBoundaryP;
        SherloErrorBoundaryP.displayName = 'SherloErrorBoundary';
        SherloErrorBoundaryP.getDerivedStateFromError = function (error) {
          pdiag('boundary getDerivedStateFromError', { message: error && error.message });
          return { caught: true };
        };
        SherloErrorBoundaryP.prototype.componentDidCatch = function (error, _info) {
          pdiag('boundary componentDidCatch', { message: error && error.message });
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
              pdiag('JS_ERROR written via captured SherloModule');
            } else {
              pdiag('SherloModule not captured - JS_ERROR not written');
            }
          } catch (e) {
            pdiag('JS_ERROR write threw', { message: e && e.message });
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
            pdiag('sherloAtRoot enabled but @storybook/react-native wrapper not captured');
            return componentProvider();
          }
          var loader = sbMod.__sherloStorybookEntry;
          var configPath = sbMod.__sherloStorybookConfigPath;
          if (typeof loader !== 'function') {
            pdiag('sherloAtRoot requires configPath in metro.config.js', { configPath: configPath });
            return componentProvider();
          }
          var storybookIndexMod;
          try { storybookIndexMod = loader(); } catch (e) {
            pdiag('sherloAtRoot loader threw', { message: e && e.message });
            return componentProvider();
          }
          var UserStorybookEntry = storybookIndexMod && storybookIndexMod.default;
          if (!UserStorybookEntry) {
            pdiag('sherloAtRoot: configPath/index has no default export', { configPath: configPath });
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
          pdiag('inner componentProvider returning SherloRootWrapperAtRootP', { appKey: appKey });
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
        pdiag('inner componentProvider returning SherloRootP', { appKey: appKey });
        return SherloRootP;
      });
    };
    pdiag('AR patched via polyfill');
  }

  // 2. __d wrap - wraps every module's factory function with try/catch.
  //    Catches throws in module body regardless of nested _$$_REQUIRE chain
  //    (Metro's local metroRequire ref bypasses any global.__r replacement,
  //    so wrapping __d at the source is the only reliable way to catch
  //    nested module-eval throws like App.tsx top-level errors).
  //    Also installs a setter trap on exportsObj.AppRegistry so that when
  //    RN's AppRegistry re-exporter assigns _e.AppRegistry = t, patchAppRegistry
  //    fires synchronously before RN's own LogBox registerComponent call locks
  //    in the unpatched reference in Hermes' inline cache.
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
        try {
          var _arValue;
          Object.defineProperty(exportsObj, 'AppRegistry', {
            configurable: true,
            enumerable: true,
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
})();
