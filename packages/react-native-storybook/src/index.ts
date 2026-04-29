import { normalizeStack } from './normalizeStack';

export { default as addStorybookToDevMenu } from './addStorybookToDevMenu';
export { default as getStorybook } from './getStorybook';
export { default as isRunningVisualTests } from './isRunningVisualTests';
export { default as isStorybookMode } from './isStorybookMode';
export { default as openStorybook } from './openStorybook';

export * from './types';

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
  }

  patchAppRegistryWithBoundary(SherloModule, isTesting);
}

function patchAppRegistryWithBoundary(SherloModule: any, isTesting: boolean): void {
  const RN = require('react-native');
  const AR = RN && RN.AppRegistry;
  if (!AR || typeof AR.registerComponent !== 'function' || AR.__sherloBoundaryPatched) return;
  AR.__sherloBoundaryPatched = true;

  const React = require('react');

  function writeJsErrorFromBoundary(error: any): Promise<void> {
    if (!isTesting) return Promise.resolve();
    try {
      const data = {
        name: (error && error.name) || 'Error',
        message: (error && error.message) || String(error),
        stack: normalizeStack((error && error.stack) || ''),
        componentStack: '',
      };
      const entry = { action: 'JS_ERROR', timestamp: Date.now(), entity: 'app', data };
      return Promise.resolve(SherloModule.appendFile('protocol.sherlo', JSON.stringify(entry) + '\n'))
        .then(function () {})
        .catch(function () {});
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
  SherloErrorBoundary.prototype.componentDidCatch = function (error: any, _errorInfo: any) {
    // Defer reportFatalError until appendFile resolves so the JS_ERROR line is
    // on disk before the JS thread is torn down.
    writeJsErrorFromBoundary(error).finally(function () {
      doReportFatalError(error);
    });
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
