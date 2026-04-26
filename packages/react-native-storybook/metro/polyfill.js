'use strict';

/**
 * Sherlo JS error capture polyfill.
 *
 * Injected before user modules via Metro getPolyfills (see metro.js withSherlo).
 * This file runs AFTER React Native's own polyfills (ErrorUtils is already set up)
 * but BEFORE any user module.
 *
 * Timing model (why we defer):
 *   Synchronous execution order in a RN bundle:
 *     1. RN built-in polyfills (ErrorUtils ready)
 *     2. This polyfill (too early: react-native module not yet evaluated,
 *        RN runtime may overwrite our setGlobalHandler after we set it)
 *     3. User modules (react-native loads, index.js calls registerComponent)
 *   After bundle evaluation the microtask queue drains BEFORE native calls
 *   runApplication, so Promise.resolve().then() gives us a window where:
 *     - react-native is fully loaded  (require works)
 *     - registerComponent has already run  (existing runnables are in place)
 *     - RN runtime init is complete  (our global handler won't get overwritten)
 *     - runApplication has NOT been called yet  (component wrapping still in time)
 *
 * Mode gate: writeMarker / reportIfTesting gate on SherloModule.getMode() === 'testing'.
 * The console.warn diagnostics are unconditional (they appear in dev logs always).
 */

// Diagnostic: no requires, no native deps - fires unconditionally.
// If absent from device logs, getPolyfills wiring isn't working at all.
if (typeof console !== 'undefined' && typeof console.warn === 'function') {
  console.warn('[Sherlo] polyfill executing');
}

/* ------------------------------------------------------------------ *
 * reportIfTesting(error, source)                                      *
 * ------------------------------------------------------------------ */
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

/* ------------------------------------------------------------------ *
 * writeMarker(action, data)                                           *
 * Writes a JSON line to protocol.sherlo; gated on testing mode.      *
 * ------------------------------------------------------------------ */
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

// Marker 1: polyfill was bundled and is executing.
writeMarker('POLYFILL_RAN');

/* ------------------------------------------------------------------ *
 * Deferred installation                                               *
 * Both hooks run in a single microtask after bundle eval completes.  *
 * ------------------------------------------------------------------ */
