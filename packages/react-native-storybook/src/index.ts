export { default as addStorybookToDevMenu } from './addStorybookToDevMenu';
export { default as getStorybook } from './getStorybook';
export { default as isRunningVisualTests } from './isRunningVisualTests';
export { default as isStorybookMode } from './isStorybookMode';
export { default as openStorybook } from './openStorybook';

export * from './types';

import { normalizeStack } from './normalizeStack';

// Auto-install ErrorBoundary wrapper around the React root, plus the
// JS_EVAL_COMPLETE marker. Both are gated on testing mode and wrapped in
// try/catch so any failure here never breaks user imports.
//
// Why this side effect lives in index.ts (not in metro/polyfill.js):
// In RN 0.81+ with the new architecture, `RN$useAlwaysAvailableJSErrorHandling`
// is true, which skips `Libraries/Core/setUpErrorHandling.js`. RN never calls
// `ErrorUtils.setGlobalHandler`, so any handler we install via the metro
// polyfill is never reached when React reports a render error - errors flow
// through a native C++ jsErrorHandler instead. The only reliable JS-side
// capture path is an ErrorBoundary already mounted in the React tree, which
// requires patching `AppRegistry.registerComponent` BEFORE user code calls it.
//
// User code does `import App from './App'` before `registerRootComponent(App)`,
// and App.tsx imports from `@sherlo/react-native-storybook`. By the time we
// run, react-native is loaded (expo pulled it in transitively); by the time
// registerRootComponent is called, our patch is already in place.
function detectHasExpo(): boolean {
  try { require('expo'); return true; } catch { return false; }
}
function detectEngine(): 'hermes' | 'jsc' {
  try { return typeof (global as any).HermesInternal !== 'undefined' ? 'hermes' : 'jsc'; } catch { return 'jsc'; }
}

try {
  installSherloIntegration();
} catch (_) {}

function installSherloIntegration(): void {
  console.warn('[Sherlo] index side effect: entered installSherloIntegration');

  const SherloModule = require('./SherloModule').default;
  console.warn('[Sherlo] index side effect: SherloModule required, type=' + typeof SherloModule);

  const isTesting =
    SherloModule &&
    typeof SherloModule.getMode === 'function' &&
    SherloModule.getMode() === 'testing';
  console.warn('[Sherlo] index side effect: isTesting=' + isTesting + ', mode=' + (typeof SherloModule?.getMode === 'function' ? SherloModule.getMode() : 'no-getMode'));

  if (isTesting) {
    console.warn('[Sherlo] index side effect: about to call appendFile');
    SherloModule.appendFile(
      'protocol.sherlo',
      JSON.stringify({ action: 'JS_EVAL_COMPLETE', timestamp: Date.now(), entity: 'app' }) + '\n'
    );
    console.warn('[Sherlo] index side effect: appendFile returned');

    try {
      const ErrorUtils = (global as any).ErrorUtils;
      if (ErrorUtils && typeof ErrorUtils.setGlobalHandler === 'function' && !(global as any).__sherloGlobalHandlerInstalled) {
        (global as any).__sherloGlobalHandlerInstalled = true;
        const prevHandler = typeof ErrorUtils.getGlobalHandler === 'function' ? ErrorUtils.getGlobalHandler() : null;
        ErrorUtils.setGlobalHandler(function (error: any, isFatal: any) {
          try {
            const data = {
              name: (error && error.name) || 'Error',
              message: (error && error.message) || String(error),
              stack: normalizeStack((error && error.stack) || ''),
              componentStack: [],
              digest: null,
              cause: null,
            };
            const entry = { action: 'JS_ERROR', timestamp: Date.now(), entity: 'app', data: data };
            SherloModule.appendFile('protocol.sherlo', JSON.stringify(entry) + '\n');
          } catch (_) {}
          if (prevHandler) { try { prevHandler(error, isFatal); } catch (_) {} }
        });
        console.warn('[Sherlo] index side effect: ErrorUtils.setGlobalHandler installed');
      }
    } catch (_) {}
  }

  console.warn('[Sherlo] index side effect: about to patchAppRegistryWithBoundary');
  patchAppRegistryWithBoundary(SherloModule, isTesting);
  console.warn('[Sherlo] index side effect: patchAppRegistryWithBoundary returned');
}

