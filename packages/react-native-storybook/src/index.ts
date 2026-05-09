import { normalizeStack } from './normalizeStack';

export { default as isRunningVisualTests } from './isRunningVisualTests';
export { default as isStorybookMode } from './isStorybookMode';
export { default as openStorybook } from './openStorybook';

export * from './types';

let SHERLO_DIAG_SEQ = 0;
function diag(tag: string, extra?: any): void {
  SHERLO_DIAG_SEQ += 1;
  const data = extra ? ' ' + JSON.stringify(extra) : '';
  try { console.log('[sherlo:diag #' + SHERLO_DIAG_SEQ + '] ' + tag + data); } catch (_) {}
}

diag('index.ts factory START');

try {
  installSherloIntegration();
} catch (e: any) {
  diag('installSherloIntegration THREW', { message: e?.message, name: e?.name });
}

function installSherloIntegration(): void {
  diag('installSherloIntegration ENTER');
  const SherloModule = require('./SherloModule').default;

  const isTesting =
    SherloModule &&
    typeof SherloModule.getMode === 'function' &&
    SherloModule.getMode() === 'testing';

  diag('mode check', { mode: typeof SherloModule?.getMode === 'function' ? SherloModule.getMode() : null, isTesting: isTesting });
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
  diag('patch ENTER', {
    hasRN: !!RN,
    hasAR: !!AR,
    registerComponentType: typeof (AR && AR.registerComponent),
    alreadyPatched: !!(AR && AR.__sherloBoundaryPatched)
  });
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
      return Promise.resolve(
        SherloModule.appendFile('protocol.sherlo', JSON.stringify(entry) + '\n')
      )
        .then(function () {})
        .catch(function () {});
    } catch (_) {
      return Promise.resolve();
    }
  }

  function doReportFatalError(error: any): void {
    if (
      (global as any).ErrorUtils &&
      typeof (global as any).ErrorUtils.reportFatalError === 'function'
    ) {
      try {
        (global as any).ErrorUtils.reportFatalError(error);
      } catch (_) {}
    }
  }

  // ES5-style class to avoid transpilation surprises in user bundles.
  function SherloErrorBoundary(this: any, props: any) {
    React.Component.call(this, props);
    this.state = { caught: false };
    diag('boundary CONSTRUCT');
  }
  SherloErrorBoundary.prototype = Object.create(React.Component.prototype);
  SherloErrorBoundary.prototype.constructor = SherloErrorBoundary;
  (SherloErrorBoundary as any).displayName = 'SherloErrorBoundary';
  (SherloErrorBoundary as any).getDerivedStateFromError = function (error: any) {
    diag('boundary getDerivedStateFromError', { message: error && error.message, name: error && error.name });
    return { caught: true };
  };
  SherloErrorBoundary.prototype.componentDidCatch = function (error: any, _errorInfo: any) {
    diag('boundary componentDidCatch', { message: error && error.message, name: error && error.name });
    writeJsErrorFromBoundary(error).finally(function () {
      doReportFatalError(error);
    });
  };
  SherloErrorBoundary.prototype.render = function () {
    return this.state.caught ? null : this.props.children;
  };

  const origRegister = AR.registerComponent.bind(AR);
  diag('patch ABOUT TO REPLACE', { origName: (origRegister && (origRegister.name || 'fn')) || 'unknown' });
  const sherloRegisterComponent = function sherloRegisterComponent(
    appKey: string,
    componentProvider: () => any
  ) {
    diag('sherloRegisterComponent INVOKED', { appKey: appKey });
    return origRegister(appKey, () => {
      // When sherloAtRoot is enabled, substitute the root with the Storybook entry
      // loaded from the config path instead of calling the original componentProvider.
      let config: any;
      try {
        config = SherloModule.getConfig();
      } catch (_) {}

      if (config && config.sherloAtRoot === true) {
        const storybookMod = require('@storybook/react-native');
        const configPath = storybookMod.__sherloStorybookConfigPath;
        // __sherloStorybookEntry is a lazy loader function baked by the Metro wrapper.
        // Metro statically resolves the literal require() inside at bundle time, but
        // execution is deferred to here so storybook side-effects don't fire on app boot.
        const loader = storybookMod.__sherloStorybookEntry;
        if (typeof loader !== 'function') {
          throw new Error(
            '[sherlo] sherloAtRoot requires configPath to be set in metro.config.js so the' +
              ' Storybook entry can be bundled. Rebuild the app after adding configPath.'
          );
        }
        const storybookIndexMod = loader();
        const UserStorybookEntry = storybookIndexMod && storybookIndexMod.default;
        if (!UserStorybookEntry) {
          throw new Error(
            '[sherlo] sherloAtRoot requires ' +
              configPath +
              '/index to default-export the Storybook UI component' +
              ' (canonical Storybook RN template shape: see https://github.com/storybookjs/react-native template).' +
              ' Got module with keys: [' +
              Object.keys(storybookIndexMod || {}).join(', ') +
              ']'
          );
        }
        function SherloRootWrapperAtRoot(props: any) {
          return React.createElement(
            SherloErrorBoundary,
            null,
            React.createElement(UserStorybookEntry, props)
          );
        }
        (SherloRootWrapperAtRoot as any).displayName = 'SherloRoot(sherloAtRoot)';
        (SherloRootWrapperAtRoot as any)._sherloWrapped = true;
        diag('inner componentProvider INVOKED returning SherloRootWrapperAtRoot');
        return SherloRootWrapperAtRoot;
      }

      const Component = componentProvider();
      if (!Component || (Component as any)._sherloWrapped) return Component;
      function SherloRootWrapper(props: any) {
        return React.createElement(
          SherloErrorBoundary,
          null,
          React.createElement(Component, props)
        );
      }
      (SherloRootWrapper as any).displayName =
        'SherloRoot(' + ((Component as any).displayName || (Component as any).name || appKey) + ')';
      (SherloRootWrapper as any)._sherloWrapped = true;
      diag('inner componentProvider INVOKED returning SherloRootWrapper');
      return SherloRootWrapper;
    });
  };
  Object.defineProperty(AR, 'registerComponent', {
    configurable: true,
    enumerable: true,
    get: function () {
      diag('AR.registerComponent GETTER ACCESSED');
      return sherloRegisterComponent;
    },
    set: function (newFn: any) {
      diag('AR.registerComponent SETTER IGNORED (reassign attempted)', { newFnName: newFn && newFn.name });
      /* intentionally ignore - keep our function */
    },
  });
  diag('patch REPLACED via defineProperty');
}
