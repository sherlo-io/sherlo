import { PROTOCOL_FILE } from './constants';

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
      PROTOCOL_FILE,
      JSON.stringify({ action: 'JS_EVAL_COMPLETE', timestamp: Date.now(), entity: 'app' }) + '\n'
    );

    if ((global as any).__sherloWithStorybookApplied === true) {
      try {
        SherloModule.appendFile(
          PROTOCOL_FILE,
          JSON.stringify({
            action: 'WITHSTORYBOOK_APPLIED',
            timestamp: Date.now(),
            entity: 'app',
          }) + '\n'
        );
      } catch (_) {}
    }
    if ((global as any).__sherloStorybookDisabledFlag === true) {
      try {
        SherloModule.appendFile(
          PROTOCOL_FILE,
          JSON.stringify({
            action: 'WITHSTORYBOOK_DISABLED',
            timestamp: Date.now(),
            entity: 'app',
          }) + '\n'
        );
      } catch (_) {}
    }
  }
}