Promise.resolve().then(function sherloDeferred() {
  console.warn('[Sherlo] deferred install running');

  /* 1. Global error handler ---------------------------------------- */
  (function installGlobalErrorHandler() {
    try {
      if (!global.ErrorUtils || typeof global.ErrorUtils.getGlobalHandler !== 'function') return;
      // Re-read the current handler - RN runtime may have set one after our
      // synchronous polyfill ran. We chain to whatever is installed now.
      var originalHandler = global.ErrorUtils.getGlobalHandler();
      global.ErrorUtils.setGlobalHandler(function sherloGlobalErrorHandler(error, isFatal) {
        // Marker 6: global handler was invoked for an error.
        console.warn('[Sherlo] global handler fired', error && error.message);
        writeMarker('POLYFILL_GLOBAL_HANDLER_FIRED');
        reportIfTesting(error, 'globalHandler');
        if (typeof originalHandler === 'function') {
          originalHandler(error, isFatal);
        }
      });
      // Marker 2: setGlobalHandler succeeded.
      writeMarker('POLYFILL_GLOBAL_HANDLER_INSTALLED');
      console.warn('[Sherlo] global handler chain installed');
    } catch (_e) {}
  })();

  /* 2. AppRegistry ErrorBoundary ------------------------------------ */
  (function installAppRegistryPatch() {
    try {
      var rn = require('react-native');
      var AppRegistry = rn && rn.AppRegistry;
      if (!AppRegistry || typeof AppRegistry.registerComponent !== 'function') {
        console.warn('[Sherlo] AppRegistry not available even in microtask');
        return;
      }
      console.warn('[Sherlo] AppRegistry available in microtask');

      var React = require('react');

      // Identity-stable cache: same wrapper instance for the same key so React
      // reconciliation doesn't unmount/remount on every render.
      var wrapCache = Object.create(null);

      function wrapComponent(Component, cacheKey) {
        if (wrapCache[cacheKey]) return wrapCache[cacheKey];

        // ES5-style ErrorBoundary - avoids transpilation surprises in polyfill context.
        function SherloErrorBoundary(props) {
          React.Component.call(this, props);
          this.state = { caught: false };
        }
        SherloErrorBoundary.prototype = Object.create(React.Component.prototype);
        SherloErrorBoundary.prototype.constructor = SherloErrorBoundary;
        SherloErrorBoundary.displayName = 'SherloErrorBoundary';
        SherloErrorBoundary.getDerivedStateFromError = function() {
          return { caught: true };
        };
        SherloErrorBoundary.prototype.componentDidCatch = function(error) {
          // Marker 5: ErrorBoundary caught a render error.
          console.warn('[Sherlo] errorBoundary caught', error && error.message);
          writeMarker('POLYFILL_BOUNDARY_CAUGHT');
          reportIfTesting(error, 'errorBoundary');
          // Re-propagate so RN's standard fatal flow (redbox in dev, crash in prod) runs.
          if (global.ErrorUtils && typeof global.ErrorUtils.reportFatalError === 'function') {
            global.ErrorUtils.reportFatalError(error);
          }
        };
        SherloErrorBoundary.prototype.render = function() {
          return this.state.caught ? null : this.props.children;
        };

        function SherloRootWrapper(props) {
          return React.createElement(SherloErrorBoundary, null, React.createElement(Component, props));
        }
        SherloRootWrapper.displayName =
          'SherloRoot(' + (Component.displayName || Component.name || cacheKey) + ')';
        // Flag so the instrumentation hook and the registerComponent patch
        // can detect already-wrapped components and skip double-wrapping.
        SherloRootWrapper._sherloWrapped = true;

        wrapCache[cacheKey] = SherloRootWrapper;
        return SherloRootWrapper;
      }

      // setComponentProviderInstrumentationHook is called by AppRegistry.runApplication
      // for every component at actual mount time. Because it fires at mount - not at
      // registerComponent time - it retroactively covers components that were registered
      // before this deferred ran. AppRegistry.runnables{} is a private module closure
      // (not exported); this is the correct public API for retroactive wrapping.
      if (typeof AppRegistry.setComponentProviderInstrumentationHook === 'function') {
        AppRegistry.setComponentProviderInstrumentationHook(function(componentProvider) {
          var Component = componentProvider();
          // Skip if already wrapped (e.g. by our registerComponent patch below).
          if (Component && Component._sherloWrapped) return Component;
          var key = (Component && (Component.displayName || Component.name)) || '__sherlo_unknown__';
          return wrapComponent(Component, key);
        });
      }

      // Also patch registerComponent for FUTURE calls (defense-in-depth).
      // The instrumentation hook covers retroactive + future, but if someone calls
      // registerComponent after this deferred runs we intercept it here too.
      var originalRegisterComponent = AppRegistry.registerComponent;
      var interceptMarkerWritten = false;
      AppRegistry.registerComponent = function sherloRegisterComponent(appKey, componentProvider) {
        // Marker 4: first time user code calls registerComponent through our patch.
        if (!interceptMarkerWritten) {
          interceptMarkerWritten = true;
          writeMarker('POLYFILL_REGISTER_COMPONENT_INTERCEPTED', { appKey: appKey });
        }
        return originalRegisterComponent.call(AppRegistry, appKey, function() {
          if (wrapCache[appKey]) return wrapCache[appKey];
          var Component = componentProvider();
          if (Component && Component._sherloWrapped) return Component;
          return wrapComponent(Component, appKey);
        });
      };

      // Log every already-registered key for diagnostics. Actual wrapping happens
      // at mount time via the instrumentation hook installed above.
      if (typeof AppRegistry.getAppKeys === 'function') {
        AppRegistry.getAppKeys().forEach(function(appKey) {
          console.warn('[Sherlo] re-wrapped existing runnable: ' + appKey);
        });
      }

      // Marker 3: AppRegistry patch succeeded.
      writeMarker('POLYFILL_APPREGISTRY_PATCHED');
      console.warn('[Sherlo] AppRegistry patched');
    } catch (_e) {}
  })();
});

console.warn('[Sherlo] deferred install scheduled');
