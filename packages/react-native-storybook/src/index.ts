export { default as addStorybookToDevMenu } from './addStorybookToDevMenu';
export { default as getStorybook } from './getStorybook';
export { default as isRunningVisualTests } from './isRunningVisualTests';
export { default as isStorybookMode } from './isStorybookMode';
export { default as openStorybook } from './openStorybook';

export * from './types';

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
try {
  installSherloIntegration();
} catch (_) {}

function installSherloIntegration(): void {
  const SherloModule = require('./SherloModule').default;
  const isTesting =
    SherloModule &&
    typeof SherloModule.getMode === 'function' &&
    SherloModule.getMode() === 'testing';

  if (isTesting) {
    SherloModule.appendFile(
      'protocol.sherlo',
      JSON.stringify({ action: 'JS_EVAL_COMPLETE', timestamp: Date.now(), entity: 'app' }) + '\n'
    );
  }

  patchAppRegistryWithBoundary(SherloModule, isTesting);
}

function patchAppRegistryWithBoundary(SherloModule: any, isTesting: boolean): void {
  const RN = require('react-native');
  const AR = RN && RN.AppRegistry;
  if (!AR || typeof AR.registerComponent !== 'function' || AR.__sherloBoundaryPatched) return;
  AR.__sherloBoundaryPatched = true;

  const React = require('react');

  function reportJsError(error: any, source: string): void {
    if (!isTesting) return;
    try {
      SherloModule.sendJsError(
        error && error.message ? error.message : String(error),
        (error && error.stack) || '',
        source
      );
    } catch (_) {}
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
  SherloErrorBoundary.prototype.componentDidCatch = function (error: any) {
    reportJsError(error, 'errorBoundary');
    // Re-propagate so the standard fatal flow (redbox in dev, native crash in prod) runs.
    if ((global as any).ErrorUtils && typeof (global as any).ErrorUtils.reportFatalError === 'function') {
      try { (global as any).ErrorUtils.reportFatalError(error); } catch (_) {}
    }
  };
  SherloErrorBoundary.prototype.render = function () {
    return this.state.caught ? null : this.props.children;
  };

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
}
