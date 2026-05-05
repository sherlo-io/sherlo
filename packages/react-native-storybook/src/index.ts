import { normalizeStack } from './normalizeStack';

export { default as addStorybookToDevMenu } from './addStorybookToDevMenu';
export { default as isRunningVisualTests } from './isRunningVisualTests';
export { default as isStorybookMode } from './isStorybookMode';
export { default as openStorybook } from './openStorybook';

export * from './types';

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
    patchAppRegistryWithBoundary(SherloModule);
  }
}

function patchAppRegistryWithBoundary(SherloModule: any): void {
  const RN = require('react-native');
  const AR = RN && RN.AppRegistry;
  if (!AR || typeof AR.registerComponent !== 'function' || AR.__sherloBoundaryPatched) return;
  AR.__sherloBoundaryPatched = true;

  const React = require('react');

  function writeJsErrorFromBoundary(error: any): Promise<void> {
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
      // When sherloAtRoot is enabled, substitute the root with the Storybook entry
      // loaded from the config path instead of calling the original componentProvider.
      let config: any;
      try { config = SherloModule.getConfig(); } catch (_) {}

      if (config && config.sherloAtRoot === true) {
        const storybookMod = require('@storybook/react-native');
        const configPath = storybookMod.__sherloStorybookConfigPath;
        // Use the statically-baked entry from the Metro wrapper. Metro resolves the
        // require literal at bundle time; a dynamic require(configPath + '/index')
        // cannot be statically analyzed and is never bundled.
        const storybookIndexMod = storybookMod.__sherloStorybookEntry;
        const UserStorybookEntry = storybookIndexMod && storybookIndexMod.default;
        if (!UserStorybookEntry) {
          throw new Error(
            '[sherlo] sherloAtRoot requires ' + configPath + '/index to default-export the Storybook UI component' +
            ' (canonical Storybook RN template shape: see https://github.com/storybookjs/react-native template).' +
            ' Got module with keys: [' + Object.keys(storybookIndexMod || {}).join(', ') + ']'
          );
        }
        function SherloRootWrapperAtRoot(props: any) {
          return React.createElement(SherloErrorBoundary, null, React.createElement(UserStorybookEntry, props));
        }
        (SherloRootWrapperAtRoot as any).displayName = 'SherloRoot(sherloAtRoot)';
        (SherloRootWrapperAtRoot as any)._sherloWrapped = true;
        return SherloRootWrapperAtRoot;
      }

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
