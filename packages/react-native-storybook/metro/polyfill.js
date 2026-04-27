'use strict';

/**
 * Sherlo JS error capture polyfill.
 *
 * Injected before user modules via Metro getPolyfills (see metro.js withSherlo).
 * Runs after RN's error-guard polyfill (ErrorUtils set) but BEFORE InitializeCore.js
 * (which is loaded later when the user does `import 'react-native'`).
 *
 * Two-step capture model:
 *   1. setGlobalHandler interceptor (sync). RN's InitializeCore later calls
 *      ErrorUtils.setGlobalHandler with its default fatal handler, which would
 *      replace any handler we install. We swap the setter itself so every future
 *      call still chains through us, no matter who the last caller is.
 *   2. AppRegistry patch (lazy). We use the FIRST setGlobalHandler call from
 *      RN's init as our cue that react-native is fully loaded - at that point
 *      `require('react-native')` returns AppRegistry and we monkey-patch
 *      registerComponent so user roots get wrapped in an ErrorBoundary.
 *
 * Why no Promise.resolve().then deferral: in alpha.4 we tried it; the deferred
 * function never executed even though `.then()` was called. Hermes microtask
 * drain timing isn't dependable in this window. We avoid the microtask path
 * entirely.
 */

if (typeof console !== 'undefined' && typeof console.warn === 'function') {
  console.warn('[Sherlo] polyfill v5 executing');
}

function reportIfTesting(error, source) {
  try {
    var mod = require('../dist/SherloModule');
    var SherloModule = mod && mod['default'] ? mod['default'] : mod;
    if (
      !SherloModule ||
      typeof SherloModule.getMode !== 'function' ||
      SherloModule.getMode() !== 'testing'
    ) {
      return;
    }
    SherloModule.sendJsError(
      error && error.message ? error.message : String(error),
      (error && error.stack) || '',
      source
    );
  } catch (_e) {}
}

function writeMarker(action, data) {
  try {
    var mod = require('../dist/SherloModule');
    var SherloModule = mod && mod.default ? mod.default : mod;
    if (!SherloModule || typeof SherloModule.getMode !== 'function' || SherloModule.getMode() !== 'testing') return;
    SherloModule.appendFile(
      'protocol.sherlo',
      JSON.stringify(Object.assign({ action: action, timestamp: Date.now(), entity: 'sherlo-polyfill' }, data ? { data: data } : {})) + '\n'
    );
  } catch (_) {}
}

writeMarker('POLYFILL_RAN');

/* ------------------------------------------------------------------ *
 * AppRegistry monkey-patch                                            *
 * Idempotent. Safe to call multiple times - guarded by __sherloPatched. *
 * ------------------------------------------------------------------ */
function tryPatchAppRegistry() {
  try {
    var rn;
    try { rn = require('react-native'); } catch (_) { return false; }
    if (!rn || !rn.AppRegistry || typeof rn.AppRegistry.registerComponent !== 'function') return false;
    var AR = rn.AppRegistry;
    if (AR.__sherloPatched) return true;
    AR.__sherloPatched = true;

    var React = require('react');

    function wrapComponent(Component, key) {
      function SherloErrorBoundary(props) {
        React.Component.call(this, props);
        this.state = { caught: false };
      }
      SherloErrorBoundary.prototype = Object.create(React.Component.prototype);
      SherloErrorBoundary.prototype.constructor = SherloErrorBoundary;
      SherloErrorBoundary.displayName = 'SherloErrorBoundary';
      SherloErrorBoundary.getDerivedStateFromError = function() { return { caught: true }; };
      SherloErrorBoundary.prototype.componentDidCatch = function(error) {
        console.warn('[Sherlo] errorBoundary caught', error && error.message);
        writeMarker('POLYFILL_BOUNDARY_CAUGHT');
        reportIfTesting(error, 'errorBoundary');
        if (global.ErrorUtils && typeof global.ErrorUtils.reportFatalError === 'function') {
          try { global.ErrorUtils.reportFatalError(error); } catch (_) {}
        }
      };
      SherloErrorBoundary.prototype.render = function() {
        return this.state.caught ? null : this.props.children;
      };

      function SherloRootWrapper(props) {
        return React.createElement(SherloErrorBoundary, null, React.createElement(Component, props));
      }
      SherloRootWrapper.displayName = 'SherloRoot(' + (Component.displayName || Component.name || key || '?') + ')';
      SherloRootWrapper._sherloWrapped = true;
      return SherloRootWrapper;
    }

    var origRegister = AR.registerComponent;
    AR.registerComponent = function sherloRegisterComponent(appKey, componentProvider) {
      writeMarker('POLYFILL_REGISTER_COMPONENT_INTERCEPTED', { appKey: appKey });
      return origRegister.call(AR, appKey, function() {
        var Component = componentProvider();
        if (!Component || Component._sherloWrapped) return Component;
        return wrapComponent(Component, appKey);
      });
    };

    writeMarker('POLYFILL_APPREGISTRY_PATCHED');
    console.warn('[Sherlo] AppRegistry patched');
    return true;
  } catch (e) {
    console.warn('[Sherlo] tryPatchAppRegistry threw: ' + (e && e.message));
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * setGlobalHandler interceptor                                        *
 * Chains through us regardless of who installs last.                 *
 * Also serves as our "RN finished init" signal for AppRegistry patch. *
 * ------------------------------------------------------------------ */
(function installInterceptor() {
  try {
    if (!global.ErrorUtils || typeof global.ErrorUtils.setGlobalHandler !== 'function') {
      console.warn('[Sherlo] ErrorUtils not available - cannot install interceptor');
      return;
    }
    var origSet = global.ErrorUtils.setGlobalHandler.bind(global.ErrorUtils);
    var lastHandler = global.ErrorUtils.getGlobalHandler();

    function sherloChain(error, isFatal) {
      console.warn('[Sherlo] global handler fired', error && error.message);
      writeMarker('POLYFILL_GLOBAL_HANDLER_FIRED');
      reportIfTesting(error, 'globalHandler');
      if (typeof lastHandler === 'function') {
        try { lastHandler(error, isFatal); } catch (_) {}
      }
    }

    global.ErrorUtils.setGlobalHandler = function sherloSetGlobalHandler(handler) {
      lastHandler = handler;
      origSet(sherloChain);
      // RN's InitializeCore is the first known caller. By this point react-native
      // is loaded - try to patch AppRegistry now if we haven't already.
      tryPatchAppRegistry();
    };

    origSet(sherloChain);
    writeMarker('POLYFILL_GLOBAL_HANDLER_INSTALLED');
    console.warn('[Sherlo] global handler interceptor installed');
  } catch (e) {
    console.warn('[Sherlo] installInterceptor threw: ' + (e && e.message));
  }
})();

// Best-effort sync attempt - usually fails (RN not loaded yet) but harmless.
tryPatchAppRegistry();
