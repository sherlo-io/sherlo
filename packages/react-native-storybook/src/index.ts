export { default as addStorybookToDevMenu } from './addStorybookToDevMenu';
export { default as getStorybook } from './getStorybook';
export { default as isRunningVisualTests } from './isRunningVisualTests';
export { default as isStorybookMode } from './isStorybookMode';
export { default as openStorybook } from './openStorybook';

export * from './types';

// Signal that JS module evaluation completed. Written after all exports so it
// appears in protocol.sherlo only when the entire bundle loaded successfully.
// Gated on testing mode so it never fires in production. Wrapped in try/catch
// so any error here never breaks user imports.
try {
  const SherloModule = require('./SherloModule').default;
  if (SherloModule.getMode && SherloModule.getMode() === 'testing') {
    SherloModule.appendFile(
      'protocol.sherlo',
      JSON.stringify({ action: 'JS_EVAL_COMPLETE', timestamp: Date.now(), entity: 'app' }) + '\n'
    );
  }
} catch (_) {}