function patchAppRegistryWithBoundary(SherloModule: any, isTesting: boolean): void {
  console.warn('[Sherlo] patchAppRegistry: entered');

  console.warn('[Sherlo] patchAppRegistry: about to require react-native');
  const RN = require('react-native');
  console.warn('[Sherlo] patchAppRegistry: react-native required, has AppRegistry=' + !!(RN && RN.AppRegistry));

  const AR = RN && RN.AppRegistry;
  if (!AR || typeof AR.registerComponent !== 'function' || AR.__sherloBoundaryPatched) return;
  AR.__sherloBoundaryPatched = true;

  console.warn('[Sherlo] patchAppRegistry: about to require react');
  const React = require('react');
  console.warn('[Sherlo] patchAppRegistry: react required');

  function reportJsError(error: any, source: string): void {
    if (!isTesting) return;
    try {
      SherloModule.sendJsError(
        error && error.message ? error.message : String(error),
        normalizeStack((error && error.stack) || ''),
        source
      );
    } catch (_) {}
  }

  function stripSherloAndBelow(componentStack: string): string {
    if (!componentStack) return componentStack;
    const lines = componentStack.split('\n');
    const cutoffIdx = lines.findIndex(line => line.includes('SherloErrorBoundary'));
    if (cutoffIdx === -1) return componentStack;
    return lines.slice(0, cutoffIdx).join('\n');
  }

  function writeJsErrorEntry(error: any, errorInfo: any): Promise<void> {
    if (!isTesting) return Promise.resolve();
    try {
      const data = {
        name: (error && error.name) || 'Error',
        message: (error && error.message) || String(error),
        stack: normalizeStack((error && error.stack) || ''),
        componentStack: stripSherloAndBelow(normalizeStack((errorInfo && errorInfo.componentStack) || '')),
        digest: (errorInfo && errorInfo.digest) || null,
        cause: error && error.cause
          ? {
              name: error.cause.name,
              message: error.cause.message,
              stack: normalizeStack((error.cause.stack) || ''),
            }
          : null,
        hasExpo: detectHasExpo(),
        engine: detectEngine(),
      };

      const entry = { action: 'JS_ERROR', timestamp: Date.now(), entity: 'app', data: data };
      console.warn('[Sherlo] componentDidCatch: about to write JS_ERROR');
      return Promise.resolve(SherloModule.appendFile('protocol.sherlo', JSON.stringify(entry) + '\n'))
        .then(function () { console.warn('[Sherlo] componentDidCatch: JS_ERROR appendFile resolved'); })
        .catch(function () { console.warn('[Sherlo] componentDidCatch: JS_ERROR appendFile rejected'); });
    } catch (_) {
      return Promise.resolve();
    }
  }

  function doReportFatalError(error: any): void {
    if ((global as any).ErrorUtils && typeof (global as any).ErrorUtils.reportFatalError === 'function') {
      try { (global as any).ErrorUtils.reportFatalError(error); } catch (_) {}
    }
  }

  // ES5-style class to avoid transpilation surprises in user bundles.
  function SherloErrorBoundary(this: any, props: any) {
    React.Component.call(this, props);
    this.state = { caught: false };
  }
  SherloErrorBoundary.prototype = Object.create(React.Component.prototype);
  SherloErrorBoundary.prototype.constructor = SherloErrorBoundary;
  (SherloErrorBoundary as any).displayName = 'SherloErrorBoundary';
  (SherloErrorBoundary as any).getDerivedStateFromError = () => ({ caught: true });
  SherloErrorBoundary.prototype.componentDidCatch = function (error: any, errorInfo: any) {
    if (isTesting) {
      // Defer reportFatalError until the native bridge appendFile call settles so
      // the JS_ERROR entry is persisted before the JS thread is torn down.
      writeJsErrorEntry(error, errorInfo).finally(function () {
        console.warn('[Sherlo] componentDidCatch: about to reportFatalError');
        doReportFatalError(error);
      });
    } else {
      doReportFatalError(error);
    }
  };
  SherloErrorBoundary.prototype.render = function () {
    return this.state.caught ? null : this.props.children;
  };

  console.warn('[Sherlo] patchAppRegistry: about to monkey-patch registerComponent');
  const origRegister = AR.registerComponent.bind(AR);
  AR.registerComponent = function sherloRegisterComponent(appKey: string, componentProvider: () => any) {
    return origRegister(appKey, () => {
      const Component = componentProvider();
      if (!Component || (Component as any)._sherloWrapped) return Component;
      function SherloRootWrapper(props: any) {
        return React.createElement(SherloErrorBoundary, null, React.createElement(Component, props));
      }
      (SherloRootWrapper as any).displayName =
        'SherloRoot(' + ((Component as any).displayName || (Component as any).name || appKey) + ')';
      (SherloRootWrapper as any)._sherloWrapped = true;
      return SherloRootWrapper;
    });
  };
  console.warn('[Sherlo] patchAppRegistry: registerComponent patched, exiting');
}
