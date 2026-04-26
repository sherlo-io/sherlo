'use strict';

/**
 * Sherlo JS error capture polyfill.
 *
 * Injected before user modules via Metro getPolyfills (see metro.js withSherlo).
 * This file runs AFTER React Native's own polyfills (ErrorUtils is already set up)
 * but BEFORE any user module, so the AppRegistry monkey-patch is in place when
 * user code calls registerComponent.
 *
 * Mode gate: every path in this file that talks to the native module first checks
 * SherloModule.getMode() === 'testing'.  Production customer apps bundle this
 * polyfill but it is a complete no-op at runtime unless Sherlo testing mode is
 * active.
 *
 * Error re-propagation: both capture paths re-invoke the original handler /
 * ErrorUtils.reportFatalError AFTER reporting, so the app's normal crash / redbox
 * behaviour is fully preserved.
 */

// Diagnostic: fires unconditionally when the polyfill is included in the bundle
// and executed. If absent from device logs, getPolyfills wiring isn't working.
if (typeof console !== 'undefined' && typeof console.warn === 'function') {
  console.warn('[Sherlo] polyfill executing');
}

/* ------------------------------------------------------------------ *
 * reportIfTesting(error, source)                                      *
 * All requires are lazy so that:                                      *
 *   a) the polyfill does not eagerly import the whole SDK             *
 *   b) SherloModule is definitely initialised when the handler fires  *
 * ------------------------------------------------------------------ */
function reportIfTesting(error, source) {
  try {
    // Relative path from metro/polyfill.js → dist/SherloModule.js.
    // Metro resolves this correctly because the polyfill lives inside the
    // @sherlo/react-native-storybook package tree.
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
  } catch (_e) {
    // Never let our reporting break the host app.
  }
}

/* ------------------------------------------------------------------ *
 * writeMarker(action, data)                                           *
 * Writes a single JSON line to protocol.sherlo when mode === testing. *
 * Gated on testing mode so production is a complete no-op.           *
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

// Marker 1: proves the polyfill was included in the bundle and executed.
writeMarker('POLYFILL_RAN');

/* ------------------------------------------------------------------ *
 * 1. ErrorUtils global handler chain                                  *
 * Catches uncaught JS errors: async, setTimeout, event handlers.     *
 * ------------------------------------------------------------------ */
(function installGlobalErrorHandler() {
  try {
    if (!global.ErrorUtils || typeof global.ErrorUtils.getGlobalHandler !== 'function') return;
    var originalHandler = global.ErrorUtils.getGlobalHandler();
    global.ErrorUtils.setGlobalHandler(function sherloGlobalErrorHandler(error, isFatal) {
      // Marker 6: proves the patched global handler was invoked.
      console.warn('[Sherlo] global handler fired', error && error.message);
      writeMarker('POLYFILL_GLOBAL_HANDLER_FIRED');
      reportIfTesting(error, 'globalHandler');
      // Chain: always invoke the original handler, regardless of mode.
      if (typeof originalHandler === 'function') {
        originalHandler(error, isFatal);
      }
    });
    // Marker 2: proves setGlobalHandler succeeded.
    writeMarker('POLYFILL_GLOBAL_HANDLER_INSTALLED');
    console.warn('[Sherlo] global handler chain installed');
  } catch (_e) {}
})();

/* ------------------------------------------------------------------ *
 * 2. AppRegistry.registerComponent monkey-patch + ErrorBoundary      *
 * Catches render / lifecycle / constructor errors in the React tree.  *
 * Cache per appKey to avoid React diff confusion (see                 *
 * react-native-root-siblings#5).                                      *
 * ------------------------------------------------------------------ */
(function installAppRegistryPatch() {
  try {
    var rn = require('react-native');
    var AppRegistry = rn && rn.AppRegistry;
    if (!AppRegistry || typeof AppRegistry.registerComponent !== 'function') return;

    // Cache so that the same wrapped component class is returned on subsequent
    // calls with the same appKey (React reconciler identity stability).
    var cache = Object.create(null);

    var originalRegisterComponent = AppRegistry.registerComponent;

    // Track whether we've already written the intercept marker.
    var interceptMarkerWritten = false;

    AppRegistry.registerComponent = function sherloRegisterComponent(appKey, componentProvider) {
      // Marker 4: first time user code calls registerComponent through our patch.
      if (!interceptMarkerWritten) {
        interceptMarkerWritten = true;
        writeMarker('POLYFILL_REGISTER_COMPONENT_INTERCEPTED', { appKey: appKey });
      }
      return originalRegisterComponent.call(AppRegistry, appKey, function() {
        if (cache[appKey]) return cache[appKey];

        var Component = componentProvider();
        var React = require('react');

        // ES5-style ErrorBoundary class - avoids any transpilation surprises in
        // the polyfill context and keeps the file self-contained.
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
          // Marker 5: proves the ErrorBoundary actually caught a render error.
          console.warn('[Sherlo] errorBoundary caught', error && error.message);
          writeMarker('POLYFILL_BOUNDARY_CAUGHT');
          reportIfTesting(error, 'errorBoundary');
          // Re-propagate so RN's standard fatal flow (redbox in dev, crash in
          // prod) runs - the tree is broken, so there is nothing useful to
          // render after this.
          if (global.ErrorUtils && typeof global.ErrorUtils.reportFatalError === 'function') {
            global.ErrorUtils.reportFatalError(error);
          }
        };

        SherloErrorBoundary.prototype.render = function() {
          // After catching, return null - the fatal flow will replace the UI.
          if (this.state.caught) return null;
          return this.props.children;
        };

        // Thin functional wrapper so the user's component is the direct child
        // of the ErrorBoundary.
        function SherloRootWrapper(props) {
          return React.createElement(
            SherloErrorBoundary,
            null,
            React.createElement(Component, props)
          );
        }
        SherloRootWrapper.displayName =
          'SherloRoot(' + (Component.displayName || Component.name || appKey) + ')';

        cache[appKey] = SherloRootWrapper;
        return SherloRootWrapper;
      });
    };
    // Marker 3: proves AppRegistry.registerComponent was replaced.
    writeMarker('POLYFILL_APPREGISTRY_PATCHED');
    console.warn('[Sherlo] AppRegistry patched');
  } catch (_e) {}
})();
